import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useMessageJumpStore } from '../../../shared';
import { useChannelHistoryStore } from '../stores/useChannelHistoryStore';
import type { ReaderLocation } from '../utils/jumpReturn';
import { useChannelHistory } from './useChannelHistory';

interface Props {
    here: ReaderLocation;
    threadRootId: string | null;
    landing: boolean;
    unlisted?: boolean;
}

const at = (channelId: string | null, over: Partial<ReaderLocation> = {}): ReaderLocation => ({
    cloudId: 'C1',
    placeId: 'P1',
    channelId,
    ...over,
});

const render = (initial: Props) =>
    renderHook(
        ({ here, threadRootId, landing, unlisted }: Props) =>
            useChannelHistory({
                here,
                label: here.channelId && !unlisted ? `#${here.channelId}` : null,
                threadRootId,
                isLanding: () => landing,
            }),
        { initialProps: initial }
    );

const backIds = () => useChannelHistoryStore.getState().back.map(entry => entry.channelId);
const forwardIds = () => useChannelHistoryStore.getState().forward.map(entry => entry.channelId);
const always = () => true;

describe('useChannelHistory', () => {
    beforeEach(() => {
        useChannelHistoryStore.getState().set({ back: [], forward: [] });
        useMessageJumpStore.setState({ position: null });
    });

    it('records the room left each time the open room changes, by whatever door', () => {
        const { rerender } = render({ here: at('A'), threadRootId: null, landing: false });
        rerender({ here: at('B'), threadRootId: null, landing: false });
        rerender({ here: at('C'), threadRootId: null, landing: false });
        expect(backIds()).toEqual(['A', 'B']);
    });

    it('records nothing for the first room opened', () => {
        render({ here: at('A'), threadRootId: null, landing: false });
        expect(backIds()).toEqual([]);
    });

    it('keeps where the reader was reading and the thread beside it', () => {
        const { rerender } = render({ here: at('A'), threadRootId: null, landing: false });
        act(() => useMessageJumpStore.getState().setPosition({ channelId: 'A', chatNo: 17 }));
        rerender({ here: at('A'), threadRootId: '12', landing: false });
        act(() => useMessageJumpStore.getState().setPosition({ channelId: 'B', chatNo: 99 }));
        rerender({ here: at('B'), threadRootId: null, landing: false });
        expect(useChannelHistoryStore.getState().back[0]).toMatchObject({
            channelId: 'A',
            anchorChatNo: 17,
            threadRootId: '12',
            label: '#A',
        });
    });

    it('waits through a switch and records the room it started from, in its own place', () => {
        const { rerender } = render({ here: at('A'), threadRootId: null, landing: false });
        rerender({ here: at('A', { placeId: 'P2' }), threadRootId: null, landing: false, unlisted: true });
        rerender({ here: at(null, { placeId: 'P2' }), threadRootId: null, landing: false });
        rerender({ here: at('B', { placeId: 'P2' }), threadRootId: null, landing: false });
        expect(useChannelHistoryStore.getState().back).toEqual([
            expect.objectContaining({ channelId: 'A', placeId: 'P1' }),
        ]);
    });

    it('records a move between places on the self room', () => {
        const { rerender } = render({ here: at('SELF'), threadRootId: null, landing: false });
        rerender({ here: at('SELF', { placeId: 'P2' }), threadRootId: null, landing: false });
        expect(useChannelHistoryStore.getState().back).toEqual([
            expect.objectContaining({ channelId: 'SELF', placeId: 'P1' }),
        ]);
    });

    it('starts a room at the position the feed already reported for it', () => {
        const { rerender } = render({ here: at('A'), threadRootId: null, landing: false });
        act(() => useMessageJumpStore.getState().setPosition({ channelId: 'B', chatNo: 31 }));
        rerender({ here: at('B'), threadRootId: null, landing: false });
        rerender({ here: at('C'), threadRootId: null, landing: false });
        expect(useChannelHistoryStore.getState().back[1]).toMatchObject({ channelId: 'B', anchorChatNo: 31 });
    });

    it('does not record the rooms an open passes through on its way', () => {
        const { rerender } = render({ here: at('A'), threadRootId: null, landing: false });
        rerender({ here: at('FIRST'), threadRootId: null, landing: true });
        rerender({ here: at('TARGET'), threadRootId: null, landing: false });
        expect(backIds()).toEqual(['A']);
    });

    it('steps back without recording the step as a move, and Forward returns', () => {
        const { result, rerender } = render({ here: at('A'), threadRootId: null, landing: false });
        rerender({ here: at('B'), threadRootId: null, landing: false });

        let target: ReturnType<typeof result.current.step> = null;
        act(() => {
            target = result.current.step('back', always);
        });
        expect(target).toMatchObject({ channelId: 'A' });
        rerender({ here: at('A'), threadRootId: null, landing: false });
        expect(backIds()).toEqual([]);
        expect(forwardIds()).toEqual(['B']);

        act(() => {
            target = result.current.step('forward', always);
        });
        expect(target).toMatchObject({ channelId: 'B' });
        rerender({ here: at('B'), threadRootId: null, landing: false });
        expect(backIds()).toEqual(['A']);
        expect(forwardIds()).toEqual([]);
    });

    it('does not record the rooms a step passes through before its own opens', () => {
        const { result, rerender } = render({ here: at('A'), threadRootId: null, landing: false });
        rerender({ here: at('B', { placeId: 'P2' }), threadRootId: null, landing: false });
        act(() => {
            result.current.step('back', always);
        });
        rerender({ here: at('FIRST'), threadRootId: null, landing: true });
        rerender({ here: at('A'), threadRootId: null, landing: false });
        expect(backIds()).toEqual([]);
        expect(forwardIds()).toEqual(['B']);
    });

    it('records a move of the reader that overtakes a step', () => {
        const { result, rerender } = render({ here: at('A'), threadRootId: null, landing: false });
        rerender({ here: at('B'), threadRootId: null, landing: false });
        act(() => {
            result.current.step('back', always);
        });
        rerender({ here: at('C'), threadRootId: null, landing: false });
        expect(backIds()).toEqual(['B']);
    });

    it('a new move after a step clears Forward', () => {
        const { result, rerender } = render({ here: at('A'), threadRootId: null, landing: false });
        rerender({ here: at('B'), threadRootId: null, landing: false });
        act(() => {
            result.current.step('back', always);
        });
        rerender({ here: at('A'), threadRootId: null, landing: false });
        rerender({ here: at('D'), threadRootId: null, landing: false });
        expect(backIds()).toEqual(['A']);
        expect(forwardIds()).toEqual([]);
    });

    it('returns null when there is nowhere to step', () => {
        const { result } = render({ here: at('A'), threadRootId: null, landing: false });
        expect(result.current.step('back', always)).toBeNull();
    });

    it('does not step with no room open, which would lose it from Forward', () => {
        useChannelHistoryStore.getState().set({ back: [], forward: [] });
        const { result } = render({ here: at(null), threadRootId: null, landing: false });
        useChannelHistoryStore.getState().set({
            back: [
                {
                    cloudId: 'C1',
                    placeId: 'P1',
                    channelId: 'A',
                    label: '#A',
                    anchorChatNo: null,
                    threadRootId: null,
                    sameChannel: false,
                },
            ],
            forward: [],
        });
        expect(result.current.step('back', always)).toBeNull();
    });
});
