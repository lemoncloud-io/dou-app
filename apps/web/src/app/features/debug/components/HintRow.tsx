import { useState } from 'react';

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
