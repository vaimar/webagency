import { fetchTripSuggestion, planTrip, refreshFlights } from './api';

describe('refreshFlights', () => {
    it('uses POST and includes the required date query parameter', async () => {
        const fetchMock = jest.fn().mockResolvedValue({
            ok: true,
            status: 202,
            statusText: 'Accepted',
            headers: {
                get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
            },
            json: async () => ({
                message: 'Flights refresh started',
                origin: 'DUB',
                destination: 'BVA',
                date: '2026-06-01',
            }),
            text: async () => '',
        });

        global.fetch = fetchMock;

        const result = await refreshFlights({
            origin: 'DUB',
            destination: 'BVA',
            date: '2026-06-01',
        });

        expect(fetchMock).toHaveBeenCalledWith(
            'https://slumber-production.up.railway.app/api/flights/refresh?origin=DUB&destination=BVA&date=2026-06-01',
            expect.objectContaining({ method: 'POST' }),
        );
        expect(result.diagnostics.status).toBe(202);
        expect(result.message).toBe('Flights refresh started');
        expect(result.date).toBe('2026-06-01');
    });
});

describe('trip suggestion normalization', () => {
    it('normalizes alternate restaurant and hotel fields from trip suggestions', async () => {
        const fetchMock = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: {
                get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
            },
            json: async () => ({
                summary: 'Cold, honest city break.',
                restaurantRecommendations: Array.from({ length: 10 }, (_, index) => ({
                    title: `Restaurant ${index + 1}`,
                    category: 'Local',
                    price: '€€',
                    signatureDish: 'House plate',
                    note: 'Profile matched',
                })),
                hotels: Array.from({ length: 10 }, (_, index) => ({
                    name: `Stay ${index + 1}`,
                    category: 'Mid-range',
                    nightlyRate: `€${110 + index}`,
                    district: `Area ${index + 1}`,
                    whyStay: 'Fits the profile',
                    officialUrl: `https://stay-${index + 1}.example.com`,
                })),
            }),
            text: async () => '',
        });

        global.fetch = fetchMock;

        const result = await fetchTripSuggestion({ origin: 'DUB', destination: 'BVA' });

        expect(result.suggestion.restaurants).toHaveLength(10);
        expect(result.suggestion.accommodation).toHaveLength(10);
        expect(result.suggestion.restaurants?.[0]).toMatchObject({
            name: 'Restaurant 1',
            cuisine: 'Local',
        });
        expect(result.suggestion.accommodation?.[0]).toMatchObject({
            name: 'Stay 1',
            area: 'Area 1',
            type: 'Mid-range',
            officialWebsiteUrl: 'https://stay-1.example.com/',
        });
    });

    it('normalizes alternate restaurant and hotel fields from trip plans', async () => {
        const fetchMock = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: {
                get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
            },
            json: async () => ({
                summary: 'Profile-first plan.',
                recommendedRestaurants: Array.from({ length: 10 }, (_, index) => ({
                    name: `Food ${index + 1}`,
                    cuisine: 'Seasonal',
                    priceRange: '€€',
                    mustTry: 'Chef choice',
                })),
                stayOptions: Array.from({ length: 10 }, (_, index) => ({
                    title: `Hotel ${index + 1}`,
                    accommodationType: 'Boutique',
                    pricePerNight: `€${140 + index}`,
                    neighborhood: `Quarter ${index + 1}`,
                    websiteUrl: `https://hotel-${index + 1}.example.com`,
                })),
            }),
            text: async () => '',
        });

        global.fetch = fetchMock;

        const result = await planTrip({
            destination: 'Lisbon',
            duration: 4,
            budget: 400,
            notes: 'Return at least 10 restaurant recommendations and at least 10 accommodation recommendations.',
        });

        expect(result.suggestion.restaurants).toHaveLength(10);
        expect(result.suggestion.accommodation).toHaveLength(10);
        expect(result.suggestion.restaurants?.[9]?.name).toBe('Food 10');
        expect(result.suggestion.accommodation?.[9]?.area).toBe('Quarter 10');
        expect(result.suggestion.accommodation?.[9]?.officialWebsiteUrl).toBe('https://hotel-10.example.com/');
    });
});

