/// <reference types="react-scripts" />

declare namespace NodeJS {
    interface ProcessEnv {
        readonly REACT_APP_AMADEUS_TOKEN?: string;
    }
}

