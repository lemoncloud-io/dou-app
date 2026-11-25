import { useEffect, useState } from 'react';

import type { ChatAttachmentSource } from '@chatic/runtime-react';

export const useLocalAudioDurations = (
    items: readonly ChatAttachmentSource[]
): ReadonlyMap<ChatAttachmentSource, number> => {
    const [durations, setDurations] = useState<ReadonlyMap<ChatAttachmentSource, number>>(() => new Map());

    useEffect(() => {
        if (typeof URL.createObjectURL !== 'function' || typeof Audio === 'undefined') return undefined;
        const cleanups: Array<() => void> = [];
        items.forEach(item => {
            if (!(item instanceof File)) return;
            const url = URL.createObjectURL(item);
            const audio = new Audio();
            audio.preload = 'metadata';
            const done = () => {
                audio.removeAttribute('src');
                URL.revokeObjectURL(url);
            };
            audio.onloadedmetadata = () => {
                const length = audio.duration;
                if (Number.isFinite(length) && length > 0) {
                    setDurations(previous => new Map(previous).set(item, length));
                }
                done();
            };
            audio.onerror = done;
            audio.src = url;
            cleanups.push(done);
        });
        return () => cleanups.forEach(cleanup => cleanup());
    }, [items]);

    return durations;
};
