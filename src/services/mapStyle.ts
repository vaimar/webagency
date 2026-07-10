// Single source of truth for the MapTiler vector style URL. Replaces the raw
// tile.openstreetmap.org raster tiles across the app (OSM's tile-usage policy
// forbids production/commercial load on that server — real IP-ban risk — and
// vector tiles render on the GPU instead of stitching PNGs on the main thread).

const MAPTILER_KEY = (process.env.REACT_APP_MAPTILER_KEY ?? '').trim();

// MapTiler's built-in dark "Backdrop" style — hillshaded terrain, minimal
// labels, reads as a premium tech-sports dashboard rather than a road atlas.
const DEFAULT_STYLE_ID = (process.env.REACT_APP_MAPTILER_STYLE ?? 'backdrop-dark').trim();

// Real fallback (not the near-blank maplibre demo tiles, which draw almost no
// roads/buildings): OpenFreeMap is a free, keyless, unlimited public vector
// tile service — donation-funded, itself built on Protomaps/PMTiles — so the
// map still shows full road/building detail with zero signup when no MapTiler
// key is configured, e.g. in preview/CI or before a key is provisioned.
const NO_KEY_FALLBACK_STYLE = 'https://tiles.openfreemap.org/styles/dark';

export const hasMapTilerKey = (): boolean => MAPTILER_KEY.length > 0;

export const getMapStyleUrl = (): string => (
    hasMapTilerKey()
        ? `https://api.maptiler.com/maps/${DEFAULT_STYLE_ID}/style.json?key=${MAPTILER_KEY}`
        : NO_KEY_FALLBACK_STYLE
);
