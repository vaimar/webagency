import React from 'react';

interface FavoriteActivitiesInputProps {
    value: string;
    onChange: (value: string) => void;
}

const FavoriteActivitiesInput: React.FC<FavoriteActivitiesInputProps> = ({ onChange, value }) => (
    <label className="field-group">
        <span className="field-group__label">Non-negotiable moments</span>
        <textarea
            id="favoriteActivities"
            className="text-area"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Golden-hour photo walk, one fancy dinner, neighborhood market mornings..."
        />
    </label>
);

export default FavoriteActivitiesInput;
