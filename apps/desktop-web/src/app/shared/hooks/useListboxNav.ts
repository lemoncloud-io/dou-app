import { useCallback, useEffect, useId, useState, type KeyboardEvent } from 'react';

/**
 * Keyboard contract for an input that drives a result list: ↑/↓ move the active
 * option (wrapping), Enter picks it, and the input carries the combobox ARIA
 * that makes the movement audible.
 *
 * The quick switcher had this and the message search did not, so the two
 * dialogs with the same shell and the same job had different keyboard rules —
 * search could only be walked with Tab, through every channel header. And
 * neither announced anything: the input kept focus while the highlight moved,
 * with no `aria-activedescendant` to tell a screen reader which option was live.
 *
 * `resetKey` puts the highlight back on the first option whenever it changes
 * (typically the query), so a new search never starts halfway down.
 */
export const useListboxNav = (count: number, onPick: (index: number) => void, resetKey?: unknown) => {
    const [activeIndex, setActiveIndex] = useState(0);
    const baseId = useId();

    useEffect(() => {
        setActiveIndex(0);
    }, [resetKey]);

    // A shrinking list must not leave the highlight past its end.
    useEffect(() => {
        if (activeIndex >= count) setActiveIndex(count > 0 ? count - 1 : 0);
    }, [count, activeIndex]);

    const onKeyDown = useCallback(
        (e: KeyboardEvent<HTMLElement>) => {
            if (e.nativeEvent.isComposing) return; // IME candidate navigation owns the arrows
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex(i => (count ? (i + 1) % count : 0));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex(i => (count ? (i - 1 + count) % count : 0));
            } else if (e.key === 'Enter' && count > 0) {
                e.preventDefault();
                onPick(activeIndex);
            }
        },
        [count, activeIndex, onPick]
    );

    const listboxId = `${baseId}-listbox`;
    const optionId = (index: number) => `${baseId}-option-${index}`;

    /** Spread onto the input. */
    const inputProps = {
        role: 'combobox' as const,
        'aria-expanded': count > 0,
        'aria-controls': listboxId,
        'aria-autocomplete': 'list' as const,
        'aria-activedescendant': count > 0 ? optionId(activeIndex) : undefined,
        onKeyDown,
    };

    return { activeIndex, setActiveIndex, listboxId, optionId, inputProps };
};
