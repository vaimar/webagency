import { refreshFlights } from './api';

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
                destination: 'PAR',
                date: '2026-06-01',
            }),
            text: async () => '',
        });

        global.fetch = fetchMock;

        const result = await refreshFlights({
            origin: 'DUB',
            destination: 'PAR',
            date: '2026-06-01',
        });

        expect(fetchMock).toHaveBeenCalledWith(
            'https://slumber-production.up.railway.app/api/flights/refresh?origin=DUB&destination=PAR&date=2026-06-01',
            expect.objectContaining({ method: 'POST' }),
        );
        expect(result.diagnostics.status).toBe(202);
        expect(result.message).toBe('Flights refresh started');
        expect(result.date).toBe('2026-06-01');
    });
});

