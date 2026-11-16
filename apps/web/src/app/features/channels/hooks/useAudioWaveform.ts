import { useEffect, useState } from 'react';

import { computeWaveform, decodeWithOfflineContext, type WaveformDeps } from '../lib/audioWaveform';
import { readWaveform, writeWaveform, type MediaScope } from '../lib/localMediaPrefs';

interface AudioWaveformInput {
    scope: MediaScope | undefined;
    uploadId: string | undefined;
    url: string | undefined;
    sizeBytes?: number;
    /** The length when the player already knows it. */
    durationSeconds?: number;
}

const browserDeps: WaveformDeps = {
    fetch: (url, init) => fetch(url, init),
    decode: decodeWithOfflineContext,
};

/**
 * The bars the audio detail draws for one upload: kept ones at once, else computed from the file once
 * the screen is open (`computeWaveform`) and kept. `undefined` means "draw the decorative shape" — still
 * computing, over the limits, or failed. A file over the limits or one that does not decode is kept as
 * `decorative`, so it is not tried again; a failed download and leaving the screen keep nothing.
 */
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
            // A failed download may only be an expired address (the cached row's, before the server's copy
            // arrives) or a moment offline: it is tried again next time rather than remembered.
            if (outcome.reason !== 'download') writeWaveform(owner, uploadId, 'decorative');
        });
        return () => controller.abort();
        // A new address for the same upload (the server's copy replacing the cached row's) starts over;
        // kept bars answer it at once.
    }, [cid, uid, uploadId, url]);

    return bars;
};
