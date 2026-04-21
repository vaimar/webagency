import React from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const DynamicMap = () => {
  return (
    <MapContainer
      center={[51.505, -0.09]} // Default center
      zoom={13}                // Default zoom level
      style={{ height: '100vh', width: '100%' }} // Map dimensions
      attributionControl={true} // Ensures attribution control is shown
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        // Attribution added directly to the tile provider URL
        attribution="&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors"
      />
    </MapContainer>
  );
};

export default DynamicMap;
