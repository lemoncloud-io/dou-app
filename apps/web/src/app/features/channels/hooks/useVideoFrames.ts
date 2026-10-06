import { useEffect, useReducer } from 'react';

import { isNative } from '@chatic/bridges';
import { drawVideoFrame, VIDEO_POSTER } from '@chatic/shared';

import { appBridge } from '../../../bridge/appBridge';
import { base64ToFile } from '../../../bridge/photoLibrary';
import { isAppleTouchWebKit } from '../utils/attachSources';
import { VideoFrames, type VideoFrameRequest } from '../lib/videoFrames';

import { getImageCache } from './useCachedImages';

/**
 * What a video tile without a poster draws, aligned with the requests:
 * - `pending` — not known yet; the grey panel.
 * - `image` — the frame, as an object URL from the image cache.
 * - `element` — the tile draws the frame itself from `url` (`MessageMediaTiles`' `frameUrl`).
 * - `none` — nothing can be drawn here; the grey panel stays.
 */
export type VideoFrameTile =
    | { status: 'pending' }
    | { status: 'image'; src: string }
    | { status: 'element'; url: string }
    | { status: 'none' };

/** The shell's frame, as the poster rule asks for it: 0.5 s in, 400 px on the long edge. */
const readShellFrame = async (url: string): Promise<Blob> => {
    const { data } = await appBridge.readVideoFrame({
        url,
        atMs: VIDEO_POSTER.atSeconds * 1000,
        maxEdge: VIDEO_POSTER.maxEdge,
    });
    return base64ToFile(data.base64, 'frame.jpg', data.contentType);
};

let shared: VideoFrames | null = null;

/** The page's one frame maker, so what it learned about the app and the bucket holds for every room. */
export const getVideoFrames = (): VideoFrames =>
    (shared ??= new VideoFrames({
        cache: getImageCache(),
        isNative,
        isAppleTouch: () => isAppleTouchWebKit(),
        readShellFrame,
        fetch: (url, init) => fetch(url, init),
        drawFrame: source => drawVideoFrame(source),
    }));

/** Test seam — swaps the page's frame maker; `null` builds a real one on the next call. */
export const setVideoFramesForTest = (frames: VideoFrames | null): void => {
    shared = frames;
};

/**
 * The first frames of a message's videos that came without a poster. Nothing is read until `visible`
 * — the message is on screen — and a request still waiting when it leaves is withdrawn, so scrolling
 * through a room does not queue up a read of every video in it. A frame already kept from an earlier
 * visit is drawn as soon as the message shows.
 *
 * A frame in the cache is read from its memory at render time, never remembered here, for the same
 * reason `useCachedImages` gives: an object URL remembered past its entry could already be revoked.
 * Each one asked for is held (`retain`) while this row is mounted.
 */
export const useVideoFrames = (
    requests: readonly (VideoFrameRequest | undefined)[],
    visible: boolean
): (VideoFrameTile | undefined)[] => {
    const cache = getImageCache();
    const frames = getVideoFrames();
    const [, rerender] = useReducer((n: number) => n + 1, 0);
    // A dependency on the content rather than the array, which a caller rebuilds every render.
    const signature = requests.map(request => (request ? `${request.key}\u0000${request.url}` : '')).join('\u0001');

    // A redraw when an entry leaves memory, not a new round of requests: the frames asked for here are
    // held, so they are not what left, and re-running the effect would send every queued request of
    // every mounted row to the back of the queue for someone else's eviction.
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
        // `signature` is the content of `requests`.
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
