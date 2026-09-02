/**
 * Netlify Edge Function — server-side proxy for Railway backend.
 *
 * Why this exists:
 *   The Railway Spring Boot backend has no CORS headers configured, so any
 *   browser request with an `Origin` header gets rejected with 403
 *   "Invalid CORS request".  A CDN-level [[redirects]] rule still forwards the
 *   browser's Origin header, so it doesn't help.
 *
 *   An Edge Function runs on Netlify's servers.  It forwards the request to
 *   Railway WITHOUT an Origin header (server-to-server), bypassing CORS
 *   entirely, then returns the Railway response to the browser.
 */

import { classifyPath, clientKey, consume } from "./rate-limit.js";

const RAILWAY_BASE = "https://slumber-production.up.railway.app";

export default async (request, _context) => {
  const url = new URL(request.url);

  // Shed load before touching the backend: an over-limit caller must not be
  // able to spend upstream quota just because the proxy forwarded first.
  const decision = consume(clientKey(request), classifyPath(url.pathname));
  if (!decision.allowed) {
    return new Response(
      JSON.stringify({
        error: "Too many requests",
        detail: "This endpoint is rate limited. Please retry shortly.",
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(decision.retryAfterSeconds),
        },
      },
    );
  }
  const backendPath = url.pathname === "/api/accounts/logout" ? "/logout" : url.pathname;

  // Build target URL on Railway — preserve path and query string
  const target = `${RAILWAY_BASE}${backendPath}${url.search}`;

  // Copy request headers but strip browser-specific ones that would trigger
  // CORS rejection on the backend.
  const headers = new Headers(request.headers);
  headers.delete("origin");
  headers.delete("referer");
  headers.delete("host");

  // Forward the request body for POST / PUT / PATCH
  const hasBody = !["GET", "HEAD"].includes(request.method.toUpperCase());

  let upstream;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      // Edge functions support streaming, so we can pass the body directly
      duplex: hasBody ? "half" : undefined,
      redirect: url.pathname === "/api/accounts/logout" ? "manual" : "follow",
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Proxy error", detail: String(err) }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  // CORS. This proxy is same-origin with the app in production, so the browser
  // needs no CORS headers at all for the normal path. The previous wildcard
  // meant any website could read this API cross-origin; echoing only our own
  // origin keeps the same-origin case working and closes that.
  const responseHeaders = new Headers(upstream.headers);
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin && requestOrigin === url.origin) {
    responseHeaders.set("Access-Control-Allow-Origin", requestOrigin);
    responseHeaders.set("Access-Control-Allow-Credentials", "true");
    responseHeaders.set("Vary", "Origin");
    responseHeaders.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    responseHeaders.set("Access-Control-Allow-Headers", "Content-Type, X-XSRF-TOKEN, X-Request-Id, Authorization");
  }

  responseHeaders.set("X-RateLimit-Remaining", String(decision.remaining));

  if (url.pathname === "/api/accounts/logout") {
    responseHeaders.set("Content-Type", "application/json");
    return new Response(JSON.stringify({ message: "Logout successful" }), {
      status: upstream.status >= 200 && upstream.status < 400 ? 200 : upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
};

// Intercept all /api/* and /actuator/* paths
export const config = {
  path: ["/api/*", "/actuator/*"],
};

