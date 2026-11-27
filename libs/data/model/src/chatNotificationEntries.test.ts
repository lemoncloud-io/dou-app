import { chatNotificationEntries, isNotifiableMessage } from './chatNotificationEntries';
import type { DomainChat } from './models';

const chat = (fields: Partial<DomainChat> = {}): DomainChat =>
    ({
        id: 'ch-1:10',
        cid: 'c1',
        channelId: 'ch-1',
        chatNo: 10,
        isPending: false,
        isFailed: false,
        createdAt: 5_000,
        createdAtMs: 9_999,
        ownerId: 'u-author',
        content: 'hello',
        ...fields,
    }) as DomainChat;

const base = { chatId: 'ch-1:10', channelId: 'ch-1', chatNo: 10, createdAt: 5_000, authorId: 'u-author' };

describe('chatNotificationEntries', () => {
    it('gives a plain message no entries', () => {
        expect(chatNotificationEntries(chat())).toEqual([]);
    });

    it('gives one mention entry per distinct named member', () => {
        const entries = chatNotificationEntries(chat({ mention$: { userIds: ['u2', 'u3', 'u2', ''] } } as never));

        expect(entries).toEqual([
            { ...base, kind: 'mention', ref: 'u2' },
            { ...base, kind: 'mention', ref: 'u3' },
        ]);
    });

    it('reads "everyone" whether it arrived as true from a read or as 1 from a live sync', () => {
        expect(chatNotificationEntries(chat({ mention$: { all: true } } as never))).toEqual([
            { ...base, kind: 'everyone', ref: '' },
        ]);
        expect(chatNotificationEntries(chat({ mention$: { all: 1 } } as never))).toEqual([
            { ...base, kind: 'everyone', ref: '' },
        ]);
    });

    it('gives a thread reply a reply entry, beside its mentions', () => {
        const entries = chatNotificationEntries(chat({ parentId: '7', mention$: { userIds: ['u2'] } } as never));

        expect(entries).toEqual([
            { ...base, kind: 'mention', ref: 'u2' },
            { ...base, kind: 'reply', ref: '7' },
        ]);
    });

    it('takes the server sent time and the owner record over the cached fallbacks', () => {
        const [entry] = chatNotificationEntries(chat({ owner$: { id: 'u-owner' }, mention$: { all: true } } as never));

        expect(entry.createdAt).toBe(5_000);
        expect(entry.authorId).toBe('u-owner');
    });

    it('gives a reaction event one entry with its emoji and toggle, though it is a system row', () => {
        const on = chat({
            stereo: 'system',
            subType: 'reaction',
            reaction$: { chatId: 'ch-1:3', emoji: '👍' },
        } as never);
        const off = chat({
            stereo: 'system',
            subType: 'reaction',
            reaction$: { chatId: 'ch-1:3', emoji: '👍', action: 'off' },
        } as never);

        expect(chatNotificationEntries(on)).toEqual([
            { ...base, kind: 'reaction', ref: 'ch-1:3', emoji: '👍', action: 'on' },
        ]);
        expect(chatNotificationEntries(off)).toEqual([
            { ...base, kind: 'reaction', ref: 'ch-1:3', emoji: '👍', action: 'off' },
        ]);
    });

    it('gives a reaction event with no target or no emoji nothing', () => {
        expect(chatNotificationEntries(chat({ subType: 'reaction', reaction$: { emoji: '👍' } } as never))).toEqual([]);
        expect(
            chatNotificationEntries(chat({ subType: 'reaction', reaction$: { chatId: 'ch-1:3' } } as never))
        ).toEqual([]);
    });

    it.each([
        ['unsent', { chatNo: 0 }],
        ['still sending', { isPending: true }],
        ['failed', { isFailed: true }],
        ['deleted', { hidden: true }],
        ['a revision notice', { subType: 'edit' }],
        ['another system row', { stereo: 'system' }],
    ])('gives a row that is %s nothing', (_label, fields) => {
        expect(chatNotificationEntries(chat({ mention$: { all: true }, ...fields } as never))).toEqual([]);
    });
});

describe('isNotifiableMessage', () => {
    it('admits a settled message someone wrote', () => {
        expect(isNotifiableMessage(chat())).toBe(true);
    });

    it('turns away reaction events, system rows and unsettled rows', () => {
        expect(isNotifiableMessage(chat({ stereo: 'system', subType: 'reaction' } as never))).toBe(false);
        expect(isNotifiableMessage(chat({ stereo: 'system' } as never))).toBe(false);
        expect(isNotifiableMessage(chat({ isPending: true }))).toBe(false);
        expect(isNotifiableMessage(chat({ hidden: true } as never))).toBe(false);
    });
});
