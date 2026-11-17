// CORS helpers for browser-invoked Edge Functions.
// Set ALLOWED_ORIGINS="https://shop.example.com,https://admin.example.com"
// to restrict origins; defaults to "*" (JWT is still required).

const allowList = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function corsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get("Origin") ?? "";
  const allowOrigin = allowList.length === 0 ? "*" : allowList.includes(origin) ? origin : allowList[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    ...(allowList.length ? { Vary: "Origin" } : {}),
  };
}

/** Returns a preflight response for OPTIONS requests, otherwise null. */
export function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  return null;
}
