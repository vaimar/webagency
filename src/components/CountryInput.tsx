import React from 'react';
import { COUNTRY_OPTIONS } from '../data/travelOptions';

interface CountryInputProps {
    value: string;
    onChange: (value: string) => void;
}

const CountryInput: React.FC<CountryInputProps> = ({ onChange, value }) => {
    const selectedOption = COUNTRY_OPTIONS.find((option) => option.value === value);

    return (
        <label className="field-group">
            <span className="field-group__label">Destination focus</span>
            <select
                className="text-input"
                value={value}
                onChange={(event) => onChange(event.target.value)}
            >
                {COUNTRY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
            {selectedOption?.description ? (
                <p className="field-group__hint">{selectedOption.description}</p>
            ) : null}
            <p className="field-group__hint">Pick the country you want the planner summary to optimize around.</p>
        </label>
    );
};

export default CountryInput;
