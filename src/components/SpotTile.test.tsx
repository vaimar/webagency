import React from 'react';
import { render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import SpotTile from './SpotTile';

describe('SpotTile', () => {
    it('renders the photograph when the catalogue has one', () => {
        render(<SpotTile slug="wam-park-vosges-fr" label="WAM Park - Vosges"
                         photoUrl="https://example.test/lake.jpg" photoCredit="© WAM PARK" />);

        const img = screen.getByRole('img', { name: 'WAM Park - Vosges' });
        expect(img).toHaveAttribute('src', 'https://example.test/lake.jpg');
        expect(screen.getByText('© WAM PARK')).toBeInTheDocument();
    });

    it('falls back to a generated tile when there is no photo', () => {
        const { container } = render(
            <SpotTile slug="le-kable-choisy-le-roi-fr" label="Le Kable (Choisy-le-Roi, Paris)"
                      photoUrl={null} towType="MIXED" />);

        expect(screen.queryByRole('img')).not.toBeInTheDocument();
        expect(container.querySelector('.spot-tile--generated')).toBeInTheDocument();
        expect(screen.getByText('LK')).toBeInTheDocument();
    });

    it('falls back when a hotlink dies rather than showing a broken image', () => {
        // Every photo in the catalogue is a hotlink to the park's own site, and three
        // were already 403ing. The browser's broken-image glyph is the one state worse
        // than having no photograph at all.
        const { container } = render(
            <SpotTile slug="wake-paradise-fr" label="Wake Paradise"
                      photoUrl="https://example.test/403.jpg" />);

        fireEvent.error(screen.getByRole('img'));

        expect(screen.queryByRole('img')).not.toBeInTheDocument();
        expect(container.querySelector('.spot-tile--generated')).toBeInTheDocument();
    });

    it('gives the same spot the same colours every time', () => {
        const first = render(<SpotTile slug="exo-3d-fr" label="EXO-3D" photoUrl={null} />);
        const a = first.container.querySelector('.spot-tile')!.getAttribute('data-tile-tone');
        first.unmount();

        const second = render(<SpotTile slug="exo-3d-fr" label="EXO-3D" photoUrl={null} />);
        const b = second.container.querySelector('.spot-tile')!.getAttribute('data-tile-tone');

        expect(a).not.toBeNull();
        expect(a).toBe(b);
    });

    it('gives different spots different colours', () => {
        // A grid of identical placeholders reads as breakage; distinct ones read as
        // a set of places. Two slugs that collide on the six-swatch palette are fine
        // in general, but these two must not.
        const a = render(<SpotTile slug="exo-3d-fr" label="EXO-3D" photoUrl={null} />);
        const b = render(<SpotTile slug="koba-wake-park-fr" label="Koba Wake Park" photoUrl={null} />);

        expect(a.container.querySelector('.spot-tile')!.getAttribute('data-tile-tone'))
            .not.toBe(b.container.querySelector('.spot-tile')!.getAttribute('data-tile-tone'));
    });

    it('reads initials from words, ignoring the locating bracket', () => {
        render(<SpotTile slug="s" label="Téléski Nautique de Saujon (Charente)" photoUrl={null} />);
        expect(screen.getByText('TN')).toBeInTheDocument();
    });
});
