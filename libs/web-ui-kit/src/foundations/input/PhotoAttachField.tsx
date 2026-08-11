import * as React from 'react';

import { cn } from '@chatic/lib/utils';

import { IconClose, IconGalleryAdd } from '../../resources/icons';

export interface PhotoAttachFieldProps {
    /** Field label rendered above the dropzone. */
    label?: string;
    /** Already-attached images, as anything an `<img src>` accepts (data URL or http URL). */
    value: string[];
    /**
     * Fired with the files the user picked. Receives every pick — enforcing `max`
     * is the caller's job, so it can tell the user *why* a pick was refused
     * instead of the field silently dropping it.
     */
    onSelect: (files: File[]) => void;
    /** Fired with the index to drop from `value`. */
    onRemove: (index: number) => void;
    /** Two-line hint inside the dropzone. */
    hint?: React.ReactNode;
    /** Caption under the field, e.g. "최대 5장 · jpg, png". */
    description?: string;
    /** `accept` for the underlying file input. */
    accept?: string;
    /** Hides the dropzone once this many images are attached. */
    max?: number;
    /** Accessible label for a thumbnail's remove button; receives the 1-based index. */
    removeLabel?: (index: number) => string;
    disabled?: boolean;
    className?: string;
}

/**
 * Attach-photos field — the feedback screen's 사진 첨부 area: a dashed dropzone
 * over a horizontal strip of removable thumbnails.
 *
 * Presentational on purpose. It hands raw `File`s straight back and renders
 * whatever `value` holds, so the owner decides how images are encoded, how big
 * they may be, and what happens when too many are picked. That keeps the
 * payload policy (these ship inline as base64) out of the design system.
 */
export const PhotoAttachField = ({
    label,
    value,
    onSelect,
    onRemove,
    hint,
    description,
    accept = 'image/jpeg,image/png',
    max,
    removeLabel = index => `Remove photo ${index}`,
    disabled = false,
    className,
}: PhotoAttachFieldProps) => {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const isFull = max != null && value.length >= max;

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files ?? []);
        // Reset first so picking the same file twice in a row still fires a change event.
        event.target.value = '';
        if (files.length) onSelect(files);
    };

    return (
        <div className={cn('flex w-full flex-col gap-2 px-4', className)}>
            <div className="flex w-full flex-col gap-4">
                {label && (
                    <span className="text-[14px] font-semibold leading-[18px] tracking-[0.07px] text-label">
                        {label}
                    </span>
                )}

                {!isFull && (
                    <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        disabled={disabled}
                        className={cn(
                            // Figma BK_200 — the kit has no token between --input-border (BK_100)
                            // and --placeholder (BK_400).
                            'flex h-[144px] w-full flex-col items-center justify-center gap-4 rounded-[24px] border border-dashed border-[#DFE0E2] bg-surface px-2 py-6 transition-colors',
                            disabled ? 'opacity-50' : 'hover:border-focus-border'
                        )}
                    >
                        <IconGalleryAdd size={40} className="text-brand-ink" />
                        {hint && (
                            <span className="whitespace-pre-line text-center text-[14px] font-medium leading-[1.4] tracking-[-0.07px] text-label">
                                {hint}
                            </span>
                        )}
                    </button>
                )}

                {value.length > 0 && (
                    <ul className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pt-1.5">
                        {value.map((src, index) => (
                            <li key={`${index}-${src.slice(-24)}`} className="relative shrink-0">
                                <img
                                    src={src}
                                    alt=""
                                    className="size-[88px] rounded-[10px] border border-placeholder object-cover"
                                />
                                <button
                                    type="button"
                                    onClick={() => onRemove(index)}
                                    disabled={disabled}
                                    aria-label={removeLabel(index + 1)}
                                    className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-input-border"
                                >
                                    <IconClose className="size-3 text-label" strokeWidth={2.5} />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {description && <p className="pl-0.5 text-[12px] leading-[18px] text-description">{description}</p>}

            <input
                ref={inputRef}
                type="file"
                accept={accept}
                multiple
                onChange={handleChange}
                className="hidden"
                tabIndex={-1}
            />
        </div>
    );
};
