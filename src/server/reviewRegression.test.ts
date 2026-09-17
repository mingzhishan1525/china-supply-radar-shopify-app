import assert from "node:assert/strict";
import { it } from "node:test";
import { createHmac } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { syncProductsForShop, ProductSyncError } from "./productSync.ts";
import { syncOrdersAndSalesVelocityForShop } from "./ordersSync.ts";
import { MemorySessionStore } from "./sessionStore.ts";
import { MemoryVariantSnapshotStore } from "./variantSnapshotStore.ts";
import { MemorySupplyChainStore } from "./memorySupplyChainStore.ts";
import { handleAppUninstalledWebhook } from "./webhooks.ts";
import { createProSubscriptionApprovalUrl } from "./billing.ts";
import { embeddedAppUrl } from "./billingReturn.ts";
const shop="review-fixture.myshopify.com";
const config={apiKey:"key",apiSecret:"secret",appUrl:"https://example.com",encryptionSecret:"test-secret",scopes:["read_products"],revenueOsPlanAmount:29,revenueOsCurrency:"USD"};
const page=(hasNextPage=false,endCursor:string|null=null)=>({hasNextPage,endCursor});
const variant=(i:number)=>({id:`gid://shopify/ProductVariant/${i}`,title:`Variant ${i}`,sku:`SKU-${i}`,price:"1.00",inventoryQuantity:10});
const product=(i:number)=>({id:`gid://shopify/Product/${i}`,title:`Product ${i}`,variants:{nodes:[variant(i)],pageInfo:page()}});
it("syncs product and nested variant pages beyond the first fifty",async()=>{
 const prisma=new MemoryVariantSnapshotStore();let calls=0;
 const result=await syncProductsForShop(shop,{sessionStore:new MemorySessionStore(),prisma,graphqlClient:{shop,graphql:async<T>(query:string,vars?:Record<string,unknown>)=>{
   calls++;
   if(query.includes("ProductVariantsPage")){assert.equal(vars?.after,"v50");return {product:{variants:{nodes:[variant(1001)],pageInfo:page()}}} as T;}
   if(!vars?.after){const products=Array.from({length:50},(_,i)=>product(i));products[0].variants={nodes:Array.from({length:50},(_,i)=>variant(100+i)),pageInfo:page(true,"v50")};return{products:{nodes:products,pageInfo:page(true,"p50")}}as T;}
   assert.equal(vars.after,"p50");return{products:{nodes:[product(51)],pageInfo:page()}}as T;
 }}});
 assert.equal(calls,3);assert.equal(result.syncedCount,101);assert.equal((await prisma.variantSnapshot.findMany({where:{shop}})).length,101);
});
it("reports total and partial write failures, with no successful sync timestamp",async()=>{
 for(const fails of [1,2]){
  const prisma=new MemoryVariantSnapshotStore();const original=prisma.variantSnapshot.upsert;let writes=0;
  prisma.variantSnapshot.upsert=async(args)=>{if(++writes<=fails)throw new Error("database unavailable");return original(args);};
  await assert.rejects(syncProductsForShop(shop,{sessionStore:new MemorySessionStore(),prisma,graphqlClient:{shop,graphql:async<T>()=>({products:{nodes:[product(1),product(2)],pageInfo:page()}}as T)}}),(e:unknown)=>{
   assert.ok(e instanceof ProductSyncError);assert.equal(e.errorCount,fails);assert.equal(e.syncedCount,2-fails);assert.equal("lastSyncedAt" in e,false);return true;
  });
 }
});
it("detects a repeated cursor rather than silently truncating or looping forever",async()=>{
 let calls=0;
 await assert.rejects(syncProductsForShop(shop,{sessionStore:new MemorySessionStore(),prisma:new MemoryVariantSnapshotStore(),graphqlClient:{shop,graphql:async<T>()=>{calls++;return {products:{nodes:[],pageInfo:page(true,"same")}}as T;}}}),/pagination cursor/);
 assert.equal(calls,2);
});
it("counts line item pages beyond 100 and resets previous velocity to zero on an empty window",async()=>{
 const store=new MemorySessionStore();await store.save({shop,accessToken:"test",scope:"read_orders"});
 const prisma=new MemorySupplyChainStore();prisma.addVariant({shop,shopifyProductId:"p1",shopifyVariantId:"v1",title:"Widget",productTitle:"Widget",sku:"SKU",price:"1",inventoryQuantity:10,shopifyUpdatedAt:null});
 let empty=false;let detailCalls=0;
 const run=()=>syncOrdersAndSalesVelocityForShop(shop,{sessionStore:store,prisma,now:new Date("2026-09-17T00:00:00Z"),graphqlClient:{shop,graphql:async<T>(query:string)=>{
  if(query.includes("OrderLineItemsPage")){detailCalls++;return {order:{lineItems:{nodes:[{variant:{id:"v1"},quantity:7}],pageInfo:page()}}}as T;}
  return{orders:{pageInfo:page(),nodes:empty?[]:[{id:"o1",createdAt:"2026-09-16T00:00:00Z",cancelledAt:null,lineItems:{nodes:Array.from({length:100},()=>({variant:{id:"v1"},quantity:1})),pageInfo:page(true,"l100")}}]}}as T;
 }}});
 const first=await run();assert.equal(first.lineItemsScanned,101);assert.equal(detailCalls,1);assert.equal((await prisma.salesVelocity.findMany({where:{shop}}))[0].unitsSold,107);
 empty=true;const second=await run();assert.equal(second.ordersScanned,0);assert.equal(second.variantsUpdated,1);assert.equal((await prisma.salesVelocity.findMany({where:{shop}}))[0].estimatedDailySales,0);
});
function headers(triggeredAt?:string){const raw="{}";return new Headers({"x-shopify-shop-domain":shop,"x-shopify-hmac-sha256":createHmac("sha256",config.apiSecret).update(raw).digest("base64"),...(triggeredAt?{"x-shopify-triggered-at":triggeredAt}:{})});}
it("uninstall cleanup completes without waiting for telemetry; duplicate delivery is safe",async()=>{
 const store=new MemorySessionStore();await store.save({shop,accessToken:"test",scope:"read_products"});let cleaned=0;let finish!:()=>void;
 const analytics=new Promise<void>(r=>{finish=r;});
 const cleanup=[{variantSnapshot:{deleteMany:async()=>{cleaned++;return{count:1};}}}];
 const start=performance.now();
 await handleAppUninstalledWebhook("{}",headers(),config,store,cleanup,()=>analytics,()=>analytics);
 assert.ok(performance.now()-start<500);assert.equal(await store.peek(shop),null);assert.equal(cleaned,1);
 await handleAppUninstalledWebhook("{}",headers(),config,store,cleanup,async()=>{},async()=>{});assert.equal(cleaned,2);finish();
});
it("propagates cleanup failures and preserves a newer installation on delayed uninstall",async()=>{
 const store=new MemorySessionStore();await store.save({shop,accessToken:"new",scope:"read_products",installedAt:"2026-09-17T12:00:00Z"});
 let calls=0;const cleanup=[{variantSnapshot:{deleteMany:async()=>{calls++;throw new Error("database offline");}}}];
 await handleAppUninstalledWebhook("{}",headers("2026-09-17T11:00:00Z"),config,store,cleanup,async()=>{},async()=>{});assert.equal(calls,0);assert.equal((await store.peek(shop))?.accessToken,"new");
 await assert.rejects(handleAppUninstalledWebhook("{}",headers("2026-09-17T13:00:00Z"),config,store,cleanup,async()=>{},async()=>{}),/database offline/);
});
it("migration failure stops startup instead of launching the backend",()=>{
 const dir=mkdtempSync(join(tmpdir(),"csr-start-"));
 try{
  writeFileSync(join(dir,"prisma"),"#!/bin/sh\nexit 42\n",{mode:0o755});
  writeFileSync(join(dir,"node"),"#!/bin/sh\necho BACKEND_STARTED\n",{mode:0o755});
  const pkg=JSON.parse(readFileSync(new URL("../../package.json",import.meta.url),"utf8"));
  const run=spawnSync("/bin/sh",["-c",pkg.scripts.start],{env:{...process.env,PATH:`${dir}:/usr/bin:/bin`,RUN_DB_MIGRATIONS:"1"},encoding:"utf8"});
  assert.equal(run.status,42);assert.equal(run.stdout.includes("BACKEND_STARTED"),false);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
it("uses test charges only for verified development stores or explicit test environment",async()=>{
 const saved=process.env.SHOPIFY_BILLING_TEST;delete process.env.SHOPIFY_BILLING_TEST;
 try{for(const dev of [true,false]){
  let testFlag:unknown;
  await createProSubscriptionApprovalUrl(shop,config,new MemorySessionStore(),{shop,graphql:async<T>(query:string,vars?:Record<string,unknown>)=>{
   if(query.includes("BillingShopPlan"))return{shop:{plan:{partnerDevelopment:dev}}}as T;
   testFlag=vars?.test;return{appSubscriptionCreate:{confirmationUrl:"https://example.com/approve",appSubscription:{id:"1",status:"PENDING"},userErrors:[]}}as T;
  }});assert.equal(testFlag,dev);
 }}finally{if(saved===undefined)delete process.env.SHOPIFY_BILLING_TEST;else process.env.SHOPIFY_BILLING_TEST=saved;}
 assert.equal(embeddedAppUrl(shop,config),`https://${shop}/admin/apps/key`);
 assert.throws(()=>embeddedAppUrl("evil.example",config));
});
