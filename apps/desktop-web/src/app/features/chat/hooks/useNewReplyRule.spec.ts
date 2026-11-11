import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { DomainChat } from '@chatic/data';

import { useThreadStore } from '../stores';
import { useNewReplyRule } from './useNewReplyRule';

const VIEWER = { uid: 'me', name: 'Me', cloudUid: 'me-cloud' };

const chat = (chatNo: number, parentId?: string): DomainChat =>
    ({ id: `C1:${chatNo}`, channelId: 'C1', chatNo, ownerId: 'ada', parentId }) as DomainChat;

const render = (channelId: string, messages: DomainChat[]) =>
    renderHook(({ channelId, messages }) => useNewReplyRule(channelId, messages, 2, VIEWER), {
        initialProps: { channelId, messages },
    });

describe('useNewReplyRule', () => {
    afterEach(() => act(() => useThreadStore.getState().close()));

    it('starts with nothing seen, at the cursor the channel opened with', () => {
        const { result } = render('C1', [chat(1), chat(3, '1')]);

        expect(result.current.readNo).toBe(2);
        expect(result.current.seenByRoot?.size).toBe(0);
        expect(result.current.isMine(chat(3))).toBe(false);
    });

    it('marks an open thread seen up to the newest loaded message, and follows replies while open', () => {
        const { result, rerender } = render('C1', [chat(1), chat(3, '1')]);

        act(() => useThreadStore.getState().open('1', 'C1'));
        expect(result.current.seenByRoot?.get('1')).toBe(3);

        rerender({ channelId: 'C1', messages: [chat(1), chat(3, '1'), chat(4, '1')] });
        expect(result.current.seenByRoot?.get('1')).toBe(4);
    });

    // A thread open in another channel says nothing about this one's roots, which share the numbers.
    it('ignores a thread open in another channel', () => {
        const { result } = render('C1', [chat(1), chat(3, '1')]);

        act(() => useThreadStore.getState().open('1', 'C2'));

        expect(result.current.seenByRoot?.size).toBe(0);
    });

    it('forgets what was seen when the channel changes', () => {
        const { result, rerender } = render('C1', [chat(1), chat(3, '1')]);
        act(() => useThreadStore.getState().open('1', 'C1'));
        act(() => useThreadStore.getState().close());

        rerender({ channelId: 'C2', messages: [chat(1), chat(3, '1')] });

        expect(result.current.seenByRoot?.size).toBe(0);
    });
});
