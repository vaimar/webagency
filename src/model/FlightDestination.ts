import { AntiCauchemarAnalysis } from '../services/api';

export interface FlightDestination {
    type: string;
    origin: string;
    destination: string;
    departureDate: string;
    returnDate: string;
    price: {
        total: string;
        currency: string;
    };
    links: {
        flightDates: string;
        flightOffers: string;
    };
    antiCauchemar?: AntiCauchemarAnalysis;
}

export interface FlightSearchParams {
    origin: string;
    maxPrice: number;
}

export interface FlightSearchResult {
    destinations: FlightDestination[];
    source: 'live' | 'curated';
    notice?: string;
    fetchedAt: string;
}