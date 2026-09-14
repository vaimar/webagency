# Spec: `/api/spots/pois` returns results exactly once, then empty for 7 days

**Repo to change:** `slumber` (backend). No webagency change is required for the primary fix.
**File:** `src/main/java/com/slumber/escape/slumber/service/SpotPoiService.java`
**Found:** 2026-08-19, while fixing the restaurants UI in webagency.
**Severity:** High — the nearby-restaurants feature is effectively non-functional for every user after the first.

---

## Symptom

The Restaurants tab on a spot page (and the Restaurants/Shops map layers) show results once and then never again. To a user it looks like the feature is broken at random: a spot that listed a dozen restaurants yesterday lists none today, permanently.

## Root cause

The cache **writes one JSON shape and reads another**, so every cache hit parses to an empty list.

`cacheResult` serialises the parsed DTOs — a JSON **array**:

```java
String json = objectMapper.writeValueAsString(pois);
// [{"id":123,"name":"Le Bistro","lat":49.89,"lon":2.29,"kind":"restaurant"}, ...]
```

`parsePoisFromJson` reads that back and hands it to `parsePoisFromNode`, which expects the **raw Overpass envelope**:

```java
private List<Poi> parsePoisFromNode(JsonNode root) {
    for (JsonNode element : root.path("elements")) {   // <-- root is an ARRAY here
        String name = element.path("tags").path("name").asText(null);
        ...
```

`ArrayNode.path("elements")` returns a `MissingNode`, which iterates zero times. The loop body never runs and the method returns `List.of()`.

The mismatch is twofold — even if the container matched, the cached objects use flat `name`/`kind` fields while `parsePoisFromNode` reads `tags.name` and `tags.shop`.

**Net effect:** cache miss → real results; every subsequent hit for 7 days → `[]`.

## Evidence

A coordinate never queried before (Amiens city centre):

```bash
# Call 1 — cache miss, hits Overpass
curl -s "http://localhost:9090/api/spots/pois?lat=49.8942&lon=2.2957" | jq length
# 312    (15.8 s)

# Call 2 — cache hit, same coordinate
curl -s "http://localhost:9090/api/spots/pois?lat=49.8942&lon=2.2957" | jq length
# 0      (0.03 s)
```

The sub-100 ms response on call 2 confirms it is served from cache, not from a failed Overpass call.

## The fix

Cache the **Overpass envelope**, not the parsed DTOs, so the write and read shapes agree and there is exactly one parser:

```java
private void cacheResult(String cacheKey, JsonNode overpassRoot) {
    ...
    entry.setResponseBody(objectMapper.writeValueAsString(overpassRoot));
    ...
}
```

and have `fetchFromOverpass` hand the raw node to both `parsePoisFromNode` and `cacheResult`.

The alternative — serialise DTOs and read them back with
`objectMapper.readValue(json, new TypeReference<List<Poi>>() {})` — also works, but needs a
Jackson-visible constructor on `Poi` and leaves two parsers to keep in step. Prefer caching the
envelope; it is the raw upstream response, which is what the `CachedApiResponse` table is for.

### Regression test

The bug is invisible to any test that only calls the service once. The test must assert on the **second** call:

```java
@Test
void aSecondCallForTheSameCoordinateReturnsTheSamePoisFromCache() {
    when(overpass.runInteractive(anyString())).thenReturn(overpassJsonWith(3));

    List<Poi> first  = service.getNearbyPois(49.8942, 2.2957);
    List<Poi> second = service.getNearbyPois(49.8942, 2.2957);

    assertThat(first).hasSize(3);
    assertThat(second).containsExactlyElementsOf(first);   // failed before the fix: second was empty
    verify(overpass, times(1)).runInteractive(anyString()); // and prove it really was cached
}
```

---

## Secondary issues found in the same file

These are worth fixing while it is open, but are not the cause of the reported symptom.

### 1. An empty Overpass answer is cached as truth for 7 days

```java
List<Poi> pois = fetchFromOverpass(lat, lon);
cacheResult(cacheKey, pois);          // caches [] for 7 days
```

A loaded Overpass mirror answers `HTTP 200` with an empty `elements` array — indistinguishable from
a genuinely empty area. This exact hazard is already handled for the station lookup in
`SpotArrivalService`, which is the pattern to copy:

```java
// SpotArrivalService.java:58
private static final Duration NO_STATION_TTL = Duration.ofHours(1);

// SpotArrivalService.java:304 — found results never expire, "found nothing" expires in an hour
station != null ? Long.MAX_VALUE : System.nanoTime() + NO_STATION_TTL.toNanos()
```

Apply the same split here:

```java
long ttl = pois.isEmpty() ? EMPTY_RESULT_TTL_HOURS : CACHE_TTL_HOURS;   // 1 vs 168
```

Without this, one unlucky mirror poisons a coordinate for a week — and the client's retry button
cannot help, because the backend answers instantly from cache.

### 2. A hard failure is returned as an empty list

```java
} catch (IOException ex) {
    log.warn(...);
    return List.of();      // caller sees 200 [] — same as "no restaurants here"
}
```

The client cannot distinguish "this area has nothing" from "the lookup broke", so it cannot offer a
retry or an honest message. Prefer letting the exception surface as a 502/503 via `ApiException`, or
returning a small envelope carrying a status. **If this changes, webagency needs a matching change** —
`fetchNearbyPois` in `src/services/mapMarkers.ts` currently treats any non-2xx as an error, which is
already the right behaviour for a 502.

### 3. `radiusM` is accepted by nobody

`SpotController.getPoisByCoordinates` takes only `lat` and `lon`; the radius is the hardcoded
constant `POI_RADIUS_M = 5000`. webagency sends `radiusM=5000` on every request (it matches the
constant, so nothing is currently wrong — the parameter is simply ignored).

If radius becomes a real parameter, **the cache key must include it**, or a 2 km query will be served
the cached 5 km result:

```java
private String makeCacheKey(double lat, double lon, int radiusM) {
    return CACHE_CATEGORY + ":" + fmt(lat) + "," + fmt(lon) + ":" + radiusM;
}
```

Until then, either add the parameter or drop it from the client — an ignored parameter that looks
meaningful is worse than none.

---

## Verifying the fix

```bash
# Pick a coordinate you have not queried before, then run twice.
LAT=48.5734; LON=7.7521
curl -s "http://localhost:9090/api/spots/pois?lat=$LAT&lon=$LON" | jq length
curl -s "http://localhost:9090/api/spots/pois?lat=$LAT&lon=$LON" | jq length
# Both counts must match, and the second must return in well under a second.
```

In the UI: open a spot with restaurants nearby (Amiens Cable Park is a good one), switch to
Restaurants, then navigate to another spot and back. The list must survive the round trip.

## What was already fixed on the webagency side

The client no longer hides any of this, so the backend fix will be visible immediately:

- `src/hooks/useNearbyPois.ts` — distinguishes loading / found-none / failed, keyed on coordinates,
  with retry and stale-response cancellation.
- `src/services/mapMarkers.ts` — `fetchNearbyPois` throws instead of swallowing errors, and has a
  20 s timeout (plain `fetch` has none; Overpass cold calls were measured at 10–16 s).
- `src/SpotDetailPage.tsx`, `src/SpotFinder.tsx` — four distinct states instead of a permanent
  "Looking for restaurants nearby...".
