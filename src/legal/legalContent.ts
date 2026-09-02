/**
 * Source text for the Privacy, Terms and Cookies pages.
 *
 * Everything here describes what the code in this repository actually does —
 * the storage keys are the real ones, the third parties are the ones the app
 * really contacts, and "no payment is taken" is true because there is no
 * payment path at all. It is written to be checkable against the source rather
 * than to sound reassuring.
 *
 * ⚠️ NOT LEGAL ADVICE, AND NOT READY TO PUBLISH UNREVIEWED. Two things must be
 * filled in by the operator before launch: the legal entity behind
 * `OPERATOR`, and the governing jurisdiction in `TERMS`. A privacy policy that
 * names no controller does not satisfy GDPR Article 13.
 */

export const OPERATOR = {
    /** TODO(operator): replace with the registered entity or trading name. */
    name: 'TravelHub',
    contactEmail: 'pinz92@gmail.com',
    /** TODO(operator): required by GDPR Art. 13 once you have one. */
    postalAddress: null as string | null,
    /** TODO(operator): the law you want to govern the Terms. */
    jurisdiction: null as string | null,
};

export const LAST_UPDATED = '27 August 2026';

export interface LegalSection {
    heading: string;
    paragraphs?: string[];
    bullets?: string[];
}

export const PRIVACY: LegalSection[] = [
    {
        heading: 'The short version',
        paragraphs: [
            'TravelHub takes no payment and sells nothing. It prices trips and then hands you to an airline, hotel or booking site to actually book. We do not sell or share your personal data, and we do not run advertising trackers.',
            'If you never create an account, we hold no personal data about you on our servers at all.',
        ],
    },
    {
        heading: 'What we store on your device',
        paragraphs: [
            'These stay in your browser. They are not sent to us, and clearing your site data removes them.',
        ],
        bullets: [
            '`webagency.cache` — recent search results, so revisiting a page does not re-run every request.',
            '`trip-ledger-*` — the trip cost ledger you build, including any prices you type in yourself.',
            '`travelhub:onboarding-*` — how far through the intro you are.',
            '`travelhub:auth-hint` — a flag saying "this browser has signed in before", so the app knows to attempt a session restore. It is not a credential and holds no personal data.',
        ],
    },
    {
        heading: 'What we store if you create an account',
        paragraphs: [
            'An account holds a username, an optional email address, and the travel preferences you set on your profile — home airport, preferred transport, pace, and similar. Your password is sent to our backend to be verified and is never stored in your browser.',
            'The session is held in a cookie set by our backend. It exists so you stay signed in between pages.',
        ],
    },
    {
        heading: 'Third parties your browser contacts',
        paragraphs: [
            'Using the site causes your browser to make requests to these services directly. We do not send them your account details, but they will see your IP address, as any website visit does.',
        ],
        bullets: [
            'OpenFreeMap and MapTiler — map tiles and fonts.',
            'Google Fonts — the two typefaces the site uses.',
            'Wikimedia, and the websites of the parks and resorts themselves — photography.',
            'Booking, flight and activity partners — only when you click through to them.',
        ],
    },
    {
        heading: 'Affiliate links',
        paragraphs: [
            'Some outbound links carry an affiliate tag, which means we may earn a commission if you book. The price you pay is not affected. Links work identically whether or not a tag is present, and we never re-order or hide a cheaper option because of it.',
        ],
    },
    {
        heading: 'Error reporting and analytics',
        paragraphs: [
            'We record when a page fails to load, when a search succeeds or fails, and when you click through to a partner. These carry a random session identifier that is created fresh each time you open the site and is never linked to your account or to any identifier that persists between visits.',
            'We do not use advertising networks, cross-site trackers, or fingerprinting.',
        ],
    },
    {
        heading: 'Your rights',
        paragraphs: [
            'If you have an account, you can ask for a copy of your data, ask us to correct it, or ask us to delete it, by emailing the address below. If you have no account, we hold nothing to give you.',
        ],
    },
];

export const COOKIES: LegalSection[] = [
    {
        heading: 'We do not use tracking cookies',
        paragraphs: [
            'There is no advertising cookie, no analytics cookie and no third-party tracking cookie on this site. That is why you are not being asked to accept anything — under the ePrivacy rules, consent is required for non-essential cookies, and we do not set any.',
        ],
    },
    {
        heading: 'The one cookie we do set',
        paragraphs: [
            'Signing in sets a session cookie from our backend. It is strictly necessary: without it you cannot stay signed in. It is removed when you sign out.',
        ],
    },
    {
        heading: 'Browser storage is not cookies',
        paragraphs: [
            'The site keeps your cached results and your trip ledger in your browser’s local storage rather than in cookies. It is never transmitted to us. The Privacy page lists every key.',
        ],
    },
];

export const TERMS: LegalSection[] = [
    {
        heading: 'What this service is',
        paragraphs: [
            'TravelHub estimates what a trip costs door to door and shows you where to book. It is an information service. We are not a travel agent, we are not a tour operator, and we take no payment.',
            'Every booking you make is a contract between you and that airline, hotel or booking site — on their terms, with their cancellation rules and their consumer protections.',
        ],
    },
    {
        heading: 'Prices are estimates unless labelled otherwise',
        paragraphs: [
            'Every figure on the site is labelled either confirmed or estimated, and that label is the important part. Confirmed means it came from a provider feed at the time shown. Estimated means we calculated it — transfer costs, baggage, and the drive to your own airport are usually estimates.',
            'Fares change constantly and availability is not guaranteed. Always check the final price on the provider’s own site before you book. Where our figure and theirs disagree, theirs is the real one.',
        ],
    },
    {
        heading: 'What we do not guarantee',
        bullets: [
            'That a price shown here is still available.',
            'That spot, resort or airport details are current — much of it comes from OpenStreetMap and other open datasets that anyone can edit.',
            'That a connection you assemble yourself will be protected if a leg is delayed. Self-transfer itineraries are separate tickets: if you miss the second one, no airline owes you a replacement.',
            'That the service will be available uninterrupted.',
        ],
    },
    {
        heading: 'Affiliate relationships',
        paragraphs: [
            'We may earn a commission when you book through an outbound link, at no extra cost to you. This never changes which option we show first: ranking is by the audited total cost, and nothing else.',
        ],
    },
    {
        heading: 'Acceptable use',
        paragraphs: [
            'Use the site for planning your own travel. Do not scrape it in bulk, resell the data, or use it to build a competing dataset. The underlying open data has its own licences, listed in the footer, and those apply to you too.',
        ],
    },
    {
        heading: 'Liability',
        paragraphs: [
            'We provide this service as-is. To the extent the law allows, we are not liable for money lost on a booking made in reliance on an estimate, for a missed connection, or for anything a provider does or fails to do. Nothing here limits liability that cannot legally be limited — including for death or personal injury caused by negligence, or for fraud.',
        ],
    },
];
