import * as React from 'react';

import { cn } from '@chatic/ui-kit';

export interface VerificationCodeInputProps {
    value: string;
    onChange: (value: string) => void;
    length?: number;
    error?: boolean;
    allowNonDigits?: boolean;
    autoFocus?: boolean;
    ariaLabel?: string;
    className?: string;
}

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
