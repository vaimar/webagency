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
