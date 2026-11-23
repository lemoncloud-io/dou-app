import { useCallback, useRef } from 'react';

import { AVATAR_IMAGE, prepareImage } from '@chatic/shared';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

export interface PickImageOptions {
    onPicked: (base64: string) => void;
    onError: () => void;
}

export const usePickImage = ({ onPicked, onError }: PickImageOptions) => {
    const inputRef = useRef<HTMLInputElement>(null);

    const open = useCallback(() => inputRef.current?.click(), []);

    const handleChange = useCallback(
        async (event: React.ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            if (file.size > MAX_IMAGE_SIZE) {
                onError();
                return;
            }
            try {
                const { avatar } = await prepareImage(file, AVATAR_IMAGE);
                if (!avatar) throw new Error('Failed to prepare avatar image');
                onPicked(avatar);
            } catch {
                onError();
            }
        },
        [onPicked, onError]
    );

    const inputProps = {
        ref: inputRef,
        type: 'file' as const,
        accept: 'image/jpeg,image/png,image/webp',
        className: 'hidden',
        onChange: handleChange,
    };

    return { open, inputProps };
};
