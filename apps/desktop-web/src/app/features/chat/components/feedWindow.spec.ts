import { describe, expect, it } from 'vitest';

import type { MessageRowItem } from '../utils';
import { indexOfChatNo, windowForViewport } from './feedWindow';

const flat = (count: number, height = 100): { count: number; heightOf: (i: number) => number } => ({
    count,
    heightOf: () => height,
});

const row = (kind: MessageRowItem['kind'], key: string): MessageRowItem =>
    kind === 'group'
        ? {
              kind: 'group',
              group: {
                  key,
                  ownerId: 'u',
                  ownerName: 'U',
                  namePending: false,
                  isWebhook: false,
                  avatar: undefined,
                  isMine: false,
                  colorSeed: 'u',
                  timestamp: 1,
                  messages: [],
              },
          }
        : kind === 'date'
          ? { kind, key, timestamp: 1 }
          : kind === 'system'
            ? { kind, key, chat: {} as never, authorName: 'U' }
            : kind === 'replies'
              ? { kind, key, count: 1 }
              : { kind, key };

describe('windowForViewport', () => {
    it('covers a short list whole', () => {
        expect(windowForViewport({ ...flat(5), scrollTop: 0, viewportHeight: 600 })).toEqual({ start: 0, end: 5 });
    });

    it('mounts nothing for an empty feed', () => {
        expect(windowForViewport({ ...flat(0), scrollTop: 0, viewportHeight: 600 })).toEqual({ start: 0, end: 0 });
    });

    it('windows a long list to the viewport plus overscan', () => {
        // 200 rows of 100px; lo = 5000-800, hi = 5000+500+800. Row 42 is the first
        // with its bottom past lo; row 62 the last with its top above hi.
        const win = windowForViewport({ ...flat(200), scrollTop: 5000, viewportHeight: 500 });
        expect(win).toEqual({ start: 42, end: 63 });
    });

    it('pins the window to the tail when scrolled to the bottom', () => {
        const win = windowForViewport({ ...flat(200), scrollTop: 20000 - 500, viewportHeight: 500 });
        expect(win.end).toBe(200);
        expect(win.start).toBeGreaterThan(150);
    });

    it('honours uneven measured heights', () => {
        const heights = [50, 50, 1000, 50, 50];
        const win = windowForViewport({
            count: 5,
            heightOf: i => heights[i],
            scrollTop: 900,
            viewportHeight: 100,
            overscanPx: 0,
        });
        expect(win).toEqual({ start: 2, end: 3 });
    });
});

describe('indexOfChatNo', () => {
    it('finds the row holding a message', () => {
        const group = (key: string, chatNos: number[]): MessageRowItem => ({
            kind: 'group',
            group: {
                key,
                ownerId: 'u',
                ownerName: 'U',
                namePending: false,
                isWebhook: false,
                avatar: undefined,
                isMine: false,
                colorSeed: 'u',
                timestamp: 1,
                messages: chatNos.map(chatNo => ({ chatNo }) as never),
            },
        });
        const rows = [group('g1', [1, 2]), row('date', 'd'), group('g2', [5])];
        expect(indexOfChatNo(rows, 2)).toBe(0);
        expect(indexOfChatNo(rows, 5)).toBe(2);
        expect(indexOfChatNo(rows, 9)).toBe(-1);
    });
});
