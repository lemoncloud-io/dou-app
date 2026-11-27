import type { ChatMediaEntry } from '@chatic/bridge-messages';

import { chatMediaEntries } from './chatMediaEntries';
import type { DomainChat } from './models';

type Slot = NonNullable<DomainChat['upload$$']>[number];

const server = (fields: Record<string, unknown>): Slot => ({ status: 'stored', ...fields }) as Slot;
const pending = (fields: Record<string, unknown> = {}): Slot =>
    ({ localStatus: 'sending', localThumbUrl: 'blob:x', ...fields }) as Slot;

const chat = (fields: Partial<DomainChat> = {}): DomainChat =>
    ({
        id: 'ch-1:10',
        cid: 'c1',
        channelId: 'ch-1',
        chatNo: 10,
        isPending: false,
        isFailed: false,
        createdAtMs: 1,
        updatedAtMs: 1,
        content: '',
        ...fields,
    }) as DomainChat;

const photo = server({ id: 'u-img', stereo: 'image' });
const clip = server({ id: 'u-vid', stereo: 'video' });
const doc = server({ id: 'u-doc', stereo: 'file' });
const voice = server({ id: 'u-aud', stereo: 'audio' });

const cases: Array<{ name: string; chat: DomainChat; expected: ChatMediaEntry[] }> = [
    { name: 'a photo', chat: chat({ upload$$: [photo] }), expected: [{ kind: 'image', idx: 0, ref: 'u-img' }] },
    {
        name: 'photos sent with no text, one entry per photo',
        chat: chat({ upload$$: [photo, server({ id: 'u-img-2', stereo: 'image' })], content: '' }),
        expected: [
            { kind: 'image', idx: 0, ref: 'u-img' },
            { kind: 'image', idx: 1, ref: 'u-img-2' },
        ],
    },
    {
        name: 'photos sent with a caption, the same photos and nothing for text without a link',
        chat: chat({ upload$$: [photo, server({ id: 'u-img-2', stereo: 'image' })], content: 'slides from today' }),
        expected: [
            { kind: 'image', idx: 0, ref: 'u-img' },
            { kind: 'image', idx: 1, ref: 'u-img-2' },
        ],
    },
    { name: 'a video', chat: chat({ upload$$: [clip] }), expected: [{ kind: 'video', idx: 0, ref: 'u-vid' }] },
    { name: 'a document', chat: chat({ upload$$: [doc] }), expected: [{ kind: 'file', idx: 0, ref: 'u-doc' }] },
    { name: 'a voice message', chat: chat({ upload$$: [voice] }), expected: [{ kind: 'audio', idx: 0, ref: 'u-aud' }] },
    {
        name: 'an upload with no stereo, as an image (every one was, before other kinds)',
        chat: chat({ upload$$: [server({ id: 'u-old' })] }),
        expected: [{ kind: 'image', idx: 0, ref: 'u-old' }],
    },
    {
        name: 'a link',
        chat: chat({ content: 'see https://example.com/a now' }),
        expected: [{ kind: 'link', idx: 0, ref: 'https://example.com/a' }],
    },
    {
        name: 'a labelled link, by its address',
        chat: chat({ content: 'read [the notes](https://example.com/notes) first' }),
        expected: [{ kind: 'link', idx: 0, ref: 'https://example.com/notes' }],
    },
    {
        name: 'a link inside a quote, but not an address the bubble leaves as text inside a mark',
        chat: chat({ content: '> https://q.example/1\n**bold https://b.example/2**' }),
        expected: [{ kind: 'link', idx: 0, ref: 'https://q.example/1' }],
    },
    {
        name: 'no address inside a code block or inline code, as the bubble draws none',
        chat: chat({ content: '```\ncurl https://code.example/x\n```\nand `https://inline.example/y`' }),
        expected: [],
    },
    {
        name: 'the same link twice, once',
        chat: chat({ content: 'https://example.com/a and again https://example.com/a, then https://example.com/b' }),
        expected: [
            { kind: 'link', idx: 0, ref: 'https://example.com/a' },
            { kind: 'link', idx: 1, ref: 'https://example.com/b' },
        ],
    },
    {
        name: 'two attachments and a link, the link numbered after every slot',
        chat: chat({ upload$$: [photo, doc], content: 'https://example.com/a' }),
        expected: [
            { kind: 'image', idx: 0, ref: 'u-img' },
            { kind: 'file', idx: 1, ref: 'u-doc' },
            { kind: 'link', idx: 2, ref: 'https://example.com/a' },
        ],
    },
    {
        name: 'no slot still being sent, and the rest keep their positions',
        chat: chat({ upload$$: [pending({ localContentType: 'video/mp4' }), photo], content: 'https://e.example' }),
        expected: [
            { kind: 'image', idx: 1, ref: 'u-img' },
            { kind: 'link', idx: 2, ref: 'https://e.example' },
        ],
    },
    {
        name: 'no server slot without an id',
        chat: chat({ upload$$: [server({ stereo: 'image' })] }),
        expected: [],
    },
    {
        name: 'a slot the server marked failed, which the sender still picked',
        chat: chat({ upload$$: [server({ id: 'u-bad', stereo: 'image', status: 'failed', error: 'x' })] }),
        expected: [{ kind: 'image', idx: 0, ref: 'u-bad' }],
    },
    {
        name: 'nothing for a row still being sent',
        chat: chat({ chatNo: 0, isPending: true, upload$$: [photo] }),
        expected: [],
    },
    { name: 'nothing for a row with no number', chat: chat({ chatNo: 0, upload$$: [photo] }), expected: [] },
    { name: 'nothing for a failed row', chat: chat({ isFailed: true, upload$$: [photo] }), expected: [] },
    {
        name: 'nothing for a deleted row',
        chat: chat({ hidden: true, upload$$: [photo], content: 'https://e.example' } as Partial<DomainChat>),
        expected: [],
    },
    {
        name: 'nothing for a system row',
        chat: chat({ stereo: 'system', content: 'https://e.example' } as Partial<DomainChat>),
        expected: [],
    },
    {
        name: 'nothing for a reaction row',
        chat: chat({ subType: 'reaction', content: 'https://e.example' } as Partial<DomainChat>),
        expected: [],
    },
    {
        name: 'nothing for a revision notice, which is about another message',
        chat: chat({ subType: 'edit', content: 'https://e.example' } as Partial<DomainChat>),
        expected: [],
    },
    {
        name: 'a thread reply, like any message of its room',
        chat: chat({ parentId: 'ch-1:3', upload$$: [photo] } as Partial<DomainChat>),
        expected: [{ kind: 'image', idx: 0, ref: 'u-img' }],
    },
    { name: 'nothing for a plain text message', chat: chat({ content: 'hello there' }), expected: [] },
];

describe('chatMediaEntries', () => {
    it.each(cases)('lists $name', ({ chat: row, expected }) => {
        expect(chatMediaEntries(row)).toEqual(expected);
    });
});
