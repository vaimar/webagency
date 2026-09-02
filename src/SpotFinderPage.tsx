import SpotFinder from './SpotFinder';

/**
 * The page frame is now just a page head plus the finder. It used to be one big
 * `.card` wrapping everything, which put a panel border around a panel border
 * around the map — reach for `.page-head` and let the finder's own panels carry
 * the elevation.
 */
export default function SpotFinderPage() {
    return (
        <section>
            <header className="page-head">
                <span className="page-head__eyebrow">Find your spot</span>
                <h1 className="page-head__title">Where do you want to ride?</h1>
                <p className="page-head__lead">
                    Cable parks and ski resorts on one map. Pick the activity and country, choose a
                    place, and we show the real ways in — then price the trip without pretending it
                    is a bundled checkout.
                </p>
            </header>
            <SpotFinder initialActivity="wakeboarding" />
        </section>
    );
}
