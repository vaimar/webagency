import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getMapStyle } from '../services/mapStyle';

const DEFAULT_CENTER: [number, number] = [-0.09, 51.505]; // MapLibre order: [lng, lat]
const DEFAULT_ZOOM = 13;

const DynamicMap: React.FC = () => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);

    useEffect(() => {
        if (!containerRef.current) {
            return undefined;
        }

        const map = new maplibregl.Map({
            container: containerRef.current,
            style: getMapStyle(),
            center: DEFAULT_CENTER,
            zoom: DEFAULT_ZOOM,
            attributionControl: { compact: true },
        });
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
        mapRef.current = map;

        // Destroys the WebGL context on unmount — required so switching away
        // from this view doesn't leak a GPU context per visit.
        return () => {
            map.remove();
            mapRef.current = null;
        };
    }, []);

    return <div ref={containerRef} style={{ height: '100vh', width: '100%' }} />;
};

export default DynamicMap;
