import { faPenToSquare, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useEffect, useRef, useState } from 'react';
import { ObservedFare, describeFareAge, parseFareInput } from '../services/observedFares';
import './ObservedFareInput.css';

interface ObservedFareInputProps {
    /** Where this leg goes, for the prompt. */
    route: string;
    /** What was recorded for this leg before, if anything. */
    observed?: ObservedFare | null;
    onSave: (price: number) => void;
    onForget: () => void;
}

/**
 * Lets the traveller record the fare they can see on the airline's own site.
 *
 * Non-Ryanair legs have no free price source, so the card shows "?" while the
 * person reading it has the real number in the other tab. Rather than leave the
 * journey untotalled, they can put it in. It is stored on this device, marked
 * as theirs and dated — never dressed up as a fetched quote, because it is one
 * person's sighting at one moment and the reader deserves to weigh it as such.
 */
const ObservedFareInput: React.FC<ObservedFareInputProps> = ({ route, observed, onSave, onForget }) => {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState('');
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // The field only exists because someone just clicked "Add it", so putting
    // the cursor in it is what they asked for. Done with a ref rather than
    // autoFocus, which would also steal focus on any future render.
    useEffect(() => {
        if (open) {
            inputRef.current?.focus();
        }
    }, [open]);

    const commit = () => {
        const parsed = parseFareInput(draft);
        if (parsed === null) {
            setError('Enter a price, like 148');
            return;
        }
        onSave(parsed);
        setDraft('');
        setError(null);
        setOpen(false);
    };

    if (observed && !open) {
        return (
            <span className="observed-fare">
                <span className="observed-fare__badge">your price</span>
                <span className="observed-fare__age">{describeFareAge(observed.savedAt)}</span>
                <button
                    type="button"
                    className="observed-fare__action"
                    onClick={() => { setDraft(String(observed.price)); setOpen(true); }}
                >
                    <FontAwesomeIcon icon={faPenToSquare} aria-hidden="true" /> Change
                </button>
                <button type="button" className="observed-fare__action" onClick={onForget}>
                    <FontAwesomeIcon icon={faXmark} aria-hidden="true" /> Remove
                </button>
            </span>
        );
    }

    if (!open) {
        return (
            <button type="button" className="observed-fare__prompt" onClick={() => setOpen(true)}>
                Saw a price for {route}? Add it
            </button>
        );
    }

    return (
        <span className="observed-fare observed-fare--editing">
            <label className="observed-fare__label">
                <span className="observed-fare__label-text">Price you saw for {route}</span>
                <span className="observed-fare__field">
                    <span aria-hidden="true">€</span>
                    <input
                        ref={inputRef}
                        className="observed-fare__input"
                        type="text"
                        inputMode="decimal"
                        value={draft}
                        placeholder="148"
                        onChange={(event) => { setDraft(event.target.value); setError(null); }}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') { event.preventDefault(); commit(); }
                            if (event.key === 'Escape') { setOpen(false); setError(null); }
                        }}
                    />
                </span>
            </label>
            <button type="button" className="observed-fare__action observed-fare__action--save" onClick={commit}>
                Save
            </button>
            <button
                type="button"
                className="observed-fare__action"
                onClick={() => { setOpen(false); setError(null); }}
            >
                Cancel
            </button>
            {error && <span className="observed-fare__error" role="alert">{error}</span>}
        </span>
    );
};

export default ObservedFareInput;
