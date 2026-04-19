import React from 'react';
import { FOOD_PREFERENCE_OPTIONS } from '../data/travelOptions';

interface FoodPreferencesInputProps {
    value: string[];
    onChange: (nextValue: string[]) => void;
}

const FoodPreferencesInput: React.FC<FoodPreferencesInputProps> = ({ onChange, value }) => {
    const togglePreference = (preference: string) => {
        if (value.includes(preference)) {
            onChange(value.filter((item) => item !== preference));
            return;
        }

        onChange([...value, preference]);
    };

    return (
        <fieldset className="field-group option-grid-fieldset">
            <legend className="field-group__label">Food preferences</legend>

            <div className="checkbox-grid">
                {FOOD_PREFERENCE_OPTIONS.map((option) => {
                    const checked = value.includes(option.value);

                    return (
                        <label key={option.value} className={checked ? 'checkbox-chip checkbox-chip--checked' : 'checkbox-chip'}>
                            <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => togglePreference(option.value)}
                            />
                            <span>{option.label}</span>
                        </label>
                    );
                })}
            </div>
        </fieldset>
    );
};

export default FoodPreferencesInput;
