import { useCallback, useRef } from 'react';

import { resizeImageToBase64 } from '@chatic/shared';

/** Anything larger is rejected before decoding — a 10MB photo is a mistake, not a choice. */
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

/** Longest edge of the stored thumbnail, in px. */
const THUMBNAIL_EDGE = 150;

export interface PickImageOptions {
    /** Receives the resized base64 thumbnail. */
    onPicked: (base64: string) => void;
    /** Called when the file is too large or cannot be decoded. */
    onError: () => void;
}

/**
 * The file-picker half of every "choose a photo" field: a hidden input, a click that opens it, and
 * a change handler that size-checks and resizes.
 *
 * Extracted so the profile form and the setup wizard share one size limit and one resize step —
 * two copies would drift into two different maximum photo sizes.
 */
export const usePickImage = ({ onPicked, onError }: PickImageOptions) => {
    const inputRef = useRef<HTMLInputElement>(null);

    const open = useCallback(() => inputRef.current?.click(), []);

    const handleChange = useCallback(
        async (event: React.ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            // Cleared before the await so picking the same file twice in a row still fires.
            event.target.value = '';
            if (!file) return;
            if (file.size > MAX_IMAGE_SIZE) {
                onError();
                return;
            }
            try {
                onPicked(await resizeImageToBase64(file, THUMBNAIL_EDGE));
            } catch {
                onError();
            }
        },
        [onPicked, onError]
    );

    /** Spread onto a visually hidden `<input type="file">`. */
    const inputProps = {
        ref: inputRef,
        type: 'file' as const,
        accept: 'image/jpeg,image/png,image/webp',
        className: 'hidden',
        onChange: handleChange,
    };

    return { open, inputProps };
};
