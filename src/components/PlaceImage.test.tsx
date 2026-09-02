import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import PlaceImage from './PlaceImage';

describe('PlaceImage', () => {
    it('renders a verified source image', () => {
        render(<PlaceImage src="https://example.test/place.jpg" alt="Place photo" label="Place" />);

        expect(screen.getByRole('img', { name: 'Place photo' })).toHaveAttribute('src', 'https://example.test/place.jpg');
    });

    it('uses the explicit fallback after an image fails', () => {
        render(<PlaceImage src="https://example.test/missing.jpg" alt="Place photo" label="Place" />);

        fireEvent.error(screen.getByRole('img', { name: 'Place photo' }));

        expect(screen.queryByRole('img')).not.toBeInTheDocument();
        expect(screen.getByLabelText('Place: no photo available')).toBeInTheDocument();
    });
});
