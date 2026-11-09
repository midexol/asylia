import { NextResponse, type NextRequest } from "next/server";
import { clientIp, createLimiter } from "@/lib/ratelimit";

const MINUTE = 60_000;

// Tightest on the routes that spend something: the vault seal pays NEAR testnet gas, rescue
// prepares read many transactions, and scans fan out to several chains.
const take = createLimiter([
  { prefix: "/api/vault/seal", limit: 3, windowMs: MINUTE },
  { prefix: "/api/vault/seal", limit: 15, windowMs: 60 * MINUTE },
  { prefix: "/api/rescue/", limit: 10, windowMs: MINUTE },
  { prefix: "/api/scan", limit: 20, windowMs: MINUTE },
  { prefix: "/api/near/keys", limit: 30, windowMs: MINUTE },
  { prefix: "/api/watch/status", limit: 30, windowMs: MINUTE },
  { prefix: "/api/", limit: 60, windowMs: MINUTE },
]);

// Largest body each route needs. A signed rescue can carry hundreds of inputs.
const MAX_BODY: [string, number][] = [
  ["/api/vault/seal", 80_000],
  ["/api/rescue/", 512_000],
  ["/api/", 16_000],
];

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const max = MAX_BODY.find(([p]) => path.startsWith(p))?.[1];
  const length = Number(req.headers.get("content-length") ?? 0);
  if (max && length > max) {
    return NextResponse.json({ error: "That request is too large." }, { status: 413 });
  }

  const v = take(path, clientIp(req.headers));
  if (v && !v.ok) {
    return NextResponse.json(
      { error: `Too many requests. Try again in ${v.retryAfterS} seconds.` },
      { status: 429, headers: { "retry-after": String(v.retryAfterS), "x-ratelimit-limit": String(v.limit), "x-ratelimit-remaining": "0" } },
    );
  }
  const res = NextResponse.next();
  if (v) {
    res.headers.set("x-ratelimit-limit", String(v.limit));
    res.headers.set("x-ratelimit-remaining", String(v.remaining));
  }
  return res;
}

export const config = { matcher: "/api/:path*" };
