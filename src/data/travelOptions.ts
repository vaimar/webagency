import { AccommodationType, TravelPace, TravelSeason } from '../model/TravelPlan';

export interface SelectOption {
    value: string;
    label: string;
    description?: string;
}

export interface OptionWithDescription<T extends string> {
    value: T;
    label: string;
    description: string;
}

export interface CityOption {
    value: string;
    label: string;
    country: string;
    popular?: boolean;
    tip?: string;
}

export const COUNTRY_OPTIONS: SelectOption[] = [
    { value: 'portugal', label: '🇵🇹 Portugal', description: 'Coastal cities, walkable neighborhoods, and strong food culture.' },
    { value: 'spain', label: '🇪🇸 Spain', description: 'Vibrant cities, beaches, tapas culture, and rich history.' },
    { value: 'france', label: '🇫🇷 France', description: 'Romantic cities, world-class cuisine, and stunning countryside.' },
    { value: 'italy', label: '🇮🇹 Italy', description: 'Historic streets, train-friendly routes, and rich culinary stops.' },
    { value: 'greece', label: '🇬🇷 Greece', description: 'Island hopping, ancient ruins, and Mediterranean cuisine.' },
    { value: 'japan', label: '🇯🇵 Japan', description: 'Precise logistics, vibrant cities, and immersive local rituals.' },
    { value: 'thailand', label: '🇹🇭 Thailand', description: 'Tropical beaches, ancient temples, and incredible street food.' },
    { value: 'canada', label: '🇨🇦 Canada', description: 'Nature-first escapes with calm pacing and diverse cities.' },
    { value: 'usa', label: '🇺🇸 USA', description: 'Diverse landscapes, iconic cities, and road trip adventures.' },
    { value: 'morocco', label: '🇲🇦 Morocco', description: 'Markets, riads, mountain day trips, and bold flavors.' },
    { value: 'iceland', label: '🇮🇸 Iceland', description: 'Scenic drives, dramatic landscapes, and high-impact short stays.' },
    { value: 'australia', label: '🇦🇺 Australia', description: 'Beaches, wildlife, cosmopolitan cities, and outback adventures.' },
    { value: 'newzealand', label: '🇳🇿 New Zealand', description: 'Stunning nature, adventure sports, and Māori culture.' },
    { value: 'uk', label: '🇬🇧 United Kingdom', description: 'Historic cities, countryside charm, and pub culture.' },
    { value: 'croatia', label: '🇭🇷 Croatia', description: 'Adriatic coastline, historic towns, and Game of Thrones locations.' },
];

export const CITY_OPTIONS: CityOption[] = [
    // Portugal
    { value: 'lisbon', label: 'Lisbon', country: 'portugal', popular: true, tip: 'Best pastéis de nata in Belém' },
    { value: 'porto', label: 'Porto', country: 'portugal', popular: true, tip: 'Walk across the Dom Luís I Bridge at sunset' },
    { value: 'faro', label: 'Faro', country: 'portugal', tip: 'Gateway to the Algarve beaches' },
    { value: 'sintra', label: 'Sintra', country: 'portugal', tip: 'Fairytale palaces — perfect day trip from Lisbon' },
    { value: 'madeira', label: 'Funchal (Madeira)', country: 'portugal', tip: 'Lush island with levada walks' },

    // Spain
    { value: 'barcelona', label: 'Barcelona', country: 'spain', popular: true, tip: 'Book Sagrada Família tickets weeks ahead' },
    { value: 'madrid', label: 'Madrid', country: 'spain', popular: true, tip: 'Dinner starts at 10pm — embrace it!' },
    { value: 'seville', label: 'Seville', country: 'spain', tip: 'Flamenco in Triana is the real deal' },
    { value: 'valencia', label: 'Valencia', country: 'spain', tip: 'Birthplace of paella — try it at the beach' },
    { value: 'malaga', label: 'Málaga', country: 'spain', tip: 'Picasso\'s hometown with great tapas bars' },
    { value: 'san-sebastian', label: 'San Sebastián', country: 'spain', popular: true, tip: 'Best pintxos in the world — Parte Vieja' },

    // France
    { value: 'paris', label: 'Paris', country: 'france', popular: true, tip: 'Skip the Eiffel Tower queue — book sunrise slots' },
    { value: 'nice', label: 'Nice', country: 'france', tip: 'Promenade des Anglais + Old Town markets' },
    { value: 'lyon', label: 'Lyon', country: 'france', popular: true, tip: 'Gastronomic capital — book a bouchon' },
    { value: 'marseille', label: 'Marseille', country: 'france', tip: 'Calanques national park is unmissable' },
    { value: 'bordeaux', label: 'Bordeaux', country: 'france', tip: 'Wine tasting + La Cité du Vin' },

    // Italy
    { value: 'rome', label: 'Rome', country: 'italy', popular: true, tip: 'Trastevere for the best dinner spots' },
    { value: 'florence', label: 'Florence', country: 'italy', popular: true, tip: 'Uffizi at opening — no crowds' },
    { value: 'naples', label: 'Naples', country: 'italy', tip: 'The best pizza on Earth — try L\'Antica Pizzeria' },
    { value: 'venice', label: 'Venice', country: 'italy', tip: 'Visit in shoulder season to avoid crowds' },
    { value: 'milan', label: 'Milan', country: 'italy', tip: 'Fashion district + The Last Supper' },
    { value: 'amalfi', label: 'Amalfi Coast', country: 'italy', popular: true, tip: 'Bus from Sorrento is the cheapest way' },

    // Greece
    { value: 'athens', label: 'Athens', country: 'greece', popular: true, tip: 'Acropolis at sunrise to beat the heat' },
    { value: 'santorini', label: 'Santorini', country: 'greece', popular: true, tip: 'Stay in Oia for the iconic sunset' },
    { value: 'crete', label: 'Crete', country: 'greece', tip: 'Biggest island — rent a car to explore' },
    { value: 'mykonos', label: 'Mykonos', country: 'greece', tip: 'Beach clubs by day, Little Venice by night' },
    { value: 'thessaloniki', label: 'Thessaloniki', country: 'greece', tip: 'Underrated food scene — better than Athens' },

    // Japan
    { value: 'tokyo', label: 'Tokyo', country: 'japan', popular: true, tip: 'Get a Suica card on arrival — works everywhere' },
    { value: 'kyoto', label: 'Kyoto', country: 'japan', popular: true, tip: 'Fushimi Inari at 6am — almost empty' },
    { value: 'osaka', label: 'Osaka', country: 'japan', tip: 'Street food capital — Dotonbori is legendary' },
    { value: 'hiroshima', label: 'Hiroshima', country: 'japan', tip: 'Peace Memorial + day trip to Miyajima island' },

    // Thailand
    { value: 'bangkok', label: 'Bangkok', country: 'thailand', popular: true, tip: 'Chatuchak weekend market is enormous' },
    { value: 'chiang-mai', label: 'Chiang Mai', country: 'thailand', popular: true, tip: 'Night markets + temple-hopping' },
    { value: 'phuket', label: 'Phuket', country: 'thailand', tip: 'Old Town is more charming than the beaches' },
    { value: 'krabi', label: 'Krabi', country: 'thailand', tip: 'Railay Beach accessible only by boat' },

    // Canada
    { value: 'vancouver', label: 'Vancouver', country: 'canada', popular: true, tip: 'Stanley Park seawall is a must-cycle' },
    { value: 'montreal', label: 'Montreal', country: 'canada', tip: 'Mile End bagels rival NYC' },
    { value: 'toronto', label: 'Toronto', country: 'canada', tip: 'Kensington Market for the local vibe' },
    { value: 'banff', label: 'Banff', country: 'canada', popular: true, tip: 'Lake Louise at dawn is breathtaking' },

    // USA
    { value: 'new-york', label: 'New York City', country: 'usa', popular: true, tip: 'Walk the High Line + Chelsea Market' },
    { value: 'san-francisco', label: 'San Francisco', country: 'usa', tip: 'Rent a bike across the Golden Gate' },
    { value: 'los-angeles', label: 'Los Angeles', country: 'usa', tip: 'Griffith Observatory for sunset views' },
    { value: 'miami', label: 'Miami', country: 'usa', tip: 'Wynwood Walls + Little Havana cafecito' },
    { value: 'new-orleans', label: 'New Orleans', country: 'usa', popular: true, tip: 'Frenchmen Street > Bourbon Street' },

    // Morocco
    { value: 'marrakech', label: 'Marrakech', country: 'morocco', popular: true, tip: 'Stay in a riad in the Medina' },
    { value: 'fez', label: 'Fez', country: 'morocco', tip: 'Oldest medina in the world — hire a guide' },
    { value: 'chefchaouen', label: 'Chefchaouen', country: 'morocco', popular: true, tip: 'The Blue City — incredibly photogenic' },

    // Iceland
    { value: 'reykjavik', label: 'Reykjavik', country: 'iceland', popular: true, tip: 'Golden Circle doable as a day trip' },
    { value: 'vik', label: 'Vík', country: 'iceland', tip: 'Black sand beach + glacier hikes nearby' },

    // Australia
    { value: 'sydney', label: 'Sydney', country: 'australia', popular: true, tip: 'Bondi to Coogee coastal walk is free' },
    { value: 'melbourne', label: 'Melbourne', country: 'australia', popular: true, tip: 'Laneways for coffee + street art' },
    { value: 'cairns', label: 'Cairns', country: 'australia', tip: 'Gateway to the Great Barrier Reef' },

    // New Zealand
    { value: 'queenstown', label: 'Queenstown', country: 'newzealand', popular: true, tip: 'Adventure capital — bungy, skydive, jet boat' },
    { value: 'auckland', label: 'Auckland', country: 'newzealand', tip: 'City of Sails + Waiheke Island wines' },
    { value: 'rotorua', label: 'Rotorua', country: 'newzealand', tip: 'Geothermal wonders + Māori cultural shows' },

    // UK
    { value: 'london', label: 'London', country: 'uk', popular: true, tip: 'Borough Market + free museums everywhere' },
    { value: 'edinburgh', label: 'Edinburgh', country: 'uk', popular: true, tip: 'Arthur\'s Seat for panoramic views' },
    { value: 'bath', label: 'Bath', country: 'uk', tip: 'Roman Baths + Georgian architecture' },
    { value: 'liverpool', label: 'Liverpool', country: 'uk', tip: 'Beatles history + Albert Dock' },

    // Croatia
    { value: 'dubrovnik', label: 'Dubrovnik', country: 'croatia', popular: true, tip: 'Walk the city walls at sunset' },
    { value: 'split', label: 'Split', country: 'croatia', tip: 'Diocletian\'s Palace is still a living city' },
    { value: 'hvar', label: 'Hvar', country: 'croatia', tip: 'Lavender fields + stunning beaches' },
    { value: 'zagreb', label: 'Zagreb', country: 'croatia', tip: 'Underrated — great museums and café culture' },
];

export const FOOD_PREFERENCE_OPTIONS: SelectOption[] = [
    { value: 'vegetarian', label: 'Vegetarian' },
    { value: 'vegan', label: 'Vegan' },
    { value: 'seafood', label: 'Seafood lover' },
    { value: 'street-food', label: 'Street food' },
    { value: 'fine-dining', label: 'Fine dining' },
    { value: 'local-specialties', label: 'Local specialties' },
];

export const ACCOMMODATION_OPTIONS: OptionWithDescription<AccommodationType>[] = [
    { value: 'hotel', label: 'Hotel', description: 'Reliable comfort and central amenities.' },
    { value: 'boutique', label: 'Boutique stay', description: 'Design-led spaces with local character.' },
    { value: 'apartment', label: 'Apartment', description: 'Great for longer stays and neighborhood living.' },
    { value: 'hostel', label: 'Hostel', description: 'Budget-friendly and social.' },
];

export const PACE_OPTIONS: OptionWithDescription<TravelPace>[] = [
    { value: 'slow', label: 'Relaxed', description: 'Fewer stops, deeper immersion.' },
    { value: 'balanced', label: 'Balanced', description: 'A solid mix of highlights and breathing room.' },
    { value: 'packed', label: 'Active', description: 'Fast-moving and experience dense.' },
];

export const SEASON_OPTIONS: OptionWithDescription<TravelSeason>[] = [
    { value: 'spring', label: '🌸 Spring', description: 'Mild weather and lighter crowds.' },
    { value: 'summer', label: '☀️ Summer', description: 'Peak energy and long days.' },
    { value: 'autumn', label: '🍂 Autumn', description: 'Comfortable weather and strong city breaks.' },
    { value: 'winter', label: '❄️ Winter', description: 'Seasonal markets, snow trips, or warm escapes.' },
];

export const DESTINATION_HIGHLIGHTS: Record<string, string[]> = {
    portugal: ['tram-lined city strolls', 'sunset viewpoints', 'seafood tasting menus'],
    spain: ['tapas hopping', 'flamenco shows', 'beach relaxation'],
    france: ['café culture', 'wine regions', 'museum exploration'],
    italy: ['train-connected city hopping', 'late dinners', 'museum mornings'],
    greece: ['island hopping', 'ancient history', 'fresh seafood'],
    japan: ['neighborhood ramen spots', 'bullet-train day trips', 'onsen or spa downtime'],
    thailand: ['temple visits', 'beach days', 'night markets'],
    canada: ['lakeside walks', 'cafés for reset days', 'easy access to nature'],
    usa: ['iconic landmarks', 'diverse food scenes', 'road trip adventures'],
    morocco: ['guided medina visits', 'riad evenings', 'desert or mountain add-ons'],
    iceland: ['waterfall loops', 'thermal baths', 'photography-friendly road days'],
    australia: ['beach culture', 'wildlife encounters', 'great coffee'],
    newzealand: ['adventure activities', 'scenic drives', 'Māori experiences'],
    uk: ['historic walking tours', 'pub visits', 'countryside escapes'],
    croatia: ['coastal towns', 'island visits', 'old town exploration'],
};

export const getCitiesForCountry = (country: string): CityOption[] => {
    return CITY_OPTIONS.filter((city) => city.country === country);
};
