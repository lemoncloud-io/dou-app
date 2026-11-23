import { useEffect, useReducer } from 'react';

import { runtime } from '@chatic/runtime';
import { drawVideoFrame, VIDEO_POSTER } from '@chatic/shared';

import { base64ToFile } from '../../../bridge/photoLibrary';
import { VideoFrames, type VideoFrameRequest } from '../lib/videoFrames';

import { getImageCache } from './useCachedImages';

export type VideoFrameTile =
    | { status: 'pending' }
    | { status: 'image'; src: string }
    | { status: 'element'; url: string }
    | { status: 'none' };

const readShellFrame = async (url: string): Promise<Blob> => {
    const transfers = runtime.files.transfers;
    if (!transfers) throw new Error('No app transfer module reads video frames on this host');
    const data = await transfers.readVideoFrame({
        url,
        atMs: VIDEO_POSTER.atSeconds * 1000,
        maxEdge: VIDEO_POSTER.maxEdge,
    });
    return base64ToFile(data.base64, 'frame.jpg', data.contentType);
};

let shared: VideoFrames | null = null;

export const getVideoFrames = (): VideoFrames =>
    (shared ??= new VideoFrames({
        cache: getImageCache(),
        fromApp: () => runtime.files.transfers !== null,
        readShellFrame,
        fetch: (url, init) => fetch(url, init),
        drawFrame: source => drawVideoFrame(source),
    }));

export const setVideoFramesForTest = (frames: VideoFrames | null): void => {
    shared = frames;
};

export const useVideoFrames = (
    requests: readonly (VideoFrameRequest | undefined)[],
    visible: boolean
): (VideoFrameTile | undefined)[] => {
    const cache = getImageCache();
    const frames = getVideoFrames();
    const [, rerender] = useReducer((n: number) => n + 1, 0);
    const signature = requests.map(request => (request ? `${request.key}\u0000${request.url}` : '')).join('\u0001');

    useEffect(() => cache.subscribe(rerender), [cache]);

    useEffect(() => {
        const live = requests.filter((request): request is VideoFrameRequest => !!request);
        live.forEach(request => cache.retain(request.key));
        let alive = true;
        const jobs = visible
            ? live
                  .filter(request => !cache.peek(request.key) && !frames.settled(request))
                  .map(request => frames.request(request))
            : [];
        jobs.forEach(
            job =>
                void job.result.then(outcome => {
                    if (alive && outcome) rerender();
                })
        );
        return () => {
            alive = false;
            jobs.forEach(job => job.cancel());
            live.forEach(request => cache.release(request.key));
        };
    }, [cache, frames, signature, visible]);

    return requests.map((request): VideoFrameTile | undefined => {
        if (!request) return undefined;
        const src = cache.peek(request.key);
        if (src) return { status: 'image', src };
        const settled = frames.settled(request);
        if (settled?.kind === 'element') return { status: 'element', url: request.url };
        if (settled?.kind === 'none') return { status: 'none' };
        return { status: 'pending' };
    });
};
