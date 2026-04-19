import React from 'react';
import { ACCOMMODATION_OPTIONS } from '../data/travelOptions';
import { AccommodationType } from '../model/TravelPlan';

interface AccommodationInputProps {
    value: AccommodationType;
    onChange: (value: AccommodationType) => void;
}

const AccommodationInput: React.FC<AccommodationInputProps> = ({ onChange, value }) => {
    return (
        <fieldset className="field-group option-grid-fieldset">
            <legend className="field-group__label">Accommodation preferences</legend>

            <div className="option-grid">
                {ACCOMMODATION_OPTIONS.map((option) => (
                    <label
                        key={option.value}
                        className={value === option.value ? 'choice-card choice-card--selected' : 'choice-card'}
                    >
                        <input
                            type="radio"
                            name="accommodation"
                            value={option.value}
                            checked={value === option.value}
                            onChange={() => onChange(option.value)}
                        />
                        <span className="choice-card__title">{option.label}</span>
                        <span className="choice-card__description">{option.description}</span>
                    </label>
                ))}
            </div>
        </fieldset>
    );
};

export default AccommodationInput;
