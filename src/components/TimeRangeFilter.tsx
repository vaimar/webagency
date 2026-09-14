import React from 'react';
import ReactSlider from 'react-slider';
import { FULL_DAY, HourWindow, formatHour } from '../services/hourWindow';
import './TimeRangeFilter.css';

interface TimeRangeFilterProps {
    /** "Take-off" / "Landing" — what the window is about. */
    label: string;
    value: HourWindow;
    onChange: (value: HourWindow) => void;
}

/**
 * An hour window, as a two-handled slider — the control every flight search
 * uses for "leaves after work" and "lands before the last bus".
 *
 * Whole hours only: a traveller filtering by time is drawing a rough band, and
 * a slider that can stop on 07:23 makes that harder, not more precise.
 */
const TimeRangeFilter: React.FC<TimeRangeFilterProps> = ({ label, value, onChange }) => {
    return (
        <div className="time-range">
            <div className="time-range__head">
                <span className="time-range__label">{label}</span>
                <span className="time-range__value">
                    {formatHour(value[0])} – {formatHour(value[1])}
                </span>
            </div>
            <ReactSlider
                className="time-range__slider"
                thumbClassName="time-range__thumb"
                trackClassName="time-range__track"
                min={FULL_DAY[0]}
                max={FULL_DAY[1]}
                step={1}
                minDistance={1}
                pearling
                value={value}
                /* Per-thumb names: "Take-off from" / "Take-off until". The
                   group's own label is redundant once each handle says which
                   end of the window it moves. */
                ariaLabel={[`${label} from`, `${label} until`]}
                ariaValuetext={(state) => formatHour(state.valueNow)}
                onChange={(next) => onChange(next as HourWindow)}
            />
        </div>
    );
};

export default TimeRangeFilter;
