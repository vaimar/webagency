import React from 'react';
import { render, screen } from '@testing-library/react';
import AccessFare from './AccessFare';

describe('AccessFare', () => {
    it('leads with the fare and puts the labelled all-in after it', () => {
        render(<AccessFare fare={{ price: 35.19, currency: 'EUR', entryPrice: 59.19, priceLabel: 'Estimated (Cached)' }} />);

        const fare = screen.getByText('€35');
        const allIn = screen.getByText('€59 all-in');
        expect(fare.compareDocumentPosition(allIn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(screen.getByText('fare · estimated (cached)')).toBeInTheDocument();
        expect(screen.queryByText('€59')).not.toBeInTheDocument();
    });

    it('shows no all-in when the backend fell back to the bare fare', () => {
        render(<AccessFare fare={{ price: 35.19, currency: 'EUR', entryPrice: 35.19, priceLabel: null }} />);

        expect(screen.getByText('€35')).toBeInTheDocument();
        expect(screen.queryByText(/all-in/)).not.toBeInTheDocument();
        expect(screen.getByText('fare')).toBeInTheDocument();
    });

    it('formats both figures in the fare currency', () => {
        render(<AccessFare fare={{ price: 40, currency: 'GBP', entryPrice: 64, priceLabel: null }} />);

        expect(screen.getByText('£40')).toBeInTheDocument();
        expect(screen.getByText('£64 all-in')).toBeInTheDocument();
    });
});
