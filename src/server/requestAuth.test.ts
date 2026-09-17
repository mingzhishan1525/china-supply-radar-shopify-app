import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { it } from "node:test";
import { authenticateShopRequest } from "./requestAuth.ts";
import { MemorySessionStore } from "./sessionStore.ts";
import { ShopifyTokenError } from "./tokenErrors.ts";
import { createShopifyAdminClient } from "../shopify/adminClient.ts";
import { handleApiRequest } from "./api.ts";
import { MemoryVariantSnapshotStore } from "./variantSnapshotStore.ts";
import { MemorySupplyChainStore } from "./memorySupplyChainStore.ts";

const shop = "auth-fixture.myshopify.com";
const config = { apiKey: "key", apiSecret: "secret", appUrl: "https://example.com", encryptionSecret: "test-secret", scopes: ["read_products"], revenueOsPlanAmount: 29, revenueOsCurrency: "USD" };
function header(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const parts = [ { alg: "HS256" }, { aud: "key", iss: `https://${shop}/admin`, dest: `https://${shop}`, nbf: now - 1, exp: now + 60, ...overrides } ].map(x => Buffer.from(JSON.stringify(x)).toString("base64url"));
  const message = parts.join(".");
  return `Bearer ${message}.${createHmac("sha256", "secret").update(message).digest("base64url")}`;
}
async function installed() {
  const store = new MemorySessionStore();
  await store.save({ shop, accessToken: "offline", scope: "read_products" });
  return store;
}
it("rejects missing, invalid, expired, wrong audience/issuer, and cross-shop tokens before side effects", async () => {
  const store = await installed();
  for (const authorization of [null, "Bearer invalid", header({ exp: 1 }), header({ aud: "other" }), header({ iss: "https://other.myshopify.com/admin" }), header({ dest: "http://auth-fixture.myshopify.com" }), header({ nbf: undefined })]) {
    await assert.rejects(authenticateShopRequest(shop, authorization, config, store), (e: unknown) => e instanceof ShopifyTokenError && e.status === 401);
  }
  await assert.rejects(authenticateShopRequest("other.myshopify.com", header(), config, store));
  for (const [method,path] of [["GET","/api/shop"],["POST","/api/extension/link-code"],["POST","/api/sync/products"]]) {
    const response = await handleApiRequest(method,path,new URLSearchParams({shop}), {config,sessionStore:store,prisma:new MemoryVariantSnapshotStore(),supplyChain:new MemorySupplyChainStore()});
    assert.equal(response.status,401);
  }
});
it("reuses cached offline sessions with zero token exchange calls", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("unexpected network"); };
  try {
    const store = await installed();
    await Promise.all(Array.from({length:5},()=>authenticateShopRequest(shop,header(),config,store)));
    assert.equal(calls,0);
  } finally {globalThis.fetch=original;}
});
it("bootstraps managed installation once for concurrent authenticated requests and records granted scopes", async () => {
  const original=globalThis.fetch; let calls=0;
  globalThis.fetch=async()=>{calls++;await new Promise(r=>setTimeout(r,5));return Response.json({access_token:"new",scope:"read_products,read_orders"});};
  try {
    const store=new MemorySessionStore();
    const results=await Promise.all(Array.from({length:5},()=>authenticateShopRequest(shop,header(),config,store)));
    assert.equal(calls,1);assert.equal(results[0].session.scope,"read_products,read_orders");
  } finally {globalThis.fetch=original;}
});
it("maps rejected token exchange to retryable authentication response and network failure to 503",async()=>{
  const original=globalThis.fetch;
  try {
    for (const [status,code] of [[400,401],[503,503]]) {
      globalThis.fetch=async()=>new Response("",{status});
      await assert.rejects(authenticateShopRequest(shop,header(),config,new MemorySessionStore()),(e:unknown)=>e instanceof ShopifyTokenError&&e.status===code);
    }
    globalThis.fetch=async()=>{throw new TypeError("network");};
    await assert.rejects(authenticateShopRequest(shop,header(),config,new MemorySessionStore()),(e:unknown)=>e instanceof ShopifyTokenError&&e.status===503);
  }finally{globalThis.fetch=original;}
});
it("recovers an explicitly rejected offline token once, without retrying ambiguous mutations",async()=>{
  const original=globalThis.fetch;let exchanges=0;let requests=0;
  globalThis.fetch=async()=>{exchanges++;return Response.json({access_token:"renewed",scope:"read_products"});};
  try {
    const {store}=await authenticateShopRequest(shop,header(),config,await installed());
    const client=await createShopifyAdminClient(shop,store,{fetchImpl:async(_url,init)=>{
      requests++;if(requests===1)return new Response("",{status:401});
      assert.equal((init?.headers as Record<string,string>)["X-Shopify-Access-Token"],"renewed");
      return Response.json({data:{ok:true}});
    }});
    assert.deepEqual(await client.graphql("query {shop{id}}"),{ok:true});assert.equal(requests,2);assert.equal(exchanges,1);
    const failed=await createShopifyAdminClient(shop,store,{fetchImpl:async()=>{requests++;return new Response("",{status:500});}});
    await assert.rejects(failed.graphql("mutation { appSubscriptionCreate { id } }"));
    assert.equal(requests,3);assert.equal(exchanges,1);
  }finally{globalThis.fetch=original;}
});
