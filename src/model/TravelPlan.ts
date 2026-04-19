export type AccommodationType = 'hotel' | 'hostel' | 'apartment' | 'boutique';
export type TravelPace = 'slow' | 'balanced' | 'packed';
export type TravelSeason = 'spring' | 'summer' | 'autumn' | 'winter';

export interface TravelPlan {
    destination: string;
    city: string;
    budget: number;
    duration: number;
    accommodation: AccommodationType;
    foodPreferences: string[];
    restaurantTips: string;
    activities: string;
    favoriteActivities: string;
    notes: string;
    pace: TravelPace;
    season: TravelSeason;
}
