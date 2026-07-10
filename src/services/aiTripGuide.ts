// Client for POST /api/trips/ai-guide — AI-authored recommendations that load
// separately from the core explore result so the dashboard stays fast.

export interface AiGuideNeighborhood {
    name?: string | null;
    vibe?: string | null;
    bestFor?: string | null;
}

export interface AiGuideRestaurant {
    name?: string | null;
    cuisine?: string | null;
    note?: string | null;
}

export interface AiGuideDay {
    day?: number | null;
    title?: string | null;
    plan?: string | null;
}

export interface AiTripGuide {
    destination?: string | null;
    activity?: string | null;
    provider?: string | null;
    /** False when the AI was unavailable/unparseable — summary explains why. */
    generated?: boolean | null;
    cached?: boolean | null;
    summary?: string | null;
    neighborhoods?: AiGuideNeighborhood[] | null;
    activityTips?: string[] | null;
    restaurantPicks?: AiGuideRestaurant[] | null;
    localTips?: string[] | null;
    dayPlan?: AiGuideDay[] | null;
}

export const fetchAiTripGuide = async (destination: string, activity?: string | null): Promise<AiTripGuide> => {
    // Relative URL — same CRA/prod proxy path the explore call uses.
    const response = await fetch('/api/trips/ai-guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination, activity: activity ?? undefined }),
    });

    if (!response.ok) {
        throw new Error(`AI guide request failed with status ${response.status}`);
    }

    return (await response.json()) as AiTripGuide;
};
