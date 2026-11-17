import { corsHeaders } from "./cors.ts";

/** Error carrying an HTTP status + machine code; rendered by `errorResponse`. */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/**
 * Renders any thrown value as `{ ok:false, code, message, ...extra }`.
 * Unknown errors become 500 INTERNAL without leaking internals.
 */
export function errorResponse(
  req: Request,
  err: unknown,
  fn = "edge",
  defaults: Record<string, unknown> = {},
): Response {
  if (err instanceof HttpError) {
    return json(req, { ok: false, ...defaults, code: err.code, message: err.message, ...err.extra }, err.status);
  }
  console.error(`[${fn}] unhandled error:`, err instanceof Error ? err.stack ?? err.message : err);
  return json(
    req,
    { ok: false, ...defaults, code: "INTERNAL", message: "Cilad gudaha ah ayaa dhacday.", message_en: "Internal server error." },
    500,
  );
}

/** Parses a JSON object body or throws 400. */
export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "BAD_REQUEST", "Codsiga waa khalad (JSON).", { message_en: "Invalid JSON body." });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "BAD_REQUEST", "Codsiga waa khalad.", { message_en: "Body must be a JSON object." });
  }
  return body as T;
}

export const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
