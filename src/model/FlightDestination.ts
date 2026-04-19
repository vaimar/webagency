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
}

export interface FlightSearchParams {
    origin: string;
    maxPrice: number;
}

export interface FlightSearchResult {
    destinations: FlightDestination[];
    source: 'live' | 'demo';
    notice?: string;
    fetchedAt: string;
}