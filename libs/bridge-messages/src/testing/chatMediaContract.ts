import type {
    CacheChatView,
    ChatMediaCounts,
    ChatMediaEntry,
    ChatMediaFillItem,
    ChatMediaKind,
    ChatMediaPage,
} from '../types/model/cache';

/**
 * The room media index contract, as one table both stores run: IndexedDB in `libs/db` and the
 * shell's SQLite in `apps/mobile`. Test support only — nothing at runtime imports it.
 *
 * The rows carry their `mediaEntries` already decided, as the web sends them: the stores only store
 * and index, so the table is plain data and either store must give exactly the answers below.
 */

export interface ChatMediaContractScope {
    cid: string;
    uid: string;
}

/** What a suite wires each store to. `namespace` keeps one case's rows from another's in a shared store. */
export interface ChatMediaContractStore {
    saveAll(scope: ChatMediaContractScope, rows: CacheChatView[]): Promise<void>;
    deleteAll(scope: ChatMediaContractScope, ids: string[]): Promise<void>;
    clearByChannel(scope: ChatMediaContractScope, channelId: string): Promise<void>;
    clearAll(scope: ChatMediaContractScope): Promise<void>;
    list(
        scope: ChatMediaContractScope,
        query: { channelId: string; kind: ChatMediaKind; cursorNo?: number; limit: number }
    ): Promise<ChatMediaPage>;
    count(scope: ChatMediaContractScope, channelId: string): Promise<ChatMediaCounts>;
    /** A room fill's entries (`SaveChatMediaCacheData` / `saveChatMediaEntries`). */
    fill(scope: ChatMediaContractScope, items: ChatMediaFillItem[], version: number): Promise<void>;
}

export type ChatMediaContractStep =
    | { saveAll: CacheChatView[]; scope?: ChatMediaContractScope }
    | { deleteAll: string[]; scope?: ChatMediaContractScope }
    | { clearByChannel: string; scope?: ChatMediaContractScope }
    | { clearAll: true; scope?: ChatMediaContractScope }
    | { fill: ChatMediaFillItem[]; version: number; scope?: ChatMediaContractScope };

/** One entry of an expected page: `[chatId, chatNo, idx, ref]`. */
export type ChatMediaContractItem = [string, number, number, string];

export type ChatMediaContractExpectation =
    | {
          list: { channelId: string; kind: ChatMediaKind; cursorNo?: number; limit: number };
          items: ChatMediaContractItem[];
          nextCursorNo: number | null;
          scope?: ChatMediaContractScope;
      }
    | { count: string; counts: Partial<ChatMediaCounts>; scope?: ChatMediaContractScope };

export interface ChatMediaContractCase {
    name: string;
    given: ChatMediaContractStep[];
    expect: ChatMediaContractExpectation[];
}

export const CONTRACT_SCOPE: ChatMediaContractScope = { cid: 'cloud-a', uid: 'user-a' };
const OTHER_UID: ChatMediaContractScope = { cid: 'cloud-a', uid: 'user-b' };
const OTHER_CID: ChatMediaContractScope = { cid: 'cloud-b', uid: 'user-a' };

const img = (idx: number, ref: string): ChatMediaEntry => ({ kind: 'image', idx, ref });
const vid = (idx: number, ref: string): ChatMediaEntry => ({ kind: 'video', idx, ref });
const file = (idx: number, ref: string): ChatMediaEntry => ({ kind: 'file', idx, ref });
const audio = (idx: number, ref: string): ChatMediaEntry => ({ kind: 'audio', idx, ref });
const link = (idx: number, ref: string): ChatMediaEntry => ({ kind: 'link', idx, ref });

/** A chat row as the web hands it to a store. Leaving `mediaEntries` out means "written by an older bundle". */
export const contractRow = (
    channelId: string,
    chatNo: number,
    mediaEntries?: ChatMediaEntry[],
    fields: Partial<CacheChatView> = {}
): CacheChatView =>
    ({
        id: `${channelId}:${chatNo}`,
        cid: 'cloud-a',
        channelId,
        chatNo,
        isPending: false,
        isFailed: false,
        createdAt: chatNo * 1000,
        createdAtMs: chatNo * 1000,
        updatedAtMs: chatNo * 1000,
        content: '',
        ...(mediaEntries ? { mediaEntries } : {}),
        ...fields,
    }) as CacheChatView;

const ZERO: ChatMediaCounts = { image: 0, video: 0, file: 0, audio: 0, link: 0 };

/** A row as the current write path stores it: entries and the rules version they were decided under. */
const current = (
    channelId: string,
    chatNo: number,
    mediaEntries: ChatMediaEntry[],
    fields: Partial<CacheChatView> = {}
) => contractRow(channelId, chatNo, mediaEntries, { mediaEntriesVersion: 1, ...fields });

/** A fill item, as a fill computes it from the row it read. */
const fillItem = (channelId: string, chatNo: number, entries: ChatMediaEntry[]): ChatMediaFillItem => ({
    chatId: `${channelId}:${chatNo}`,
    channelId,
    chatNo,
    entries,
});

/**
 * Room `r1`: messages 1..9, images spread so a limit can land inside a message.
 * - 9: images a,b,c   - 8: text   - 7: image d + link   - 6: images e,f
 * - 5: video + file   - 4: audio  - 3: image g          - 2: text   - 1: images h,i
 */
const room = (): CacheChatView[] => [
    contractRow('r1', 1, [img(0, 'h'), img(1, 'i')]),
    contractRow('r1', 2, []),
    contractRow('r1', 3, [img(0, 'g')]),
    contractRow('r1', 4, [audio(0, 'voice')]),
    contractRow('r1', 5, [vid(0, 'clip'), file(1, 'doc')]),
    contractRow('r1', 6, [img(0, 'e'), img(1, 'f')]),
    contractRow('r1', 7, [img(0, 'd'), link(1, 'https://e.example/7')]),
    contractRow('r1', 8, []),
    contractRow('r1', 9, [img(0, 'a'), img(1, 'b'), img(2, 'c')]),
];

export const CHAT_MEDIA_CONTRACT_CASES: ChatMediaContractCase[] = [
    {
        name: 'fills the entries of a row cached before the index, with the row’s own channel and number',
        given: [{ saveAll: [contractRow('r1', 4)] }, { fill: [fillItem('r1', 4, [img(0, 'old-photo')])], version: 1 }],
        expect: [
            {
                list: { channelId: 'r1', kind: 'image', limit: 10 },
                items: [['r1:4', 4, 0, 'old-photo']],
                nextCursorNo: null,
            },
        ],
    },
    {
        name: 'skips a fill item for a row the write path wrote since, keeping that write’s entries',
        given: [
            { saveAll: [contractRow('r1', 1)] },
            { saveAll: [current('r1', 1, [link(0, 'https://edited.example')])] },
            { fill: [fillItem('r1', 1, [link(0, 'https://read-before-the-edit.example')])], version: 1 },
        ],
        expect: [
            {
                list: { channelId: 'r1', kind: 'link', limit: 10 },
                items: [['r1:1', 1, 0, 'https://edited.example']],
                nextCursorNo: null,
            },
        ],
    },
    {
        name: 'does not undo a delete mark that landed between the fill’s read and its write',
        given: [
            { saveAll: [contractRow('r1', 1)] },
            { saveAll: [current('r1', 1, [], { hidden: true })] },
            { fill: [fillItem('r1', 1, [img(0, 'deleted-photo')])], version: 1 },
        ],
        expect: [{ count: 'r1', counts: ZERO }],
    },
    {
        name: 'does not bring back the entries of a row deleted between the fill’s read and its write',
        given: [
            { saveAll: [contractRow('r1', 1)] },
            { deleteAll: ['r1:1'] },
            { fill: [fillItem('r1', 1, [img(0, 'p')])], version: 1 },
        ],
        expect: [{ count: 'r1', counts: ZERO }],
    },
    {
        name: 'does not refill a room cleared between the fill’s read and its write',
        given: [
            { saveAll: [contractRow('r1', 1), contractRow('r1', 2)] },
            { clearByChannel: 'r1' },
            { fill: [fillItem('r1', 1, [img(0, 'a')]), fillItem('r1', 2, [img(0, 'b')])], version: 1 },
        ],
        expect: [{ count: 'r1', counts: ZERO }],
    },
    {
        name: 'replaces entries decided under older rules when the fill’s version is newer, an empty list clearing them',
        given: [
            { saveAll: [current('r1', 1, [img(0, 'old-rule')]), current('r1', 2, [img(0, 'kept-shape')])] },
            { fill: [fillItem('r1', 1, []), fillItem('r1', 2, [vid(0, 'new-rule')])], version: 2 },
        ],
        expect: [{ count: 'r1', counts: { video: 1 } }],
    },
    {
        name: 'lists one kind newest first, entries of a message by idx',
        given: [{ saveAll: room() }],
        expect: [
            {
                list: { channelId: 'r1', kind: 'image', limit: 20 },
                items: [
                    ['r1:9', 9, 0, 'a'],
                    ['r1:9', 9, 1, 'b'],
                    ['r1:9', 9, 2, 'c'],
                    ['r1:7', 7, 0, 'd'],
                    ['r1:6', 6, 0, 'e'],
                    ['r1:6', 6, 1, 'f'],
                    ['r1:3', 3, 0, 'g'],
                    ['r1:1', 1, 0, 'h'],
                    ['r1:1', 1, 1, 'i'],
                ],
                nextCursorNo: null,
            },
            {
                list: { channelId: 'r1', kind: 'link', limit: 5 },
                items: [['r1:7', 7, 1, 'https://e.example/7']],
                nextCursorNo: null,
            },
        ],
    },
    {
        name: 'never splits a message at the limit, and pages on by the last message number',
        given: [{ saveAll: room() }],
        expect: [
            {
                list: { channelId: 'r1', kind: 'image', limit: 2 },
                items: [
                    ['r1:9', 9, 0, 'a'],
                    ['r1:9', 9, 1, 'b'],
                    ['r1:9', 9, 2, 'c'],
                ],
                nextCursorNo: 9,
            },
            {
                list: { channelId: 'r1', kind: 'image', cursorNo: 9, limit: 2 },
                items: [
                    ['r1:7', 7, 0, 'd'],
                    ['r1:6', 6, 0, 'e'],
                    ['r1:6', 6, 1, 'f'],
                ],
                nextCursorNo: 6,
            },
            {
                list: { channelId: 'r1', kind: 'image', cursorNo: 6, limit: 2 },
                items: [
                    ['r1:3', 3, 0, 'g'],
                    ['r1:1', 1, 0, 'h'],
                    ['r1:1', 1, 1, 'i'],
                ],
                nextCursorNo: null,
            },
        ],
    },
    {
        name: 'answers a null cursor when the page ends exactly at the last entry',
        given: [{ saveAll: room() }],
        expect: [
            {
                list: { channelId: 'r1', kind: 'image', cursorNo: 4, limit: 3 },
                items: [
                    ['r1:3', 3, 0, 'g'],
                    ['r1:1', 1, 0, 'h'],
                    ['r1:1', 1, 1, 'i'],
                ],
                nextCursorNo: null,
            },
            { list: { channelId: 'r1', kind: 'image', cursorNo: 1, limit: 3 }, items: [], nextCursorNo: null },
        ],
    },
    {
        name: 'counts every kind, 0 for a kind the room has none of',
        given: [{ saveAll: room() }],
        expect: [
            { count: 'r1', counts: { image: 9, video: 1, file: 1, audio: 1, link: 1 } },
            { count: 'no-such-room', counts: ZERO },
        ],
    },
    {
        name: 'rewrites a message’s entries when an edit changes its link',
        given: [
            { saveAll: [contractRow('r1', 1, [link(0, 'https://old.example')])] },
            { saveAll: [contractRow('r1', 1, [link(0, 'https://new.example')], { content: 'https://new.example' })] },
        ],
        expect: [
            {
                list: { channelId: 'r1', kind: 'link', limit: 10 },
                items: [['r1:1', 1, 0, 'https://new.example']],
                nextCursorNo: null,
            },
            { count: 'r1', counts: { link: 1 } },
        ],
    },
    {
        name: 'leaves a message’s entries alone when its row comes without mediaEntries',
        given: [
            { saveAll: [contractRow('r1', 1, [img(0, 'kept')])] },
            { saveAll: [contractRow('r1', 1, undefined, { content: 'edited by an older bundle' })] },
        ],
        expect: [
            {
                list: { channelId: 'r1', kind: 'image', limit: 10 },
                items: [['r1:1', 1, 0, 'kept']],
                nextCursorNo: null,
            },
        ],
    },
    {
        name: 'removes a message’s entries when its row comes with an empty list (deleted)',
        given: [
            { saveAll: [contractRow('r1', 1, [img(0, 'gone')])] },
            { saveAll: [contractRow('r1', 1, [], { hidden: true })] },
        ],
        expect: [{ count: 'r1', counts: ZERO }],
    },
    {
        name: 'keeps the last copy’s entries when one batch carries a message twice',
        given: [
            {
                saveAll: [
                    contractRow('r1', 1, [img(0, 'first'), img(1, 'first-b')]),
                    contractRow('r1', 1, [img(0, 'last')]),
                ],
            },
        ],
        expect: [
            {
                list: { channelId: 'r1', kind: 'image', limit: 10 },
                items: [['r1:1', 1, 0, 'last']],
                nextCursorNo: null,
            },
        ],
    },
    {
        name: 'removes the entries of deleted rows only, even when one chat id is a prefix of another',
        given: [
            {
                saveAll: [
                    contractRow('x', 12, [img(0, 'x12')], { id: 'x:12' }),
                    contractRow('x', 13, [img(0, 'x12-7')], { id: 'x:12:7' }),
                    contractRow('x', 14, [img(0, 'x120')], { id: 'x:120' }),
                ],
            },
            { deleteAll: ['x:12'] },
        ],
        expect: [
            {
                list: { channelId: 'x', kind: 'image', limit: 10 },
                items: [
                    ['x:120', 14, 0, 'x120'],
                    ['x:12:7', 13, 0, 'x12-7'],
                ],
                nextCursorNo: null,
            },
        ],
    },
    {
        name: 'clears one room’s entries with the room, leaving the others',
        given: [
            { saveAll: [contractRow('r1', 1, [img(0, 'r1')]), contractRow('r2', 1, [img(0, 'r2')])] },
            { clearByChannel: 'r1' },
        ],
        expect: [
            { count: 'r1', counts: ZERO },
            { count: 'r2', counts: { image: 1 } },
        ],
    },
    {
        name: 'clears a scope’s entries with the scope, leaving another user’s and another cloud’s',
        given: [
            { saveAll: [contractRow('r1', 1, [img(0, 'mine')])] },
            { saveAll: [contractRow('r1', 1, [img(0, 'other-user')])], scope: OTHER_UID },
            { saveAll: [contractRow('r1', 1, [img(0, 'other-cloud')])], scope: OTHER_CID },
            { clearAll: true },
        ],
        expect: [
            { count: 'r1', counts: ZERO },
            {
                list: { channelId: 'r1', kind: 'image', limit: 10 },
                items: [['r1:1', 1, 0, 'other-user']],
                nextCursorNo: null,
                scope: OTHER_UID,
            },
            { count: 'r1', counts: { image: 1 }, scope: OTHER_CID },
        ],
    },
    {
        name: 'keeps scopes apart: the same chat id in two scopes has each scope’s entries',
        given: [
            { saveAll: [contractRow('r1', 1, [img(0, 'a'), img(1, 'b')])] },
            { saveAll: [contractRow('r1', 1, [link(0, 'https://other.example')])], scope: OTHER_CID },
        ],
        expect: [
            { count: 'r1', counts: { image: 2 } },
            { count: 'r1', counts: { link: 1 }, scope: OTHER_CID },
            {
                list: { channelId: 'r1', kind: 'image', limit: 10 },
                items: [],
                nextCursorNo: null,
                scope: OTHER_CID,
            },
        ],
    },
];

/**
 * Runs one case against a store and returns what it saw, shaped like the expectations — a suite
 * compares the two with `toEqual`, so a failure shows the whole difference at once.
 */
export const runChatMediaContractCase = async (
    store: ChatMediaContractStore,
    contractCase: ChatMediaContractCase
): Promise<{ expected: unknown[]; actual: unknown[] }> => {
    for (const step of contractCase.given) {
        const scope = step.scope ?? CONTRACT_SCOPE;
        if ('saveAll' in step) await store.saveAll(scope, step.saveAll);
        else if ('deleteAll' in step) await store.deleteAll(scope, step.deleteAll);
        else if ('clearByChannel' in step) await store.clearByChannel(scope, step.clearByChannel);
        else if ('fill' in step) await store.fill(scope, step.fill, step.version);
        else await store.clearAll(scope);
    }
    const expected: unknown[] = [];
    const actual: unknown[] = [];
    for (const expectation of contractCase.expect) {
        const scope = expectation.scope ?? CONTRACT_SCOPE;
        if ('list' in expectation) {
            const page = await store.list(scope, expectation.list);
            expected.push({ items: expectation.items, nextCursorNo: expectation.nextCursorNo, rowsMatch: true });
            actual.push({
                items: page.items.map((item): ChatMediaContractItem => [item.chatId, item.chatNo, item.idx, item.ref]),
                nextCursorNo: page.nextCursorNo,
                // Each entry carries its own message's row.
                rowsMatch: page.items.every(
                    item => item.chat?.id === item.chatId && item.kind === expectation.list.kind
                ),
            });
        } else {
            expected.push({ ...ZERO, ...expectation.counts });
            actual.push(await store.count(scope, expectation.count));
        }
    }
    return { expected, actual };
};
