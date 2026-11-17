import { describe, expect, it } from 'vitest';

import { readIncomingCard } from './readIncomingCard';

const encode = (value: unknown): string => {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    return btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
};

const CARD = {
    title: 'Aiden배동준 · 반차',
    text: '10월 7일 (수) · 오후반차',
    color: 'good',
    footer: 'lemoment · leave',
};

describe('readIncomingCard', () => {
    it('reads the builder id and lays the card out as header, section and context', () => {
        const incoming = readIncomingCard('?template=lemoment.leave', `#card=${encode(CARD)}`);

        expect(incoming).toEqual({
            templateId: 'lemoment.leave',
            blocks: [
                { type: 'header', text: { type: 'plain_text', text: 'Aiden배동준 · 반차' } },
                { type: 'section', text: { type: 'mrkdwn', text: '10월 7일 (수) · 오후반차' } },
                { type: 'context', elements: [{ type: 'mrkdwn', text: 'lemoment · leave' }] },
            ],
            source: { key: '', color: 'good', url: '' },
        });
    });

    it('lays the fields out as a two-column section under the body, dropping empty cells', () => {
        const card = {
            ...CARD,
            text: '오후반차',
            fields: [
                { title: '날짜', value: '10월 7일 (수)' },
                { title: '일수', value: 1 },
                { title: '빈칸', value: '' },
            ],
        };
        const incoming = readIncomingCard('?template=lemoment.leave', `#card=${encode(card)}`);

        expect(incoming?.blocks).toEqual([
            { type: 'header', text: { type: 'plain_text', text: 'Aiden배동준 · 반차' } },
            { type: 'section', text: { type: 'mrkdwn', text: '오후반차' } },
            {
                type: 'section',
                fields: [
                    { type: 'mrkdwn', text: '*날짜*\n10월 7일 (수)' },
                    { type: 'mrkdwn', text: '*일수*\n1' },
                ],
            },
            { type: 'context', elements: [{ type: 'mrkdwn', text: 'lemoment · leave' }] },
        ]);
    });

    it('takes the badge from the card when it names its channel', () => {
        const incoming = readIncomingCard('?template=x', `#card=${encode({ ...CARD, channel: 'attendance' })}`);

        expect(incoming?.source.key).toBe('attendance');
    });

    it('leaves out the blocks the card has no text for', () => {
        const incoming = readIncomingCard('?template=x', `#card=${encode({ title: '제목' })}`);

        expect(incoming?.blocks).toEqual([{ type: 'header', text: { type: 'plain_text', text: '제목' } }]);
    });

    it.each([
        ['no template', '', `#card=${encode(CARD)}`],
        ['no card', '?template=x', ''],
        ['a card that is not base64 JSON', '?template=x', '#card=%%%'],
        ['a card with neither title nor text', '?template=x', `#card=${encode({ footer: 'f' })}`],
    ])('is null for %s', (_label, search, hash) => {
        expect(readIncomingCard(search, hash)).toBeNull();
    });
});
