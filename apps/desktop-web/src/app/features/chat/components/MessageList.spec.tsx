import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { $getRoot, $getSelection, $isRangeSelection, type LexicalEditor } from 'lexical';

import type { DomainChat } from '@chatic/data';
import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

// The row's action controls reach for the chat repository and the active place at
// module scope; neither is available outside the app shell. Nothing here asserts on
// them — this file is about whether the list renders at all.
const updateChat = vi.hoisted(() => vi.fn());
vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: () => ({
                chat: { updateChat, deleteChat: vi.fn(), setReaction: vi.fn() },
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
import { useSavedItemsStore } from '../../../shared';
import type { ThreadMeta } from '../utils';
import { MSG_MENTION_CLASS, WEBHOOK_BLOCKS_ERROR_REPORT, WEBHOOK_SEND_ERROR_REPORT } from '@chatic/block-kit';

// jsdom implements no layout, so it ships no scrollIntoView. The list calls it from a
// layout effect to land on the newest message.
Element.prototype.scrollIntoView = vi.fn();
// Nor does it lay out ranges: the editor scrolls a focused selection into view through one.
Range.prototype.getBoundingClientRect = () => new DOMRect();
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;

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

// A reply that is only a file: no text, so nothing in the row but the attachment.
const fileOnlyReply = (chatNo: number, ownerId: string): DomainChat =>
    ({
        ...message(chatNo, ownerId, ''),
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
    }) as unknown as DomainChat;

/**
 * A smoke render of the two derivations that live inside the component rather than in
 * a pure util — the thread-footer view and the reactor-name resolver.
 *
 * Both were shipped calling a helper the file never imported, which threw a
 * ReferenceError the moment either ran. No gate caught it: vite strips types without
 * resolving free identifiers, `typescript-eslint` disables `no-undef` on TS files, and
 * nothing rendered this component.
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
            // Mine, so the delete menu is reachable: a webhook message is never mine, and what this
            // pins is the dialog's quoting, which does not depend on the sender.
            blocks$: [...WEBHOOK_BLOCKS_ERROR_REPORT],
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

    // In the thread panel the column is about 270px and the toolbar about 210px, so a toolbar
    // over the author line hid the author's name. There it hangs under the header on a block's
    // first message; the rest keep their place above their own message. jsdom lays nothing out,
    // so this pins the placement class; the overlap itself needs a browser.
    // A thread passes no `onOpenThread` (no thread inside a thread), and a file sent on its own has
    // no text. The row still has to offer Delete to the person who sent it.
    it('offers Delete on my file-only reply in a thread', () => {
        render(
            <MessageList messages={[fileOnlyReply(1, 'me')]} isLoading={false} viewer={VIEWER} names={new Map()} />,
            { wrapper }
        );
        clickRowMenuItem('Delete message');

        expect(screen.getByRole('alertdialog')).toBeDefined();
    });

    // Reacting is only reachable from the toolbar, so a file-only reply from somebody else, which
    // has no text and nothing of mine to edit or delete, still needs the toolbar for its reactions.
    it("offers reactions on somebody else's file-only reply in a thread", () => {
        render(
            <MessageList
                messages={[fileOnlyReply(1, 'ada')]}
                isLoading={false}
                viewer={VIEWER}
                names={new Map([['ada', 'Ada']])}
            />,
            { wrapper }
        );

        expect(screen.getByLabelText('Add reaction')).toBeDefined();
    });

    // A file sent on its own is as worth coming back to as a text, so its menu holds Save for
    // later. Only that: there is no text to copy or edit, and somebody else's file is not mine
    // to delete. The thread panel passes no `onOpenThread`; the main feed does.
    it.each([
        ['in a thread', undefined],
        ['in the main feed', vi.fn()],
    ])("offers only Save for later on somebody else's file-only message %s", (_where, onOpenThread) => {
        render(
            <MessageList
                messages={[fileOnlyReply(1, 'ada')]}
                isLoading={false}
                viewer={VIEWER}
                names={new Map([['ada', 'Ada']])}
                onOpenThread={onOpenThread}
            />,
            { wrapper }
        );
        fireEvent.keyDown(screen.getByLabelText('More actions'), { key: 'Enter' });

        expect(screen.getAllByRole('menuitem').map(item => item.textContent)).toEqual(['Save for later']);
    });

    it.each([
        ['in a thread', undefined],
        ['in the main feed', vi.fn()],
    ])('offers Save for later on my file-only message %s, next to Delete', (_where, onOpenThread) => {
        render(
            <MessageList
                messages={[fileOnlyReply(1, 'me')]}
                isLoading={false}
                viewer={VIEWER}
                names={new Map()}
                onOpenThread={onOpenThread}
            />,
            { wrapper }
        );
        fireEvent.keyDown(screen.getByLabelText('More actions'), { key: 'Enter' });
        const items = screen.getAllByRole('menuitem').map(item => item.textContent);

        expect(items).toContain('Save for later');
        expect(items).toContain('Delete message');
        expect(items).not.toContain('Copy');
    });

    // The saved card leads with the snapshot's text, so a file saved as its empty `content` would
    // have no line of its own. It reads the way the sidebar previews it, and keeps what it carried
    // for the Saved page's Files filter.
    it('saves a file-only message under what it carries, not its empty text', () => {
        useSavedItemsStore.setState({ items: {} });
        render(
            <MessageList
                messages={[fileOnlyReply(1, 'ada')]}
                isLoading={false}
                viewer={VIEWER}
                names={new Map([['ada', 'Ada']])}
            />,
            { wrapper }
        );
        clickRowMenuItem('Save for later');

        expect(useSavedItemsStore.getState().items['C1:1']).toMatchObject({
            content: 'File',
            ownerName: 'Ada',
            attachment: { kind: 'file', count: 1 },
        });
    });

    it('saves a text message under its text', () => {
        useSavedItemsStore.setState({ items: {} });
        render(
            <MessageList
                messages={[message(1, 'ada', 'see you at noon')]}
                isLoading={false}
                viewer={VIEWER}
                names={new Map([['ada', 'Ada']])}
            />,
            { wrapper }
        );
        clickRowMenuItem('Save for later');

        expect(useSavedItemsStore.getState().items['C1:1']).toMatchObject({ content: 'see you at noon' });
    });

    describe('editing my message', () => {
        beforeEach(() => {
            updateChat.mockReset();
            updateChat.mockResolvedValue({ id: 'C1:1', content: 'see you at noon!' });
        });

        // A thread panel renders the same list with no thread callbacks, so this is its surface too.
        const renderMine = () =>
            render(
                <MessageList
                    messages={[message(1, 'me', 'see you at noon')]}
                    isLoading={false}
                    viewer={VIEWER}
                    names={new Map()}
                />,
                { wrapper }
            );
        const editorBody = () =>
            screen.getByRole('textbox', { name: 'Edit message' }) as HTMLElement & { __lexicalEditor?: LexicalEditor };
        // The editor loads its document in a microtask; typing before that would land in an empty box.
        // It also arrives as a lazy chunk, so wait for the textbox rather than a single flush. Only the
        // first open in the file suspends: it waits for the chunk, and never less than the 300 ms React
        // holds a Suspense fallback on screen. A cold chunk on a busy CI runner has taken over a second,
        // past waitFor's default timeout. Later opens find the lazy component resolved.
        const openEditor = async () => {
            clickRowMenuItem('Edit message');
            await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Edit message' })).not.toBeNull(), {
                timeout: 5000,
            });
            await act(async () => {
                await Promise.resolve();
            });
        };
        const typeAtEnd = (text: string) =>
            act(() =>
                editorBody().__lexicalEditor?.update(
                    () => {
                        $getRoot().selectEnd();
                        const selection = $getSelection();
                        if ($isRangeSelection(selection)) selection.insertText(text);
                    },
                    { discrete: true }
                )
            );

        it('opens the editor in place of the text, with no hover toolbar and the hover band held', async () => {
            const { container } = renderMine();
            await openEditor();

            expect(editorBody()).toBeDefined();
            expect(screen.queryByLabelText('More actions')).toBeNull();
            expect(container.querySelector('[data-roving-group]')?.classList.contains('bg-accent/70')).toBe(true);
        });

        it('shows a listed @name in the message as a chip when the editor opens', async () => {
            render(
                <MessageList
                    messages={[message(1, 'me', 'ping @Ada')]}
                    isLoading={false}
                    viewer={VIEWER}
                    names={new Map()}
                    mentionables={[{ id: 'u-ada', name: 'Ada' }]}
                />,
                { wrapper }
            );
            await openEditor();

            await waitFor(() => expect(editorBody().querySelector('[data-lexical-text]')).not.toBeNull());
            const chip = within(editorBody()).getByText('@Ada');
            expect(chip.className).toContain(MSG_MENTION_CLASS);
        });

        it('saves what was typed through the repository and hands focus back to the message', async () => {
            renderMine();
            await openEditor();

            await typeAtEnd('!');
            await act(async () => {
                fireEvent.keyDown(editorBody(), { key: 'Enter', keyCode: 13 });
            });

            await waitFor(() => expect(updateChat).toHaveBeenCalledWith({ id: 'C1:1', content: 'see you at noon!' }));
            expect(screen.queryByRole('textbox', { name: 'Edit message' })).toBeNull();
            expect(document.activeElement).toBe(screen.getByRole('article'));
        });

        it('leaves the message alone and hands focus back on Escape', async () => {
            renderMine();
            await openEditor();
            editorBody().focus();

            fireEvent.keyDown(editorBody(), { key: 'Escape' });

            expect(updateChat).not.toHaveBeenCalled();
            expect(screen.queryByRole('textbox', { name: 'Edit message' })).toBeNull();
            expect(document.activeElement).toBe(screen.getByRole('article'));
        });
    });

    // The toolbar is drawn from what the row can do, so a row the server has not accepted has
    // nothing to draw: every reaction needs an id to address. An empty pill would hover over it.
    it.each([
        ['pending', { isPending: true }],
        ['failed', { isFailed: true }],
    ])("draws no toolbar on somebody else's %s file-only reply", (_state, flags) => {
        const { container } = render(
            <MessageList
                messages={[{ ...fileOnlyReply(1, 'ada'), ...flags } as DomainChat]}
                isLoading={false}
                viewer={VIEWER}
                names={new Map([['ada', 'Ada']])}
            />,
            { wrapper }
        );

        expect(container.querySelector('[data-row-actions]')).toBeNull();
    });

    it('keeps every toolbar over the header, in a thread too, and folds quick reactions in a narrow column', () => {
        const inspect = (threadReplyCount?: number) => {
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
            // Over the header is -top-10; a toolbar hung lower sits on the first line of text, where a
            // reader dragging to select it runs under the toolbar.
            const tops = [...container.querySelectorAll('[data-row-actions]')].map(node =>
                node.className.includes('-top-10') ? 'over-header' : 'lower'
            );
            // The column is the container the narrow rule measures, so a 360px thread panel folds the
            // quick reactions away and the toolbar stays short enough to leave the author name visible.
            const column = container.querySelector('[role="log"]');
            const quick = [...container.querySelectorAll('button[aria-label^="React with"]')];
            const result = {
                tops,
                columnIsContainer: !!column?.className.includes('[container-type:inline-size]'),
                quickFold:
                    quick.length > 0 &&
                    quick.every(button => button.className.includes('[@container(max-width:480px)]:hidden')),
            };
            unmount();
            return result;
        };

        const expected = { tops: ['over-header', 'over-header'], columnIsContainer: true, quickFold: true };
        expect(inspect(1)).toEqual(expected);
        expect(inspect()).toEqual(expected);
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

    describe('a hung send', () => {
        it('flips to Not delivered exactly once, without polling meanwhile', () => {
            vi.useFakeTimers();
            try {
                const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
                try {
                    vi.setSystemTime(1_700_000_100_000);
                    const hung = {
                        id: 'C1:9',
                        channelId: 'C1',
                        chatNo: 9,
                        ownerId: 'me',
                        content: 'hello?',
                        isPending: true,
                        createdAt: 1_700_000_100_000 - 59_000,
                    } as DomainChat;
                    render(
                        <MessageList
                            messages={[hung]}
                            isLoading={false}
                            viewer={VIEWER}
                            names={new Map()}
                            onRetry={vi.fn()}
                            onDiscard={vi.fn()}
                            canRetry={() => true}
                        />,
                        { wrapper }
                    );

                    // Still sending: the deadline is a second out.
                    expect(screen.queryByText('Not delivered')).toBeNull();
                    // One shot, not a poll — nothing ticks while it waits.
                    expect(setIntervalSpy).not.toHaveBeenCalled();

                    act(() => {
                        vi.advanceTimersByTime(2_000);
                    });
                    expect(screen.getByText('Not delivered')).toBeDefined();
                } finally {
                    setIntervalSpy.mockRestore();
                }
            } finally {
                vi.useRealTimers();
            }
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

describe('MessageList older page failed', () => {
    afterEach(cleanup);

    // A failed older page is retried by the next scroll, but nothing showed it — the
    // history read as simply ended. The row says so and retries on demand.
    it('says older messages did not load and retries through onLoadOlder', () => {
        const onLoadOlder = vi.fn();
        render(
            <MessageList
                messages={[message(60, 'ada', 'newest')]}
                isLoading={false}
                viewer={VIEWER}
                names={new Map([['ada', 'Ada']])}
                onLoadOlder={onLoadOlder}
                hasMore
                loadOlderFailed
            />,
            { wrapper }
        );

        expect(screen.getByRole('status').textContent).toContain("Couldn't load older messages.");
        // Mounting with no layout fires the auto-fill load once; the retry is the next call.
        onLoadOlder.mockClear();
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(onLoadOlder).toHaveBeenCalledTimes(1);
    });

    it('shows no retry row while the retry is in flight', () => {
        render(
            <MessageList
                messages={[message(60, 'ada', 'newest')]}
                isLoading={false}
                viewer={VIEWER}
                names={new Map([['ada', 'Ada']])}
                onLoadOlder={vi.fn()}
                hasMore
                isLoadingOlder
                loadOlderFailed
            />,
            { wrapper }
        );

        expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
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

// A newest page of deleted messages, or of replies whose roots were deleted, leaves the feed with
// nothing to show and nothing to scroll: no scroll would ever ask for the history below it.
describe('MessageList with nothing shown and older history', () => {
    afterEach(cleanup);

    const renderEmpty = (props: { onLoadOlder: () => void; isLoadingOlder?: boolean; loadOlderFailed?: boolean }) =>
        render(
            <MessageList
                messages={[]}
                isLoading={false}
                viewer={VIEWER}
                intro={<p>Write the first message</p>}
                hasMore
                {...props}
            />,
            { wrapper }
        );

    it('pulls the older page by itself and shows loading, not the intro', () => {
        const onLoadOlder = vi.fn();
        renderEmpty({ onLoadOlder });

        expect(onLoadOlder).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('status')).toBeTruthy();
        expect(screen.queryByText('Write the first message')).toBeNull();
    });

    it('does not pull while the first page is still loading', () => {
        const onLoadOlder = vi.fn();
        render(<MessageList messages={[]} isLoading viewer={VIEWER} hasMore onLoadOlder={onLoadOlder} />, { wrapper });

        expect(onLoadOlder).not.toHaveBeenCalled();
    });

    it('does not ask again while a page is out', () => {
        const onLoadOlder = vi.fn();
        renderEmpty({ onLoadOlder, isLoadingOlder: true });

        expect(onLoadOlder).not.toHaveBeenCalled();
    });

    it('says a failed page did not load, and retries it through onLoadOlder', () => {
        const onLoadOlder = vi.fn();
        renderEmpty({ onLoadOlder, loadOlderFailed: true });

        // A failed page is not asked for again until the reader retries it.
        expect(onLoadOlder).not.toHaveBeenCalled();
        expect(screen.getByRole('alert').textContent).toContain('Could not load messages.');
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(onLoadOlder).toHaveBeenCalledTimes(1);
    });

    it('shows the intro once the history has run out', () => {
        render(
            <MessageList
                messages={[]}
                isLoading={false}
                viewer={VIEWER}
                intro={<p>Write the first message</p>}
                onLoadOlder={vi.fn()}
                hasMore={false}
            />,
            { wrapper }
        );

        expect(screen.getByText('Write the first message')).toBeTruthy();
    });
});

describe('MessageList webhook sender', () => {
    const webhookCard = (chatNo: number, ownerId: string, owner?: { name: string }): DomainChat =>
        ({
            ...message(chatNo, ownerId, WEBHOOK_SEND_ERROR_REPORT.content),
            stereo: 'webhook',
            blocks$: [...WEBHOOK_BLOCKS_ERROR_REPORT],
            ...(owner ? { owner$: owner } : {}),
        }) as unknown as DomainChat;

    it('badges the sender as an app and renders its name as plain text, not a profile trigger', () => {
        render(
            <MessageList
                messages={[webhookCard(1, 'hook', { name: 'Alarm Bot' })]}
                isLoading={false}
                viewer={VIEWER}
            />,
            { wrapper }
        );

        expect(screen.getByText('App')).toBeDefined();
        expect(screen.getByText('Alarm Bot')).toBeDefined();
        expect(screen.queryByRole('button', { name: 'Alarm Bot' })).toBeNull();
        // The avatar is no popover trigger either: its only possible name is the initial.
        expect(screen.queryByRole('button', { name: 'A' })).toBeNull();
    });

    // owner$ is not confirmed to arrive for webhook messages, so the no-owner$ case is pinned too.
    it('labels the sender "Webhook" when the server sent no owner$', () => {
        render(<MessageList messages={[webhookCard(1, 'hook')]} isLoading={false} viewer={VIEWER} />, { wrapper });

        expect(screen.getByText('Webhook')).toBeDefined();
        expect(screen.getByText('App')).toBeDefined();
        expect(screen.queryByRole('button', { name: 'Webhook' })).toBeNull();
    });

    it('keeps a person as a profile trigger with no app badge', () => {
        render(
            <MessageList
                messages={[message(1, 'ada', 'hi')]}
                isLoading={false}
                viewer={VIEWER}
                names={new Map([['ada', 'Ada']])}
            />,
            { wrapper }
        );

        expect(screen.getByRole('button', { name: 'Ada' })).toBeDefined();
        expect(screen.queryByText('App')).toBeNull();
    });
});
