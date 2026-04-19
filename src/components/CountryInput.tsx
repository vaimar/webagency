import React from 'react';
import { SingleValue } from 'react-select';
import Select from 'react-select';
import { COUNTRY_OPTIONS, SelectOption } from '../data/travelOptions';

interface CountryInputProps {
    value: string;
    onChange: (value: string) => void;
}

const CountryInput: React.FC<CountryInputProps> = ({ onChange, value }) => {
    const selectedOption = COUNTRY_OPTIONS.find((option) => option.value === value) ?? null;

    const handleSelectChange = (selectedOption: SingleValue<SelectOption>) => {
        if (selectedOption) {
            onChange(selectedOption.value);
        }
    };

    return (
        <div className="field-group">
            <label htmlFor="country" className="field-group__label">Destination focus</label>
            <Select
                id="country"
                options={COUNTRY_OPTIONS}
                value={selectedOption}
                onChange={handleSelectChange}
                placeholder="Choose a destination"
                classNamePrefix="planner-select"
            />
            <p className="field-group__hint">Pick the country you want the planner summary to optimize around.</p>
        </div>
    );
};

export default CountryInput;
