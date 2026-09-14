import React from 'react';
import ReactDOM from 'react-dom/client';

import './index.css';
import App from './App';
import { initTelemetry } from './services/telemetry';

// Installed before render so a crash during the very first paint is still
// captured, along with any unhandled rejection from a module's top level.
initTelemetry();

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root is missing from index.html');

ReactDOM.createRoot(container).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
);
