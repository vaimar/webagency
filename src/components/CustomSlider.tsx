import React from 'react';
import Slider from 'react-slider';
import './CustomSlider.css'; // Import the CSS file


interface CustomSliderProps {
    min: number;
    max: number;
    value: number;
    onChange: (value: number) => void;
}

const CustomSlider: React.FC<CustomSliderProps> = ({ min, max, value, onChange }) => {
    return (
        <Slider
            min={min}
            max={max}
            value={value}
            onChange={onChange}
            className="custom-slider"
            thumbClassName="custom-slider-thumb"
            trackClassName="custom-slider-track"
        />
    );
};

export default CustomSlider;