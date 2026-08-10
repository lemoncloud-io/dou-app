import * as React from 'react';

import { cn } from '@chatic/lib/utils';

export interface VerificationCodeInputProps {
    /** Controlled digit string (length ≤ `length`). */
    value: string;
    /** Change handler — receives the digits-only string. */
    onChange: (value: string) => void;
    /** Number of digit cells. */
    length?: number;
    /** Reddens the cells for an invalid/expired code. */
    error?: boolean;
    /**
     * Accepts any printable character, not just digits — for a backend that recognises a
     * non-numeric bypass code on development deployments.
     *
     * The host decides when this is on; this component never reads the build env, so a design
     * system consumed by more than one app cannot quietly widen a production code field. The
     * numeric keypad is dropped along with the filter, or the character could not be typed on a
     * phone in the first place.
     */
    allowNonDigits?: boolean;
    autoFocus?: boolean;
    ariaLabel?: string;
    className?: string;
}

/**
 * Verification-code input — the design guide's code cells. A single controlled
 * numeric field is overlaid transparently over `length` cells; each cell shows a
 * digit and the next-empty cell is highlighted. Stateless (value is external).
 */
export const VerificationCodeInput = ({
    value,
    onChange,
    length = 6,
    error = false,
    allowNonDigits = false,
    autoFocus = false,
    ariaLabel = 'verification code',
    className,
}: VerificationCodeInputProps) => {
    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        // Whitespace goes either way: it is never part of a code and a paste routinely carries it.
        const sanitized = allowNonDigits
            ? event.target.value.replace(/\s/g, '')
            : event.target.value.replace(/\D/g, '');
        onChange(sanitized.slice(0, length));
    };

    return (
        <label className={cn('relative flex w-full justify-center gap-2', className)}>
            <input
                inputMode={allowNonDigits ? 'text' : 'numeric'}
                autoComplete="one-time-code"
                aria-label={ariaLabel}
                value={value}
                maxLength={length}
                autoFocus={autoFocus}
                onChange={handleChange}
                className="absolute inset-0 h-full w-full cursor-pointer text-transparent caret-transparent opacity-0 outline-none"
            />
            {Array.from({ length }).map((_, i) => {
                const isCurrent = i === value.length;
                return (
                    <span
                        key={i}
                        className={cn(
                            'flex h-14 flex-1 items-center justify-center rounded-[10px] border text-[20px] font-semibold text-foreground',
                            error
                                ? 'border-[1.5px] border-destructive'
                                : isCurrent
                                  ? 'border-[1.5px] border-focus-border'
                                  : 'border-input-border'
                        )}
                    >
                        {value[i] ?? ''}
                    </span>
                );
            })}
        </label>
    );
};
