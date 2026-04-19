import React, { useState } from 'react';
import './Slider.css'; // Import the CSS file

type Props = {
    min: number;
    max: number;
    value: number;
    onChange: (value: number) => void;
};

const Slider: React.FC<Props> = ({ min, max, value, onChange }) => {
    const [isDragging, setIsDragging] = useState(false);

    const getPercentage = (value: number) => ((value - min) / (max - min)) * 100;

    const handleDragStart = () => {
        setIsDragging(true);
    };

    const handleDragEnd = () => {
        setIsDragging(false);
    };

    const handleDrag = (event: React.MouseEvent<HTMLDivElement>) => {
        if (!isDragging) return;

        const { left, width } = event.currentTarget.getBoundingClientRect();
        const percentage = (event.clientX - left) / width;
        const newValue = Math.round(min + percentage * (max - min));
        onChange(newValue);
    };

    const trackStyle = `bg-gradient-to-r from-yellow-500 to-red-500 h-2 rounded-full ${isDragging ? 'cursor-grabbing' : 'cursor-pointer'}`;

    return (
        <div className="flex items-center">
            <div className="w-full h-2 bg-gray-800 rounded-full">
                <div
                    className={trackStyle}
                    style={{ width: `${getPercentage(value)}%` }}
                    onMouseDown={handleDragStart}
                    onMouseUp={handleDragEnd}
                    onMouseMove={handleDrag}
                >test!</div>
            </div>
        </div>
    );
};

export default Slider;
