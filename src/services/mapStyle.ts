import type { StyleSpecification } from 'maplibre-gl';
import { readEnv } from './env';
import { googleMapStyle } from './googleMapStyle';

const MAPTILER_KEY = (readEnv('REACT_APP_MAPTILER_KEY') ?? '').trim();
const DEFAULT_STYLE_ID = (readEnv('REACT_APP_MAPTILER_STYLE') ?? 'streets-v2').trim();

export const hasMapTilerKey = (): boolean => MAPTILER_KEY.length > 0;

export const getMapStyle = (): string | StyleSpecification => (
    hasMapTilerKey()
        ? `https://api.maptiler.com/maps/${DEFAULT_STYLE_ID}/style.json?key=${MAPTILER_KEY}`
        : googleMapStyle
);

/** @deprecated Use getMapStyle() */
export const getMapStyleUrl = getMapStyle as () => string;
