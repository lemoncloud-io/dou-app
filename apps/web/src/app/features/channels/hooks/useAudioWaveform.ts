import { useEffect, useState } from 'react';

import { computeWaveform, decodeWithOfflineContext, type WaveformDeps } from '../lib/audioWaveform';
import { readWaveform, writeWaveform, type MediaScope } from '../lib/localMediaPrefs';

interface AudioWaveformInput {
    scope: MediaScope | undefined;
    uploadId: string | undefined;
    url: string | undefined;
    sizeBytes?: number;
    durationSeconds?: number;
}

const browserDeps: WaveformDeps = {
    fetch: (url, init) => fetch(url, init),
    decode: decodeWithOfflineContext,
};

export const useAudioWaveform = (
    { scope, uploadId, url, sizeBytes, durationSeconds }: AudioWaveformInput,
    deps: WaveformDeps = browserDeps
): readonly number[] | undefined => {
    const [bars, setBars] = useState<readonly number[] | undefined>(undefined);
    const cid = scope?.cid;
    const uid = scope?.uid;

    useEffect(() => {
        setBars(undefined);
        if (!cid || !uid || !uploadId || !url) return undefined;
        const owner = { cid, uid };
        const kept = readWaveform(owner, uploadId);
        if (kept === 'decorative') return undefined;
        if (kept) {
            setBars(kept);
            return undefined;
        }
        const controller = new AbortController();
        void computeWaveform({ url, sizeBytes, durationSeconds, signal: controller.signal }, deps).then(outcome => {
            if (outcome.kind === 'aborted' || controller.signal.aborted) return;
            if (outcome.kind === 'bars') {
                writeWaveform(owner, uploadId, outcome.bars);
                setBars(outcome.bars);
                return;
            }
            if (outcome.reason !== 'download') writeWaveform(owner, uploadId, 'decorative');
        });
        return () => controller.abort();
    }, [cid, uid, uploadId, url]);

    return bars;
};
