import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import type { DomainChat } from '@chatic/data';
import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

// The row's action controls reach for the chat repository and the active place at
// module scope; neither is available outside the app shell. Nothing here asserts on
// them — this file is about whether the list renders at all.
vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: () => ({
                chat: { updateChat: vi.fn(), deleteChat: vi.fn(), setReaction: vi.fn() },
            }),
        },
        session: {
            getActiveServerContext: () => ({ siteId: 'S1' }),
            useGlobalSession: () => ({ activeServer: { siteId: 'S1' } }),
        },
    },
}));

// The feed reports a failed jump through a toast; the spy is how a test sees it.
const toast = vi.hoisted(() => vi.fn());
vi.mock('@chatic/ui-kit/components/ui/use-toast', async importOriginal => ({
    ...(await importOriginal<object>()),
    toast,
}));

// Initialises i18next as a side effect, so `t` resolves to real copy instead of
// echoing the key back. Assertions can then name what the reader sees.
import '../../../../i18n';

import { MessageList } from './MessageList';
import type { ThreadMeta } from '../utils';
import { WEBHOOK_BLOCKS_ERROR_REPORT, WEBHOOK_SEND_ERROR_REPORT } from '@chatic/block-kit';

// jsdom implements no layout, so it ships no scrollIntoView. The list calls it from a
// layout effect to land on the newest message.
Element.prototype.scrollIntoView = vi.fn();

const VIEWER = { uid: 'me', name: 'Me', cloudUid: 'me-cloud' };

// Mirrors the app's provider tree (`DesktopRuntime`). The tooltip provider is not
// optional scaffolding: Radix throws "`Tooltip` must be used within `TooltipProvider`"
// without it, so leaving it out here would make this suite disagree with the app.
const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>
        <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
);

const message = (chatNo: number, ownerId: string, content: string): DomainChat =>
    ({
        id: `C1:${chatNo}`,
        channelId: 'C1',
        chatNo,
        ownerId,
        content,
        createdAt: 1_700_000_000_000 + chatNo,
    }) as DomainChat;

/**
 * A smoke render of the two derivations that live inside the component rather than in
 * a pure util — the thread-footer view and the reactor-name resolver.
 *
 * Both were shipped calling a helper the file never imported, which threw a
 * ReferenceError the moment either ran. No gate caught it: vite strips types without
 * resolving free identifiers, `typescript-eslint` disables `no-undef` on TS files, and
 * nothing rendered this component. See `.claude/20260804/DEBUG-10-36-17.md`.
 *
 * So the assertions are deliberately shallow. The point is that these two paths
 * execute at all, which is exactly what was missing.
 */
/**
 * Open a row's overflow menu and click one of its items. Save, Copy, Edit and
 * Delete live there now — eight icons in the hover strip was a target nobody
 * could aim at. Radix opens a dropdown on pointerdown, not click.
 */
const clickRowMenuItem = (name: RegExp | string) => {
    // Enter on the trigger, not a click: Radix opens a dropdown from pointerdown,
    // and jsdom has no PointerEvent, so the keyboard path is the reliable one here
    // (and it is the path a keyboard user takes anyway).
    fireEvent.keyDown(screen.getByLabelText('More actions'), { key: 'Enter' });
    fireEvent.click(screen.getByRole('menuitem', { name }));
};

describe('MessageList', () => {
    it('renders a thread footer without throwing', () => {
        const threadMeta = new Map<string, ThreadMeta>([
            [
                '1',
                {
                    count: 2,
                    lastReplyAt: 1_700_000_100_000,
                    // One reply of mine and one from somebody else: the footer resolves my
                    // own avatar through the viewer and theirs through the roster, which is
                    // the branch that crashed.
                    repliers: [{ id: 'me-cloud' }, { id: 'ada' }],
                } as ThreadMeta,
            ],
        ]);

        render(
            <MessageList
                messages={[message(1, 'ada', 'parent')]}
                isLoading={false}
                viewer={VIEWER}
                names={new Map([['ada', 'Ada']])}
                threadMeta={threadMeta}
                onOpenThread={vi.fn()}
            />,
            { wrapper }
        );

        expect(screen.getByText('parent')).toBeDefined();
    });

    // A deleted message keeps its row and its author line; only the content is replaced.
    // The toolbar goes with the content — `content` survives the server's soft delete,
    // so Copy would otherwise hand back the text the row says is gone.
    it('renders a deleted message as a tombstone, with no actions on it', () => {
        const deleted = { ...message(1, 'ada', 'was here'), hidden: true } as DomainChat;

        render(
            <MessageList messages={[deleted]} isLoading={false} viewer={VIEWER} names={new Map([['ada', 'Ada']])} />,
            { wrapper }
        );

        expect(screen.getByText('This message was deleted.')).toBeDefined();
        expect(screen.queryByText('was here')).toBeNull();
        expect(screen.queryByLabelText('More actions')).toBeNull();
    });

    // The feed and the thread panel share one renderer, so a block message has to be
    // drawn by whatever `MessageRow` decides — not by a second code path per surface.
    // `ThreadPanel.spec` asserts the same thing through the panel.
    it('draws a Block Kit message instead of its payload', () => {
        const payload = JSON.stringify({
            blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '*403* denied by policy' } }],
        });

        render(
            <MessageList
                messages={[message(1, 'ada', payload)]}
                isLoading={false}
                viewer={VIEWER}
                names={new Map([['ada', 'Ada']])}
            />,
            { wrapper }
        );

        expect(screen.getByText('403').tagName).toBe('STRONG');
        expect(screen.queryByText(payload)).toBeNull();
    });

    // `blocks$` (server field) outranks the `content` JSON fallback above. Fixture is the
    // shared webhook sample (resolveChatBlocks.spec.ts uses the same two constants).
    it('draws blocks$ ahead of content — header, sections and context all reach the DOM', () => {
        const withBlocksField = {
            ...message(1, 'ada', WEBHOOK_SEND_ERROR_REPORT.content),
            blocks$: [...WEBHOOK_BLOCKS_ERROR_REPORT],
            // Pins buildMessageRows' `stereo === 'system'` branch: a webhook chat is a
            // user bubble, not a system notice.
            stereo: WEBHOOK_SEND_ERROR_REPORT.stereo,
        } as DomainChat;

        render(
            <MessageList
                messages={[withBlocksField]}
                isLoading={false}
                viewer={VIEWER}
                names={new Map([['ada', 'Ada']])}
            />,
            { wrapper }
        );

        // header 1 + section 2 + context 1 — the shape the plan's Success Criteria names.
        // Asserting only the ends would pass while the middle silently went missing.
        expect(screen.getByRole('heading', { name: /error-report/ })).toBeDefined();
        // Anchored: the third block is the raw error JSON, which quotes the same
        // sentence inside it. An unanchored match would find both and prove neither.
        expect(
            screen.getByText(/^TypeError: Cannot read properties of undefined \(reading 'channelId'\)$/)
        ).toBeDefined();
        expect(screen.getByText(/^\{"service":/)).toBeDefined();
        expect(screen.getAllByText(/원문 보기/).length).toBeGreaterThan(0);
    });

    // `content` on a `blocks$` message is already the server's plain-text summary
    // (SPEC §6-5). Folding `blocks$` through `blocksToPlainText` here instead would
    // pull this fixture's context line ("hello-alarm") and section-3 raw error JSON
    // into the dialog — neither is in `content`, so their absence proves which one
    // the dialog quotes. Scoped to the dialog: the row underneath legitimately shows
    // both, since they are real section/context content, not a leak.
    it('quotes the server summary, not the folded blocks, when deleting a blocks$ message', () => {
        const withBlocksField = {
            ...message(1, 'me', WEBHOOK_SEND_ERROR_REPORT.content),
            blocks$: [...WEBHOOK_BLOCKS_ERROR_REPORT],
            // Pins buildMessageRows' `stereo === 'system'` branch: a webhook chat is a
            // user bubble, not a system notice.
            stereo: WEBHOOK_SEND_ERROR_REPORT.stereo,
        } as DomainChat;

        render(<MessageList messages={[withBlocksField]} isLoading={false} viewer={VIEWER} names={new Map()} />, {
            wrapper,
        });
        clickRowMenuItem('Delete message');

        const dialog = within(screen.getByRole('alertdialog'));
        expect(dialog.getByText(/TypeError: Cannot read properties/)).toBeDefined();
        expect(dialog.queryByText(/hello-alarm/)).toBeNull();
        expect(dialog.queryByText(/"service":/)).toBeNull();
    });

    // The dialog quotes the message so the answer is about *this* message. Quoting the
    // payload instead answers nothing and buries the buttons under 1900 characters of
    // JSON — this was the fourth place reading `content` where it meant "what it says".
    it('quotes what a block message says when asking to delete it', () => {
        const payload = JSON.stringify({
            blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '*403* denied' } }],
        });

        render(
            <MessageList messages={[message(1, 'me', payload)]} isLoading={false} viewer={VIEWER} names={new Map()} />,
            { wrapper }
        );
        clickRowMenuItem('Delete message');

        expect(screen.queryByText(payload)).toBeNull();
        expect(screen.getByText('403 denied')).toBeDefined();
    });

    // A payload we cannot read must not take the pane down or blank the row.
    it('falls back to the raw text when the payload is broken', () => {
        render(
            <MessageList
                messages={[message(1, 'ada', '{"blocks": [')]}
                isLoading={false}
                viewer={VIEWER}
                names={new Map([['ada', 'Ada']])}
            />,
            { wrapper }
        );

        expect(screen.getByText('{"blocks": [')).toBeDefined();
    });

    // One receipt per author block, not one per message: a burst of four messages a second
    // apart shares a single read position, and four identical lines under it would be four
    // times the noise for the same fact.
    it('puts the read receipt on the last message of an author block', () => {
        render(
            <MessageList
                messages={[message(1, 'ada', 'first'), message(2, 'ada', 'second')]}
                isLoading={false}
                viewer={VIEWER}
                names={new Map([['ada', 'Ada']])}
                // Answers for every message, so the assertion is about which one asked.
                readCountOf={chatNo => ({ readCount: chatNo, unreadCount: 1 })}
            />,
            { wrapper }
        );

        expect(screen.getAllByText(/^Seen by /)).toHaveLength(1);
        expect(screen.getByText('Seen by 2')).toBeDefined();
        expect(screen.getByText('Unseen by 1')).toBeDefined();
    });

    // A receipt under each of my blocks was the loudest repeated line in a busy channel. The
    // latest block keeps it; an earlier one shows it only while its message is hovered or has
    // focus, and focus is how the arrow keys move through the feed.
    it('shows the receipt outright only on the latest block that has one', () => {
        render(
            <MessageList
                messages={[
                    message(1, 'me', 'mine, older'),
                    message(2, 'ada', 'reply'),
                    message(3, 'me', 'mine, latest'),
                ]}
                isLoading={false}
                viewer={VIEWER}
                names={new Map([['ada', 'Ada']])}
                readCountOf={(chatNo, senderId) => (senderId === 'me' ? { readCount: chatNo, unreadCount: 0 } : null)}
            />,
            { wrapper }
        );

        expect(screen.getAllByText(/^Seen by /).map(node => node.textContent)).toEqual(['Seen by 3']);

        const older = screen.getByText('mine, older').closest('[role="article"]') as HTMLElement;
        fireEvent.mouseEnter(older);
        expect(screen.getByText('Seen by 1')).toBeDefined();
        fireEvent.mouseLeave(older);
        expect(screen.queryByText('Seen by 1')).toBeNull();

        fireEvent.focus(older);
        expect(screen.getByText('Seen by 1')).toBeDefined();
    });

    // In the thread panel the column is about 270px and the toolbar about 210px, so a toolbar
    // over the author line hid the author's name. There it hangs under the header on a block's
    // first message; the rest keep their place above their own message. jsdom lays nothing out,
    // so this pins the placement class; the overlap itself needs a browser.
    // A thread passes no `onOpenThread` (no thread inside a thread), and a file sent on its own has
    // no text. The row still has to offer Delete to the person who sent it.
    it('offers Delete on my file-only reply in a thread', () => {
        const fileOnly = {
            ...message(1, 'me', ''),
            uploadIds: ['U1'],
            upload$$: [
                {
                    id: 'U1',
                    status: 'stored',
                    stereo: 'file',
                    name: 'report.docx',
                    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    contentSize: 26_300,
                },
            ],
        } as unknown as DomainChat;

        render(<MessageList messages={[fileOnly]} isLoading={false} viewer={VIEWER} names={new Map()} />, {
            wrapper,
        });
        clickRowMenuItem('Delete message');

        expect(screen.getByRole('alertdialog')).toBeDefined();
    });

    it('hangs the first toolbar under the author line in a thread, not over it', () => {
        const toolbarTops = (threadReplyCount?: number) => {
            const { container, unmount } = render(
                <MessageList
                    messages={[message(1, 'ada', 'first'), message(2, 'ada', 'second')]}
                    isLoading={false}
                    viewer={VIEWER}
                    names={new Map([['ada', 'Ada']])}
                    threadReplyCount={threadReplyCount}
                />,
                { wrapper }
            );
            const tops = [...container.querySelectorAll('[data-row-actions]')].map(node =>
                node.className.includes('-top-1.5') ? 'under-header' : 'above'
            );
            unmount();
            return tops;
        };

        expect(toolbarTops(1)).toEqual(['under-header', 'above']);
        expect(toolbarTops()).toEqual(['above', 'above']);
    });

    // Null is the hook saying "no receipt for this message" — a self-channel, a channel with
    // one active member, or nothing synced yet. Rendering "Seen by 0" there states something
    // false rather than staying quiet.
    it('shows no receipt when the counts are unavailable', () => {
        render(
            <MessageList
                messages={[message(1, 'ada', 'first')]}
                isLoading={false}
                viewer={VIEWER}
                names={new Map([['ada', 'Ada']])}
                readCountOf={() => null}
            />,
            { wrapper }
        );

        expect(screen.queryByText(/^Seen by /)).toBeNull();
    });

    it('renders a reaction chip without throwing', () => {
        const reactions = new Map([['C1:1', [{ emoji: '👍', key: '👍', userIds: ['me', 'ada'], mine: true }]]]);

        render(
            <MessageList
                messages={[message(1, 'ada', 'reacted to')]}
                reactions={reactions}
                isLoading={false}
                viewer={VIEWER}
                names={new Map([['ada', 'Ada']])}
            />,
            { wrapper }
        );

        expect(screen.getByText('reacted to')).toBeDefined();
        // Named, not matched on the glyph: the toolbar's quick-reaction buttons carry
        // the same emoji, so a bare text query finds two things and cannot say which
        // one is the tally.
        expect(screen.getByLabelText('👍 · Me, Ada')).toBeDefined();
    });

    describe('an unsent picture message', () => {
        const OLD = 1_700_000_000_000;
        const pictures = (localStatus: 'sending' | 'failed', fields: Partial<DomainChat> = {}): DomainChat =>
            ({
                id: 'optimistic-chat-images-1',
                channelId: 'C1',
                chatNo: 0,
                ownerId: 'me',
                content: '',
                isPending: localStatus === 'sending',
                isFailed: localStatus === 'failed',
                createdAt: OLD,
                upload$$: [{ localStatus, localThumbUrl: 'blob:1' }],
                ...fields,
            }) as DomainChat;

        it('is still sending after a minute, not stuck: a large upload takes its time', () => {
            render(
                <MessageList
                    messages={[pictures('sending')]}
                    isLoading={false}
                    viewer={VIEWER}
                    names={new Map()}
                    onRetry={vi.fn()}
                    onDiscard={vi.fn()}
                />,
                { wrapper }
            );

            expect(screen.queryByText('Not delivered')).toBeNull();
            // Drawn, and drawn as a send in flight: its tile says it is uploading.
            expect(screen.getByRole('button', { name: 'Uploading image-1' }).getAttribute('aria-busy')).toBe('true');
        });

        it('offers Retry and Delete once it has failed and its pictures are still here', () => {
            const onRetry = vi.fn();
            const row = pictures('failed');
            render(
                <MessageList
                    messages={[row]}
                    isLoading={false}
                    viewer={VIEWER}
                    names={new Map()}
                    onRetry={onRetry}
                    onDiscard={vi.fn()}
                    canRetry={() => true}
                />,
                { wrapper }
            );

            fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

            expect(onRetry).toHaveBeenCalledWith(row);
            expect(screen.getByRole('button', { name: 'Delete message' })).toBeDefined();
        });

        it('offers Delete only when its pictures are gone (a reload)', () => {
            render(
                <MessageList
                    messages={[pictures('failed')]}
                    isLoading={false}
                    viewer={VIEWER}
                    names={new Map()}
                    onRetry={vi.fn()}
                    onDiscard={vi.fn()}
                    canRetry={() => false}
                />,
                { wrapper }
            );

            expect(screen.getByText('Not delivered')).toBeDefined();
            expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
            expect(screen.getByRole('button', { name: 'Delete message' })).toBeDefined();
        });
    });
});

describe('MessageList jumps', () => {
    const scrollIntoView = vi.mocked(Element.prototype.scrollIntoView);
    const feed = [message(1, 'ada', 'one'), message(2, 'ada', 'two'), message(3, 'ada', 'three')];

    afterEach(() => {
        cleanup();
        scrollIntoView.mockClear();
        toast.mockClear();
    });

    const renderJump = (jumpTarget: { chatNo: number; nonce: number; restore?: boolean }) =>
        render(
            <MessageList
                messages={feed}
                isLoading={false}
                viewer={VIEWER}
                names={new Map([['ada', 'Ada']])}
                jumpTarget={jumpTarget}
            />,
            { wrapper }
        );

    it('centres a jump target and flashes it', () => {
        const { container } = renderJump({ chatNo: 2, nonce: 1 });
        const row = container.querySelector('[data-chat-no="2"]');
        expect(scrollIntoView.mock.contexts).toContain(row);
        expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'center' });
        expect(row?.outerHTML).toMatch(/bg-primary\/10/);
    });

    // A return trip puts the reader back where they were reading: top of the view, no flash.
    it('puts a restored message at the top of the view without flashing it', () => {
        const { container } = renderJump({ chatNo: 2, nonce: 1, restore: true });
        const row = container.querySelector('[data-chat-no="2"]');
        expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'start' });
        expect(row?.outerHTML).not.toMatch(/bg-primary\/10/);
    });

    // The pin state used to wait for the scroll frame after a landing. A page arriving in
    // between still read "at the bottom", followed the tail, and carried the reader away.
    it('stops following the tail once a jump lands above it', () => {
        const heights = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(2000);
        const client = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(500);
        try {
            const { container, rerender } = renderJump({ chatNo: 2, nonce: 1 });
            const scroller = container.querySelector<HTMLElement>('[data-chat-no="2"]')?.closest('.overflow-y-auto');
            expect(scroller).toBeTruthy();
            if (!scroller) return;
            scroller.scrollTop = 300;
            rerender(
                <MessageList
                    messages={[...feed, message(4, 'ada', 'four')]}
                    isLoading={false}
                    viewer={VIEWER}
                    names={new Map([['ada', 'Ada']])}
                    jumpTarget={{ chatNo: 2, nonce: 1 }}
                />
            );
            expect(scroller.scrollTop).toBe(300);
        } finally {
            heights.mockRestore();
            client.mockRestore();
        }
    });

    // The way back to "the latest" or to an anchor that is gone ends at the bottom. Paging
    // back for it and saying "not found" left the reader deeper in history than before.
    it.each([
        ['to the latest', null],
        ['to an anchor that is gone', 99],
    ])('lands a restore %s at the bottom without a not-found notice', async (_, chatNo) => {
        const heights = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(2000);
        const onJumpConsumed = vi.fn();
        try {
            const { container } = render(
                <MessageList
                    messages={feed}
                    isLoading={false}
                    viewer={VIEWER}
                    names={new Map([['ada', 'Ada']])}
                    hasMore={false}
                    jumpTarget={{ chatNo, nonce: 1, restore: true }}
                    onJumpConsumed={onJumpConsumed}
                />,
                { wrapper }
            );
            const scroller = container.querySelector<HTMLElement>('[data-chat-no="1"]')?.closest('.overflow-y-auto');
            await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));
            expect(scroller?.scrollTop).toBe(2000);
            expect(onJumpConsumed).toHaveBeenCalledTimes(1);
            expect(toast).not.toHaveBeenCalled();
        } finally {
            heights.mockRestore();
        }
    });
});

describe('MessageList failed send', () => {
    afterEach(cleanup);

    // The failure line was plain text a screen reader passed over, and its button said
    // only "Delete" beside a message that has other delete actions.
    it('announces the failure and names what Delete removes', () => {
        const failed = { ...message(1, 'me', 'lost'), id: undefined, isFailed: true } as DomainChat;
        render(
            <MessageList
                messages={[failed]}
                isLoading={false}
                viewer={VIEWER}
                names={new Map()}
                onRetry={vi.fn()}
                onDiscard={vi.fn()}
            />,
            { wrapper }
        );
        expect(screen.getByRole('status').textContent).toContain('Not delivered');
        expect(screen.getByRole('button', { name: 'Delete message' })).toBeDefined();
    });
});

describe('MessageList first page failed', () => {
    afterEach(cleanup);

    // An empty list after a failed load is not an empty room: the intro would invite a first
    // message into a room that has history.
    it('says the messages did not load and retries, instead of the intro', () => {
        const onRetryLoad = vi.fn();
        render(
            <MessageList
                messages={[]}
                isLoading={false}
                viewer={VIEWER}
                intro={<p>Write the first message</p>}
                loadFailed
                onRetryLoad={onRetryLoad}
            />,
            { wrapper }
        );

        expect(screen.getByRole('alert').textContent).toContain('Could not load messages.');
        expect(screen.queryByText('Write the first message')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(onRetryLoad).toHaveBeenCalledTimes(1);
    });
});
