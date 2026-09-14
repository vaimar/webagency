import StayGuide from './StayGuide';

// Route shell for /stay-guide — the standalone accommodation directory.
// Lists every stay that exists in a place from OpenTripMap, price-free; each
// card deep-links out to Booking/Google. No explore dashboard, no price fetch.
export default function StayGuidePage() {
    return <StayGuide />;
}
