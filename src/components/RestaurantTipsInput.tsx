import React from 'react';

interface RestaurantTipsInputProps {
    value: string;
    onChange: (value: string) => void;
}

const RestaurantTipsInput: React.FC<RestaurantTipsInputProps> = ({ onChange, value }) => (
    <label className="field-group">
        <span className="field-group__label">Dining notes</span>
        <textarea
            id="restaurantTips"
            className="text-area"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Need reservations, late-night spots, kid-friendly options, or special dietary reminders?"
        />
    </label>
);

export default RestaurantTipsInput;