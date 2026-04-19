import React from 'react';

interface ActivitiesInputProps {
    value: string;
    onChange: (value: string) => void;
}

const ActivitiesInput: React.FC<ActivitiesInputProps> = ({ onChange, value }) => (
    <label className="field-group">
        <span className="field-group__label">Activities to include</span>
        <textarea
            id="activities"
            className="text-area"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Museums, food tours, surf lessons, hiking, coworking days..."
        />
        <span className="field-group__hint">List the experiences that define a successful trip for you.</span>
    </label>
);

export default ActivitiesInput;
