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
    { value: 'portugal', label: 'Portugal', description: 'Coastal cities, walkable neighborhoods, and strong food culture.' },
    { value: 'japan', label: 'Japan', description: 'Precise logistics, vibrant cities, and immersive local rituals.' },
    { value: 'canada', label: 'Canada', description: 'Nature-first escapes with calm pacing and diverse cities.' },
    { value: 'morocco', label: 'Morocco', description: 'Markets, riads, mountain day trips, and bold flavors.' },
    { value: 'italy', label: 'Italy', description: 'Historic streets, train-friendly routes, and rich culinary stops.' },
    { value: 'iceland', label: 'Iceland', description: 'Scenic drives, dramatic landscapes, and high-impact short stays.' },
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
    { value: 'slow', label: 'Slow', description: 'Fewer stops, deeper immersion.' },
    { value: 'balanced', label: 'Balanced', description: 'A solid mix of highlights and breathing room.' },
    { value: 'packed', label: 'Packed', description: 'Fast-moving and experience dense.' },
];

export const SEASON_OPTIONS: OptionWithDescription<TravelSeason>[] = [
    { value: 'spring', label: 'Spring', description: 'Mild weather and lighter crowds.' },
    { value: 'summer', label: 'Summer', description: 'Peak energy and long days.' },
    { value: 'autumn', label: 'Autumn', description: 'Comfortable weather and strong city breaks.' },
    { value: 'winter', label: 'Winter', description: 'Seasonal markets, snow trips, or warm escapes.' },
];

export const DESTINATION_HIGHLIGHTS: Record<string, string[]> = {
    portugal: ['tram-lined city strolls', 'sunset viewpoints', 'seafood tasting menus'],
    japan: ['neighborhood ramen spots', 'bullet-train day trips', 'onsen or spa downtime'],
    canada: ['lakeside walks', 'cafés for reset days', 'easy access to nature'],
    morocco: ['guided medina visits', 'riad evenings', 'desert or mountain add-ons'],
    italy: ['train-connected city hopping', 'late dinners', 'museum mornings'],
    iceland: ['waterfall loops', 'thermal baths', 'photography-friendly road days'],
};

