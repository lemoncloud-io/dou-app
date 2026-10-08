import { SLIDE_MS, slideEase } from '@chatic/web-ui-kit';

import { createSlotSlide } from './slotSlide';

/** One frame of the fake clock: jest's fake `requestAnimationFrame` runs every 16 ms. */
const FRAME_MS = 16;

const setup = (initial = 0) => {
    const drawn: { at: number; position: number }[] = [];
    const events: string[] = [];
    const slot = createSlotSlide(
        {
            draw: position => drawn.push({ at: performance.now(), position }),
            onStart: () => events.push('start'),
            onStop: () => events.push('stop'),
            onArrive: position => events.push(`arrive ${position}`),
        },
        initial
    );
    return { slot, drawn, events };
};

beforeEach(() => {
    jest.useFakeTimers();
});

afterEach(() => {
    jest.useRealTimers();
});

describe('createSlotSlide', () => {
    it('draws the first position at once, then one per frame on the curve, and lands exactly on the end', () => {
        const { slot, drawn, events } = setup();
        const startedAt = performance.now();

        slot.slide(1);

        // Drawn before anything could be painted, and already moving things.
        expect(drawn).toEqual([{ at: startedAt, position: 0 }]);
        expect(events).toEqual(['start']);
        expect(slot.sliding).toBe(true);

        jest.advanceTimersByTime(SLIDE_MS + FRAME_MS);

        const frames = drawn.slice(1);
        // Every frame is the curve at the time elapsed, and they only rise.
        for (const { at, position } of frames.slice(0, -1)) {
            expect(position).toBeCloseTo(slideEase((at - startedAt) / SLIDE_MS), 10);
        }
        const positions = frames.map(frame => frame.position);
        expect(positions).toEqual([...positions].sort((a, b) => a - b));
        expect(positions.length).toBeGreaterThan(10);
        expect(frames.at(-1)?.position).toBe(1);
        expect(events).toEqual(['start', 'stop', 'arrive 1']);
        expect(slot.sliding).toBe(false);
        expect(slot.position).toBe(1);
    });

    it('stops drawing once it has arrived', () => {
        const { slot, drawn } = setup();
        slot.slide(1);
        jest.advanceTimersByTime(SLIDE_MS + FRAME_MS);
        const count = drawn.length;

        jest.advanceTimersByTime(10 * FRAME_MS);

        expect(drawn).toHaveLength(count);
        expect(jest.getTimerCount()).toBe(0);
    });

    it('turns a slide around from where it has got to, taking the share of the time its distance is', () => {
        const { slot, drawn, events } = setup();
        slot.slide(1);
        jest.advanceTimersByTime(5 * FRAME_MS);
        const reached = slot.position;
        expect(reached).toBeGreaterThan(0);
        expect(reached).toBeLessThan(1);
        const turnedAt = performance.now();
        const before = drawn.length;

        slot.slide(0);

        // No jump: the first position drawn for the way back is the one the slide had reached.
        expect(drawn[before].position).toBe(reached);
        jest.advanceTimersByTime(SLIDE_MS * reached + FRAME_MS);
        const back = drawn.slice(before + 1);
        for (const { at, position } of back.slice(0, -1)) {
            expect(position).toBeCloseTo(reached * (1 - slideEase((at - turnedAt) / (SLIDE_MS * reached))), 10);
        }
        expect(slot.position).toBe(0);
        // One movement from rest to rest: the slide turned around is not reported as arriving anywhere.
        expect(events).toEqual(['start', 'stop', 'arrive 0']);
    });

    it('stops a slide where it stands on a jump, drawing and reporting no arrival', () => {
        const { slot, drawn, events } = setup();
        slot.slide(1);
        jest.advanceTimersByTime(3 * FRAME_MS);
        const count = drawn.length;

        slot.jump(1);

        expect(slot.position).toBe(1);
        expect(slot.sliding).toBe(false);
        jest.advanceTimersByTime(SLIDE_MS);
        expect(drawn).toHaveLength(count);
        expect(events).toEqual(['start', 'stop']);
    });

    it('slides from where a jump left it', () => {
        const { slot, drawn, events } = setup();
        slot.jump(1);
        expect(events).toEqual([]);

        slot.slide(0);

        expect(drawn[0].position).toBe(1);
        jest.advanceTimersByTime(SLIDE_MS + FRAME_MS);
        expect(slot.position).toBe(0);
        expect(events).toEqual(['start', 'stop', 'arrive 0']);
    });

    it('arrives at once, moving nothing, when it is already where it is asked to go', () => {
        const { slot, drawn, events } = setup(1);

        slot.slide(1);

        expect(drawn).toEqual([]);
        expect(events).toEqual(['arrive 1']);
        expect(jest.getTimerCount()).toBe(0);
    });

    it('draws nothing more once disposed', () => {
        const { slot, drawn, events } = setup();
        slot.slide(1);
        const count = drawn.length;

        slot.dispose();
        jest.advanceTimersByTime(SLIDE_MS + FRAME_MS);
        slot.slide(0);

        expect(drawn).toHaveLength(count);
        expect(events).toEqual(['start']);
    });
});
