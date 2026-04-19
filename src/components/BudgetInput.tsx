import React from 'react';
import Slider from 'react-slider';
import './BudgetInput.css';

interface BudgetInputProps {
    value: number;
    onChange: (value: number) => void;
}

const BudgetInput: React.FC<BudgetInputProps> = ({ value, onChange }) => {
    const formattedBudget = new Intl.NumberFormat('en', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
    }).format(value);

    return (
        <div className="field-group budget-input-container">
            <div className="budget-input__header">
                <label htmlFor="budget" className="field-group__label">
                    Budget ceiling
                </label>
                <strong className="budget-input__value">{formattedBudget}</strong>
            </div>
            <Slider
                id="budget"
                min={5}
                max={5000}
                step={25}
                value={value}
                onChange={onChange}
                className="budget-slider"
                thumbClassName="budget-slider-thumb"
                trackClassName="budget-slider-track"
            />

            <div className="budget-input__scale">
                <span>€5</span>
                <span>€5,000</span>
            </div>
            <p className="field-group__hint">Use this as the trip budget target, not only the flight cost.</p>
        </div>
    );
};

export default BudgetInput;
