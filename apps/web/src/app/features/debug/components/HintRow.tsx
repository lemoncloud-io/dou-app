import { useState } from 'react';

/**
 * `Row` plus an explanation of what the value MEANS.
 *
 * Two ways in, because the panel has two audiences. On a desktop browser the native `title`
 * tooltip appears on hover, which costs nothing and needs no library. On a real device — where
 * this panel actually lives — there is no hover at all, and a Radix tooltip would not help: it
 * closes on `pointerdown` by design, so a tap never shows it. Hence the label is also a button
 * that reveals the same text inline.
 *
 * The dotted underline is the affordance. It is the only signal a touch user gets, so every row
 * with a hint carries it.
 */
export const HintRow = ({ label, value, hint }: { label: string; value: React.ReactNode; hint: string }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="text-xs">
            <div className="flex gap-2">
                <button
                    type="button"
                    title={hint}
                    aria-expanded={isOpen}
                    onClick={() => setIsOpen(open => !open)}
                    className="text-muted-foreground w-28 shrink-0 cursor-help text-left underline decoration-dotted decoration-from-font underline-offset-2"
                >
                    {label}
                </button>
                <span className="font-mono break-all">{value ?? '—'}</span>
            </div>
            {isOpen && <p className="text-muted-foreground mt-0.5 pl-1 leading-snug">{hint}</p>}
        </div>
    );
};
