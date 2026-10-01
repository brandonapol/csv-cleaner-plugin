import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { handleApply, handleManifest, handleOpenApi, handleScan, json, preflight } from "./lib/http.ts";

const port = Number(process.env.PORT || 8787);
const logo = readFileSync(new URL("./public/logo.svg", import.meta.url));

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 800_000) {
        const error = new Error("Request body is too large.");
        error.status = 413;
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  try {
    const host = req.headers.host || `127.0.0.1:${port}`;
    const forwarded = req.headers["x-forwarded-proto"];
    const proto = (Array.isArray(forwarded) ? forwarded[0] : forwarded || "http").split(",")[0].trim();
    const url = new URL(req.url || "/", `${proto}://${host}`);
    const method = req.method || "GET";
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") headers.set(key, value);
      else if (Array.isArray(value)) headers.set(key, value.join(", "));
    }
    const hasBody = method !== "GET" && method !== "HEAD";
    const request = new Request(url, {
      method,
      headers,
      body: hasBody ? await readBody(req) : undefined,
      duplex: "half",
    });

    let response;
    if (method === "OPTIONS" && (url.pathname === "/v1/scan" || url.pathname === "/v1/apply")) {
      response = preflight();
    } else if (url.pathname === "/health" && method === "GET") {
      response = json({ ok: true, name: "proofsheet" });
    } else if (url.pathname === "/.well-known/ai-plugin.json" && method === "GET") {
      response = handleManifest(request);
    } else if (url.pathname === "/openapi.yaml" && method === "GET") {
      response = handleOpenApi(request);
    } else if (url.pathname === "/logo.svg" && method === "GET") {
      response = new Response(logo, { headers: { "content-type": "image/svg+xml" } });
    } else if (url.pathname === "/v1/scan" && method === "POST") {
      response = await handleScan(request);
    } else if (url.pathname === "/v1/apply" && method === "POST") {
      response = await handleApply(request);
    } else if (url.pathname === "/" && method === "GET") {
      response = new Response(
        "Proofsheet CSV cleaner.\nManifest: /.well-known/ai-plugin.json\nSchema: /openapi.yaml\n",
        { headers: { "content-type": "text/plain; charset=utf-8" } },
      );
    } else {
      response = json({ error: "Not found." }, 404);
    }

    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    const status = error && error.status === 413 ? 413 : 500;
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: status === 413 ? "Request body is too large." : "Request failed." }));
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Proofsheet listening on ${port}`);
});
