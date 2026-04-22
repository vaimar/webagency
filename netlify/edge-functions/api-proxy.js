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

const RAILWAY_BASE = "https://slumber-production.up.railway.app";

export default async (request, context) => {
  const url = new URL(request.url);

  // Build target URL on Railway — preserve path and query string
  const target = `${RAILWAY_BASE}${url.pathname}${url.search}`;

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
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Proxy error", detail: String(err) }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  // Re-expose CORS headers to the browser so the SPA can read the response
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.set("Access-Control-Allow-Origin", "*");
  responseHeaders.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  responseHeaders.set("Access-Control-Allow-Headers", "Content-Type, X-XSRF-TOKEN, Authorization");

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

