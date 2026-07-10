import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TripAiGuideTab from './TripAiGuideTab';
import { AiTripGuide } from '../services/aiTripGuide';

const generatedGuide: AiTripGuide = {
    destination: 'Ibiza',
    activity: 'wakeboard',
    provider: 'gemini',
    generated: true,
    cached: false,
    summary: 'Ibiza offers a thrilling wakeboarding experience.',
    neighborhoods: [{ name: 'San Antonio', vibe: 'Lively', bestFor: 'Nightlife' }],
    activityTips: ['Book sessions in advance.'],
    restaurantPicks: [{ name: 'Es Torrent', cuisine: 'Seafood', note: 'Beachfront' }],
    localTips: ['Carry cash.'],
    dayPlan: [{ day: 1, title: 'Arrive', plan: 'Settle in and ride.' }],
};

describe('TripAiGuideTab', () => {
    it('shows a loading state while the guide is being written', () => {
        render(<TripAiGuideTab status="loading" guide={null} onRetry={() => {}} />);
        expect(screen.getByText(/Writing your personalized guide/i)).toBeInTheDocument();
    });

    it('renders every AI section when the guide is generated', () => {
        render(<TripAiGuideTab status="done" guide={generatedGuide} onRetry={() => {}} />);

        expect(screen.getByText('gemini')).toBeInTheDocument();
        expect(screen.getByText(/thrilling wakeboarding experience/)).toBeInTheDocument();
        expect(screen.getByText('San Antonio')).toBeInTheDocument();
        expect(screen.getByText('Book sessions in advance.')).toBeInTheDocument();
        expect(screen.getByText('Es Torrent')).toBeInTheDocument();
        expect(screen.getByText(/Day 1 · Arrive/)).toBeInTheDocument();
        expect(screen.getByText('Carry cash.')).toBeInTheDocument();
    });

    it('degrades honestly and offers retry when the AI was unavailable', async () => {
        const onRetry = jest.fn();
        render(
            <TripAiGuideTab
                status="done"
                guide={{ generated: false, summary: 'AI recommendations are unavailable right now.' }}
                onRetry={onRetry}
            />,
        );

        expect(screen.getByText(/unavailable right now/)).toBeInTheDocument();
        expect(screen.queryByText('San Antonio')).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: /try again/i }));
        expect(onRetry).toHaveBeenCalled();
    });

    it('shows an error state with retry on network failure', async () => {
        const onRetry = jest.fn();
        render(<TripAiGuideTab status="error" guide={null} onRetry={onRetry} />);

        expect(screen.getByText('AI guide unavailable')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: /try again/i }));
        expect(onRetry).toHaveBeenCalled();
    });
});
