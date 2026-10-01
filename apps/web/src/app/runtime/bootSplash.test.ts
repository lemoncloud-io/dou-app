jest.mock('../bridge/appBridge', () => ({ appBridge: { notifyFirstScreenReady: jest.fn() } }));

import { createBootSplash } from './bootSplash';

/** A boot cover whose frames and timers the test advances by hand. */
const setup = () => {
    const frames: Array<() => void> = [];
    const timers: Array<{ callback: () => void; ms: number }> = [];
    const removeCover = jest.fn();
    const notifyShell = jest.fn();
    const splash = createBootSplash({
        removeCover,
        notifyShell,
        requestFrame: callback => frames.push(callback),
        setTimer: (callback, ms) => timers.push({ callback, ms }),
    });
    /** Runs the frames queued so far, one at a time, as the browser would. */
    const nextFrame = () => frames.splice(0).forEach(run => run());
    return { splash, frames, timers, removeCover, notifyShell, nextFrame };
};

describe('bootSplash', () => {
    it('lifts the cover two frames after the first route mounts, and tells the shell', () => {
        const { splash, removeCover, notifyShell, nextFrame } = setup();

        splash.markRouteMounted();
        nextFrame();
        expect(removeCover).not.toHaveBeenCalled();

        nextFrame();
        expect(removeCover).toHaveBeenCalledTimes(1);
        expect(notifyShell).toHaveBeenCalledTimes(1);
    });

    it('stays up while nothing has mounted a route, however many frames pass', () => {
        const { splash, frames, removeCover } = setup();

        splash.hold()();

        expect(frames).toHaveLength(0);
        expect(removeCover).not.toHaveBeenCalled();
    });

    it('waits for every hold to clear before lifting', () => {
        const { splash, removeCover, nextFrame } = setup();
        const releaseChunk = splash.hold();
        const releaseNavigation = splash.hold();

        splash.markRouteMounted();
        releaseChunk();
        nextFrame();
        nextFrame();
        expect(removeCover).not.toHaveBeenCalled();

        releaseNavigation();
        nextFrame();
        nextFrame();
        expect(removeCover).toHaveBeenCalledTimes(1);
    });

    // A cold-start deep link can replay into a lazy route right after home mounts: the route's
    // fallback takes a hold inside the two-frame window, and the cover must not come down onto it.
    it('cancels a pending release when a hold is taken inside the two-frame window', () => {
        const { splash, removeCover, nextFrame } = setup();

        splash.markRouteMounted();
        nextFrame();
        const releaseFallback = splash.hold();
        nextFrame();
        expect(removeCover).not.toHaveBeenCalled();

        releaseFallback();
        nextFrame();
        nextFrame();
        expect(removeCover).toHaveBeenCalledTimes(1);
    });

    it('counts a hold released twice only once', () => {
        const { splash, removeCover, nextFrame } = setup();
        const releaseA = splash.hold();
        splash.hold();

        splash.markRouteMounted();
        releaseA();
        releaseA();
        nextFrame();
        nextFrame();

        expect(removeCover).not.toHaveBeenCalled();
    });

    it('lifts on the safety cap even with a hold that never clears', () => {
        const { splash, timers, removeCover, notifyShell } = setup();
        splash.hold();
        splash.markRouteMounted();

        splash.armCap(10_000);
        expect(timers[0].ms).toBe(10_000);
        timers[0].callback();

        expect(removeCover).toHaveBeenCalledTimes(1);
        expect(notifyShell).toHaveBeenCalledTimes(1);
    });

    it('releases once: a later release, cap or route mount does nothing', () => {
        const { splash, timers, removeCover, notifyShell, nextFrame } = setup();
        splash.armCap(10_000);

        splash.release('error');
        splash.markRouteMounted();
        nextFrame();
        nextFrame();
        timers[0].callback();

        expect(removeCover).toHaveBeenCalledTimes(1);
        expect(notifyShell).toHaveBeenCalledTimes(1);
    });

    it('hands out an inert hold after the cover is gone', () => {
        const { splash, frames, removeCover } = setup();
        splash.release('first-screen');

        const releaseLate = splash.hold();
        splash.markRouteMounted();
        releaseLate();

        expect(frames).toHaveLength(0);
        expect(removeCover).toHaveBeenCalledTimes(1);
    });
});
