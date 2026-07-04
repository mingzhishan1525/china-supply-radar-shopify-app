import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import { getAppConfig } from "./config.ts";
import {
  buildOAuthStartUrl,
  handleOAuthCallback,
  MemoryOAuthStateStore,
} from "./oauth.ts";
import { handleApiRequest } from "./api.ts";
import { createStores } from "./stores.ts";
import { 
  handleAppUninstalledWebhook,
  handleCustomersDataRequestWebhook,
  handleCustomersRedactWebhook,
  handleShopRedactWebhook
} from "./webhooks.ts";

const config = loadConfigOrExit();
console.log("[FIX REQUIRED] Switch billing model to App-Managed Billing in Shopify Partner Dashboard");
const stateStore = new MemoryOAuthStateStore();
const { sessionStore, variantStore, supplyChainStore } = await createStores(config);
const distDir = resolve(process.cwd(), "dist");

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url || "/", config.appUrl);

    if (request.method === "GET" && requestUrl.pathname === "/auth") {
      const shopDomain = requestUrl.searchParams.get("shop");

      if (!shopDomain) {
        throw new Error("Missing shop parameter");
      }

      const redirectUrl = await buildOAuthStartUrl(shopDomain, config, stateStore);
      response.writeHead(302, { Location: redirectUrl });
      response.end();
      return;
    }

    if (
      request.method === "GET" &&
      (requestUrl.pathname === "/api/auth/callback" || requestUrl.pathname === "/auth/callback")
    ) {
      const result = await handleOAuthCallback(
        requestUrl.toString(),
        config,
        stateStore,
        sessionStore,
      );
      response.writeHead(302, { Location: result.redirectTo });
      response.end();
      return;
    }

    // Webhook routes
    if (request.method === "POST") {
      const rawBody = await readBody(request);
      const headers = new Headers(request.headers as HeadersInit);
      
      try {
        if (requestUrl.pathname === "/webhooks/app/uninstalled") {
          await handleAppUninstalledWebhook(rawBody, headers, config, sessionStore, [
            variantStore,
            supplyChainStore,
          ]);
          response.writeHead(200);
          response.end("ok");
          return;
        }

        if (requestUrl.pathname === "/webhooks/gdpr/customers_data_request") {
          await handleCustomersDataRequestWebhook(rawBody, headers, config);
          response.writeHead(200);
          response.end("ok");
          return;
        }

        if (requestUrl.pathname === "/webhooks/gdpr/customers_redact") {
          await handleCustomersRedactWebhook(rawBody, headers, config);
          response.writeHead(200);
          response.end("ok");
          return;
        }

        if (requestUrl.pathname === "/webhooks/gdpr/shop_redact") {
          await handleShopRedactWebhook(rawBody, headers, config, sessionStore, [
            variantStore,
            supplyChainStore,
          ]);
          response.writeHead(200);
          response.end("ok");
          return;
        }
      } catch (webhookError) {
        const message = webhookError instanceof Error ? webhookError.message : "Webhook failed";
        if (message.includes("HMAC verification failed")) {
          response.writeHead(401, { "Content-Type": "text/plain" });
          response.end("Unauthorized: Invalid HMAC");
          return;
        }
        // For other webhook errors, still return 200 to avoid Shopify retries
        console.error(`[WEBHOOK_ERROR] ${message}`, webhookError);
        response.writeHead(200);
        response.end("ok");
        return;
      }
    }

    if (requestUrl.pathname.startsWith("/api/")) {
      const body = await readJsonBody(request);
      const apiResponse = await handleApiRequest(
        request.method || "GET",
        requestUrl.pathname,
        requestUrl.searchParams,
        {
          sessionStore,
          prisma: variantStore,
          supplyChain: supplyChainStore,
          config,
          authorizationHeader: request.headers.authorization || null,
        },
        body,
      );
      response.writeHead(apiResponse.status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(apiResponse.body));
      return;
    }

    if (request.method === "GET" || request.method === "HEAD") {
      const staticResponse = await readStaticAsset(requestUrl.pathname);

      if (staticResponse) {
        response.writeHead(staticResponse.status, { "Content-Type": staticResponse.contentType });

        if (request.method === "HEAD") {
          response.end();
          return;
        }

        response.end(staticResponse.body);
        return;
      }
    }

    response.writeHead(404, { "Content-Type": "text/plain" });
    response.end("Not found");
  } catch (error) {
    const requestUrl = new URL(request.url || "/", config.appUrl);
    const message = error instanceof Error ? error.message : "Request failed";

    if (requestUrl.pathname.startsWith("/api/")) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "bad_request", message }));
      return;
    }

    response.writeHead(400, { "Content-Type": "text/plain" });
    response.end(message);
  }
});

const port = Number(process.env.PORT || 3001);

server.listen(port, () => {
  console.log(`Shopify App backend listening on port ${port}`);
});

function loadConfigOrExit() {
  try {
    return getAppConfig();
  } catch (error) {
    console.error(
      `Configuration error: ${error instanceof Error ? error.message : "Invalid environment"}`,
    );
    process.exit(1);
  }
}

async function readJsonBody(request: NodeJS.ReadableStream): Promise<unknown> {
  const method = "method" in request ? String(request.method || "GET") : "GET";

  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return {};
  }

  const rawBody = await readBody(request);

  if (!rawBody.trim()) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new Error("Invalid JSON request body");
  }
}

function readBody(request: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("error", reject);
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

async function readStaticAsset(pathname: string): Promise<{
  status: number;
  contentType: string;
  body: Buffer;
} | null> {
  const normalizedPath = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const requestedPath = normalizedPath === "/" ? "/index.html" : normalizedPath;
  const assetPath = join(distDir, requestedPath);
  const relativeAssetPath = relative(distDir, assetPath);

  if (relativeAssetPath.startsWith("..") || isAbsolute(relativeAssetPath)) {
    return null;
  }

  try {
    return {
      status: 200,
      contentType: contentTypeFor(assetPath),
      body: await readFile(assetPath),
    };
  } catch {
    if (pathname.startsWith("/assets/")) {
      return null;
    }

    try {
      return {
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: await readFile(join(distDir, "index.html")),
      };
    } catch {
      return null;
    }
  }
}

function contentTypeFor(filePath: string): string {
  switch (extname(filePath)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".svg":
      return "image/svg+xml";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}
