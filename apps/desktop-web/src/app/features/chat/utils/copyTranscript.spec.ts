import { afterEach, describe, expect, it } from 'vitest';

import type { DomainChat } from '@chatic/runtime';

import { formatClockTime, formatFullDate } from '../../../shared/utils';
import type { MessageRowItem } from './buildMessageRows';
import { formatTranscript, selectedTranscript } from './copyTranscript';

const DAY = new Date('2026-08-03T10:00:00').getTime();
const NEXT_DAY = new Date('2026-08-04T09:30:00').getTime();

const chat = (over: Partial<DomainChat>): DomainChat =>
    ({ channelId: 'C1', createdAt: DAY, ownerId: 'ada', ...over }) as DomainChat;

const group = (ownerName: string, messages: DomainChat[]): MessageRowItem => ({
    kind: 'group',
    group: {
        key: `g-${messages[0].chatNo}`,
        ownerId: ownerName,
        ownerName,
        namePending: false,
        isWebhook: false,
        avatar: undefined,
        isMine: false,
        colorSeed: ownerName,
        timestamp: messages[0].createdAt ?? 0,
        messages,
    },
});

const DELETED = 'This message was deleted.';

describe('formatTranscript', () => {
    it('writes each message as [author] [time] text under its day', () => {
        const text = formatTranscript(
            [
                { authorName: 'Ada', message: chat({ chatNo: 1, content: 'hello' }) },
                { authorName: 'Bob', message: chat({ chatNo: 2, content: 'hi there' }) },
                { authorName: 'Ada', message: chat({ chatNo: 3, content: 'next day', createdAt: NEXT_DAY }) },
            ],
            DELETED
        );

        expect(text.split('\n')).toEqual([
            formatFullDate(DAY),
            `[Ada] [${formatClockTime(DAY)}] hello`,
            `[Bob] [${formatClockTime(DAY)}] hi there`,
            formatFullDate(NEXT_DAY),
            `[Ada] [${formatClockTime(NEXT_DAY)}] next day`,
        ]);
    });

    it('names the files of a message that has no text', () => {
        const message = chat({
            chatNo: 1,
            content: '',
            upload$$: [{ name: 'report.pdf' }, { localName: 'photo.png', localStatus: 'sending' }],
        } as Partial<DomainChat>);

        expect(formatTranscript([{ authorName: 'Ada', message }], DELETED).split('\n')[1]).toBe(
            `[Ada] [${formatClockTime(DAY)}] report.pdf, photo.png`
        );
    });

    it('reads a Block Kit message as its text, not its JSON', () => {
        const content = JSON.stringify({ blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'Deployed' } }] });

        const line = formatTranscript(
            [{ authorName: 'Bot', message: chat({ chatNo: 1, content, stereo: 'webhook' }) }],
            DELETED
        ).split('\n')[1];

        expect(line).toContain('Deployed');
        expect(line).not.toContain('"blocks"');
    });

    it('writes a deleted message as the deleted label, never its kept text', () => {
        const text = formatTranscript(
            [{ authorName: 'Ada', message: chat({ chatNo: 1, content: 'secret', hidden: true }) }],
            DELETED
        );

        expect(text).not.toContain('secret');
        expect(text.split('\n')[1]).toBe(`[Ada] [${formatClockTime(DAY)}] ${DELETED}`);
    });
});

describe('selectedTranscript', () => {
    const sent = [chat({ id: 'C1:1', chatNo: 1, content: 'one' }), chat({ id: 'C1:2', chatNo: 2, content: 'two' })];
    const pending = [
        chat({ tempId: 't1', chatNo: 0, content: 'pending one', isPending: true }),
        chat({ tempId: 't2', chatNo: 0, content: 'pending two', isPending: true }),
        chat({ tempId: 't3', chatNo: 0, content: 'failed', isFailed: true }),
    ];
    const rows = [group('Ada', sent), group('Bob', pending)];

    const mount = () => {
        const root = document.createElement('div');
        root.innerHTML = [...sent, ...pending]
            .map(m => `<div data-message-key="${m.id ?? m.tempId}"><p>${m.content}</p></div>`)
            .join('');
        document.body.append(root);
        return root;
    };

    const textOf = (root: HTMLElement, key: string) =>
        root.querySelector(`[data-message-key="${key}"] p`)?.firstChild as Text;

    const select = (from: Node, fromOffset: number, to: Node, toOffset: number) => {
        const range = document.createRange();
        range.setStart(from, fromOffset);
        range.setEnd(to, toOffset);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        return selection;
    };

    const run = (selection: Selection | null, root: HTMLElement) =>
        selectedTranscript(root, selection, rows, DELETED)?.split('\n');

    afterEach(() => {
        window.getSelection()?.removeAllRanges();
        document.body.innerHTML = '';
    });

    it('writes the messages a selection touches, with their authors', () => {
        const root = mount();
        const two = textOf(root, 'C1:2');
        const t1 = textOf(root, 't1');

        expect(run(select(two, 0, t1, t1.length), root)).toEqual([
            formatFullDate(DAY),
            `[Ada] [${formatClockTime(DAY)}] two`,
            `[Bob] [${formatClockTime(DAY)}] pending one`,
        ]);
    });

    it('tells unsent messages apart, so one pending message does not pull in the others', () => {
        const root = mount();
        const t1 = textOf(root, 't1');
        const t2 = textOf(root, 't2');

        expect(run(select(t1, 0, t2, t2.length), root)).toEqual([
            formatFullDate(DAY),
            `[Bob] [${formatClockTime(DAY)}] pending one`,
            `[Bob] [${formatClockTime(DAY)}] pending two`,
        ]);
    });

    it('leaves out a message whose text the selection only touches at its edge', () => {
        const root = mount();
        const one = textOf(root, 'C1:1');
        const two = textOf(root, 'C1:2');
        const t1 = textOf(root, 't1');

        expect(run(select(one, one.length, t1, t1.length), root)).toHaveLength(3);
        expect(run(select(one, 0, two, 0), root)).toBeUndefined();
    });

    it('leaves a selection inside one message to the browser', () => {
        const root = mount();
        const one = textOf(root, 'C1:1');

        expect(run(select(one, 0, one, one.length), root)).toBeUndefined();
    });

    it('leaves a collapsed selection to the browser', () => {
        const root = mount();
        const selection = select(textOf(root, 'C1:1'), 0, textOf(root, 't2'), 1);
        selection?.collapseToStart();

        expect(run(selection, root)).toBeUndefined();
    });
});
