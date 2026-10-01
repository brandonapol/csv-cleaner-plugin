import { applyFixes, CleanerError, scanCsv } from "./engine.ts";
import { openApiDocument, pluginManifest } from "./openapi.ts";
import type { DuplicateKeep, DuplicateMode, ScanOptions, SourceEncoding } from "./types.ts";
import type { DateOrderOption } from "./types.ts";

function cors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  headers.set("access-control-allow-headers", "content-type, authorization");
  return new Response(response.body, { status: response.status, headers });
}

export function json(body: unknown, status = 200): Response {
  return cors(
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    }),
  );
}

export function preflight(): Response {
  return cors(new Response(null, { status: 204 }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringList(value: unknown, label: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new CleanerError(`${label} must be an array of strings.`);
  }
  return value;
}

function readOptions(value: unknown): ScanOptions {
  if (value === undefined) return {};
  if (!isRecord(value)) throw new CleanerError("options must be an object.");
  const options: ScanOptions = {};
  const dateOrder = value.dateOrder;
  if (dateOrder !== undefined) {
    if (dateOrder !== "auto" && dateOrder !== "mdy" && dateOrder !== "dmy" && dateOrder !== "ymd") {
      throw new CleanerError("dateOrder must be auto, mdy, dmy, or ymd.");
    }
    options.dateOrder = dateOrder as DateOrderOption;
  }
  const duplicateMode = value.duplicateMode;
  if (duplicateMode !== undefined) {
    if (duplicateMode !== "exact" && duplicateMode !== "normalized") {
      throw new CleanerError("duplicateMode must be exact or normalized.");
    }
    options.duplicateMode = duplicateMode as DuplicateMode;
  }
  const duplicateKeep = value.duplicateKeep;
  if (duplicateKeep !== undefined) {
    if (duplicateKeep !== "first" && duplicateKeep !== "last") {
      throw new CleanerError("duplicateKeep must be first or last.");
    }
    options.duplicateKeep = duplicateKeep as DuplicateKeep;
  }
  const sourceEncoding = value.sourceEncoding;
  if (sourceEncoding !== undefined) {
    if (sourceEncoding !== "utf-8" && sourceEncoding !== "windows-1252" && sourceEncoding !== "utf-16le") {
      throw new CleanerError("sourceEncoding must be utf-8, windows-1252, or utf-16le.");
    }
    options.sourceEncoding = sourceEncoding as SourceEncoding;
  }
  return options;
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new CleanerError("Request body must be JSON.");
  }
  if (!isRecord(body)) throw new CleanerError("Request body must be a JSON object.");
  if (typeof body.csv !== "string") throw new CleanerError("csv must be a string.");
  return body;
}

export async function handleScan(request: Request): Promise<Response> {
  try {
    const body = await readJson(request);
    return json(scanCsv(body.csv as string, readOptions(body.options)));
  } catch (error) {
    if (error instanceof CleanerError) return json({ error: error.message }, 400);
    console.error("[proofsheet] scan failed", error);
    return json({ error: "Scan failed." }, 500);
  }
}

export async function handleApply(request: Request): Promise<Response> {
  try {
    const body = await readJson(request);
    return json(
      applyFixes(body.csv as string, {
        csv: body.csv as string,
        accept: stringList(body.accept, "accept"),
        reject: stringList(body.reject, "reject"),
        acceptSafe: body.acceptSafe === undefined ? undefined : Boolean(body.acceptSafe),
        options: readOptions(body.options),
      }),
    );
  } catch (error) {
    if (error instanceof CleanerError) return json({ error: error.message }, 400);
    console.error("[proofsheet] apply failed", error);
    return json({ error: "Apply failed." }, 500);
  }
}

export function handleManifest(request: Request): Response {
  return json(pluginManifest(new URL(request.url).origin));
}

export function handleOpenApi(request: Request): Response {
  return cors(
    new Response(openApiDocument(new URL(request.url).origin), {
      headers: {
        "content-type": "application/yaml; charset=utf-8",
        "cache-control": "no-store",
      },
    }),
  );
}
