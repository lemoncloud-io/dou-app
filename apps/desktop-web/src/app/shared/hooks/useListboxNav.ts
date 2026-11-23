import { useCallback, useEffect, useId, useState, type KeyboardEvent } from 'react';

export const useListboxNav = (count: number, onPick: (index: number) => void, resetKey?: unknown) => {
    const [activeIndex, setActiveIndex] = useState(0);
    const baseId = useId();

    useEffect(() => {
        setActiveIndex(0);
    }, [resetKey]);

    useEffect(() => {
        if (activeIndex >= count) setActiveIndex(count > 0 ? count - 1 : 0);
    }, [count, activeIndex]);

    const onKeyDown = useCallback(
        (e: KeyboardEvent<HTMLElement>) => {
            if (e.nativeEvent.isComposing) return;
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
