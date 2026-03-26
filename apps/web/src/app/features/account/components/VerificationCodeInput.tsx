import { useRef } from 'react';

import { cn } from '@chatic/lib/utils';

import { VERIFICATION_CODE_LENGTH } from '../constants';

interface VerificationCodeInputProps {
    value: string;
    onChange: (value: string) => void;
    hasError?: boolean;
}

export const VerificationCodeInput = ({ value, onChange, hasError = false }: VerificationCodeInputProps) => {
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    const digits = value.split('').concat(Array(VERIFICATION_CODE_LENGTH - value.length).fill(''));

    const handleChange = (index: number, inputValue: string) => {
        const digit = inputValue.replace(/\D/g, '').slice(-1);
        const newValue = digits.map((d, i) => (i === index ? digit : d)).join('');
        onChange(newValue.replace(/\s/g, ''));

        if (digit && index < VERIFICATION_CODE_LENGTH - 1) {
            inputRefs.current[index + 1]?.focus();
        }
    };

    const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace' && !digits[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, VERIFICATION_CODE_LENGTH);
        onChange(pasted);
        const focusIndex = Math.min(pasted.length, VERIFICATION_CODE_LENGTH - 1);
        inputRefs.current[focusIndex]?.focus();
    };

    return (
        <div className="flex items-center justify-center gap-[10px]">
            {digits.map((digit, index) => {
                const isFilled = digit !== '';
                const isFocusTarget = index === value.length;
                return (
                    <input
                        key={index}
                        ref={el => {
                            inputRefs.current[index] = el;
                        }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={e => handleChange(index, e.target.value)}
                        onKeyDown={e => handleKeyDown(index, e)}
                        onPaste={handlePaste}
                        autoFocus={isFocusTarget && index === 0}
                        className={cn(
                            'flex h-[50px] w-[46px] items-center justify-center rounded-[10px] text-center text-[24px] font-bold outline-none transition-all',
                            hasError
                                ? 'border-0 bg-[#FFF1EF] text-[#FF4C35]'
                                : isFilled
                                  ? 'border-0 bg-secondary text-main-accent'
                                  : 'border border-input-border bg-surface focus:border-[1.5px] focus:border-main-accent'
                        )}
                    />
                );
            })}
        </div>
    );
};
