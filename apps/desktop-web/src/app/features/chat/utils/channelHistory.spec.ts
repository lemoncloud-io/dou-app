import { describe, expect, it } from 'vitest';

import type { MessageJumpOrigin } from '../../../shared';
import { EMPTY_HISTORY, HISTORY_LIMIT, recordMove, stepHistory } from './channelHistory';

const room = (channelId: string, over: Partial<MessageJumpOrigin> = {}): MessageJumpOrigin => ({
    cloudId: 'C1',
    placeId: 'P1',
    channelId,
    label: `#${channelId}`,
    anchorChatNo: null,
    threadRootId: null,
    sameChannel: false,
    ...over,
});

const always = () => true;

describe('recordMove', () => {
    it('puts the room left on Back and clears Forward', () => {
        const history = recordMove({ back: [room('A')], forward: [room('Z')] }, room('B'));
        expect(history.back.map(entry => entry.channelId)).toEqual(['A', 'B']);
        expect(history.forward).toEqual([]);
    });

    it('drops the oldest step past the limit', () => {
        let history = EMPTY_HISTORY;
        for (let i = 0; i <= HISTORY_LIMIT; i += 1) history = recordMove(history, room(`R${i}`));
        expect(history.back).toHaveLength(HISTORY_LIMIT);
        expect(history.back[0].channelId).toBe('R1');
    });
});

describe('stepHistory', () => {
    it('steps back to the last room left, and Forward returns to where it started', () => {
        const back = stepHistory({ back: [room('A'), room('B')], forward: [] }, 'back', room('C'), always);
        expect(back?.target.channelId).toBe('B');
        expect(back?.history.back.map(entry => entry.channelId)).toEqual(['A']);
        expect(back?.history.forward.map(entry => entry.channelId)).toEqual(['C']);

        if (!back) throw new Error('expected a step back');
        const forward = stepHistory(back.history, 'forward', back.target, always);
        expect(forward?.target.channelId).toBe('C');
        expect(forward?.history.back.map(entry => entry.channelId)).toEqual(['A', 'B']);
        expect(forward?.history.forward).toEqual([]);
    });

    it('keeps the reading position the entry was recorded with', () => {
        const step = stepHistory(
            { back: [room('A', { anchorChatNo: 42, threadRootId: '40' })], forward: [] },
            'back',
            room('B'),
            always
        );
        expect(step?.target).toMatchObject({ channelId: 'A', anchorChatNo: 42, threadRootId: '40' });
    });

    it('passes over and drops a room the reader can no longer reach', () => {
        const step = stepHistory(
            { back: [room('A'), room('GONE')], forward: [] },
            'back',
            room('B'),
            entry => entry.channelId !== 'GONE'
        );
        expect(step?.target.channelId).toBe('A');
        expect(step?.history.back).toEqual([]);
    });

    it('passes over the room the reader is already in, so a press always moves', () => {
        const step = stepHistory({ back: [room('A'), room('B')], forward: [] }, 'back', room('B'), always);
        expect(step?.target.channelId).toBe('A');
    });

    it('tells a room in another place apart from the same id here', () => {
        const step = stepHistory(
            { back: [room('SELF', { placeId: 'P2' })], forward: [] },
            'back',
            room('SELF'),
            always
        );
        expect(step?.target.placeId).toBe('P2');
    });

    it('returns null, and leaves the history alone, when there is nowhere to go', () => {
        expect(stepHistory(EMPTY_HISTORY, 'back', room('A'), always)).toBeNull();
        expect(stepHistory({ back: [room('GONE')], forward: [] }, 'back', room('A'), () => false)).toBeNull();
        expect(stepHistory({ back: [room('A')], forward: [] }, 'forward', room('B'), always)).toBeNull();
    });

    it('steps with no room open, recording nothing to come back to', () => {
        const step = stepHistory({ back: [room('A')], forward: [] }, 'back', null, always);
        expect(step?.target.channelId).toBe('A');
        expect(step?.history.forward).toEqual([]);
    });
});
