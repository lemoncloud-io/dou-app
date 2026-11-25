import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { $getRoot, $getSelection, $isRangeSelection, type LexicalEditor } from 'lexical';

import type { DomainChat } from '@chatic/runtime-react';
import { TooltipProvider } from '@chatic/ui-kit';

const updateChat = vi.hoisted(() => vi.fn());
vi.mock('@chatic/runtime-react', async () =>
    (await import('@chatic/runtime-react/testing')).fakeRuntimeModule({
        data: {
            useRuntimeRepositories: () => ({
                chat: { updateChat, deleteChat: vi.fn(), setReaction: vi.fn() },
            }),
        },
        session: {
            getActiveServerContext: () => ({ siteId: 'S1' }),
            useGlobalSession: () => ({ activeServer: { siteId: 'S1' } }),
        },
    })
);

const toast = vi.hoisted(() => vi.fn());
vi.mock('@chatic/ui-kit/components/ui/use-toast', async importOriginal => ({
    ...(await importOriginal<object>()),
    toast,
}));

import '../../../../i18n';

import { MessageList } from './MessageList';
import { en } from '../../../../locales/en';
import { ko } from '../../../../locales/ko';
import { useSavedItemsStore } from '../../../shared';
import type { ThreadMeta } from '../utils';
import {
    MSG_MENTION_CLASS,
    WEBHOOK_BLOCKS_DEPLOYMENT,
    WEBHOOK_BLOCKS_ERROR_REPORT,
    WEBHOOK_SEND_DEPLOYMENT,
    WEBHOOK_SEND_ERROR_REPORT,
    WEBHOOK_SOURCE_DEPLOYMENT,
} from '@chatic/block-kit';

Element.prototype.scrollIntoView = vi.fn();
Range.prototype.getBoundingClientRect = () => new DOMRect();
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;

const VIEWER = { uid: 'me', name: 'Me', cloudUid: 'me-cloud' };

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
const clickRowMenuItem = (name: RegExp | string) => {
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

    it('draws a Block Kit message instead of its payload', () => {
        const payload = JSON.stringify({
            blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '*403* denied by policy' } }],
        });

        render(
            <MessageList
                messages={[{ ...message(1, 'ada', payload), stereo: 'webhook' } as DomainChat]}
                isLoading={false}
                viewer={VIEWER}
                names={new Map([['ada', 'Ada']])}
            />,
            { wrapper }
        );

        expect(screen.getByText('403').tagName).toBe('STRONG');
        expect(screen.queryByText(payload)).toBeNull();
    });

    it('draws blocks$ ahead of content — header, sections and context all reach the DOM', () => {
        const withBlocksField = {
            ...message(1, 'ada', WEBHOOK_SEND_ERROR_REPORT.content),
            blocks$: [...WEBHOOK_BLOCKS_ERROR_REPORT],
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

        expect(screen.getByRole('heading', { name: /error-report/ })).toBeDefined();
        expect(
            screen.getByText(/^TypeError: Cannot read properties of undefined \(reading 'channelId'\)$/)
        ).toBeDefined();
        expect(screen.getByText(/^\{"service":/)).toBeDefined();
        expect(screen.getByText(/hello-alarm/)).toBeDefined();
    });

    it("draws a webhook card's report link as its last line and drops the source element", () => {
        const webhook = {
            ...message(1, 'ada', WEBHOOK_SEND_ERROR_REPORT.content),
            blocks$: [...WEBHOOK_BLOCKS_ERROR_REPORT],
            stereo: WEBHOOK_SEND_ERROR_REPORT.stereo,
        } as DomainChat;

        render(<MessageList messages={[webhook]} isLoading={false} viewer={VIEWER} names={new Map()} />, {
            wrapper,
        });

        const link = screen.getByRole('link', { name: 'View source' });
        expect(link.getAttribute('href')).toBe(WEBHOOK_SEND_ERROR_REPORT.meta.sourceUrl);
        expect(screen.getByRole('heading', { name: /error-report/ }).closest('a')).toBeNull();
        expect(link.nextElementSibling).toBeNull();
        expect(link.previousElementSibling?.textContent).toBe('hello-alarm example-api/production#1.0.0');
        expect(screen.queryByText('원문 보기')).toBeNull();
    });

    it("badges a webhook card with its sender's channel and links it to source$.url", () => {
        const webhook = {
            ...message(1, 'ada', WEBHOOK_SEND_DEPLOYMENT.content),
            blocks$: [...WEBHOOK_BLOCKS_DEPLOYMENT],
            stereo: WEBHOOK_SEND_DEPLOYMENT.stereo,
            source$: { ...WEBHOOK_SOURCE_DEPLOYMENT, url: 'https://example.com/actions/runs/860' },
        } as DomainChat;

        render(<MessageList messages={[webhook]} isLoading={false} viewer={VIEWER} names={new Map()} />, {
            wrapper,
        });

        expect(screen.getByText('deployment').closest('.uppercase')).not.toBeNull();
        expect(screen.getByRole('link', { name: 'View source' }).getAttribute('href')).toBe(
            'https://example.com/actions/runs/860'
        );
        expect(screen.getAllByRole('link', { name: 'View source' })).toHaveLength(1);
    });

    it("ignores source$ on a person's message", () => {
        const pasted = {
            ...message(1, 'ada', 'just text'),
            stereo: 'user',
            source$: { key: 'error', color: 'danger', url: 'https://x.dev' },
        } as DomainChat;

        render(<MessageList messages={[pasted]} isLoading={false} viewer={VIEWER} names={new Map()} />, {
            wrapper,
        });

        expect(screen.queryByText('error')).toBeNull();
        expect(screen.queryByRole('link')).toBeNull();
    });

    it('frames a drawable block message as a card, and leaves an undrawable one as text', () => {
        const drawable = JSON.stringify({ blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'drawn' } }] });
        const undrawable = JSON.stringify({ blocks: [{ type: 'actions', elements: [] }] });

        render(
            <MessageList
                messages={[
                    { ...message(1, 'ada', drawable), stereo: 'webhook' } as DomainChat,
                    { ...message(2, 'ada', undrawable), stereo: 'webhook' } as DomainChat,
                ]}
                isLoading={false}
                viewer={VIEWER}
                names={new Map([['ada', 'Ada']])}
            />,
            { wrapper }
        );

        const cardOf = (node: HTMLElement) => node.closest('.rounded-\\[10px\\]');
        expect(cardOf(screen.getByText('drawn'))).not.toBeNull();
        expect(cardOf(screen.getByText(undrawable))).toBeNull();
    });

    it('saves the server summary, not the folded blocks, for a blocks$ message', () => {
        useSavedItemsStore.setState({ items: {} });
        const withBlocksField = {
            ...message(1, 'ada', WEBHOOK_SEND_ERROR_REPORT.content),
            stereo: WEBHOOK_SEND_ERROR_REPORT.stereo,
            blocks$: [...WEBHOOK_BLOCKS_ERROR_REPORT],
        } as DomainChat;

        render(<MessageList messages={[withBlocksField]} isLoading={false} viewer={VIEWER} names={new Map()} />, {
            wrapper,
        });
        clickRowMenuItem('Save for later');

        const saved = useSavedItemsStore.getState().items['C1:1'];
        expect(saved).toMatchObject({ content: WEBHOOK_SEND_ERROR_REPORT.content });
        expect(saved?.content).not.toMatch(/hello-alarm|"service":/);
        useSavedItemsStore.setState({ items: {} });
    });

    it("draws a person's Block Kit payload as the text they sent, not as a card", () => {
        const payload = JSON.stringify({
            blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '*403* denied' } }],
        });

        render(
            <MessageList
                messages={[{ ...message(1, 'ada', payload), stereo: 'user' } as DomainChat]}
                isLoading={false}
                viewer={VIEWER}
                names={new Map([['ada', 'Ada']])}
            />,
            { wrapper }
        );

        const row = screen.getByText((_, node) => node?.tagName === 'P' && !!node.textContent?.includes('{"blocks":['));
        expect(row.textContent).toContain('"type":"section"');
        expect(screen.queryByText('403', { selector: 'strong' })).toBeNull();
    });

    it('falls back to the raw text when the payload is broken', () => {
        render(
            <MessageList
                messages={[{ ...message(1, 'ada', '{"blocks": ['), stereo: 'webhook' } as DomainChat]}
                isLoading={false}
                viewer={VIEWER}
                names={new Map([['ada', 'Ada']])}
            />,
            { wrapper }
        );

        expect(screen.getByText('{"blocks": [')).toBeDefined();
    });

    it('offers Delete on my file-only reply in a thread', () => {
        render(
            <MessageList messages={[fileOnlyReply(1, 'me')]} isLoading={false} viewer={VIEWER} names={new Map()} />,
            { wrapper }
        );
        clickRowMenuItem('Delete message');

        expect(screen.getByRole('alertdialog')).toBeDefined();
    });

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
            const tops = [...container.querySelectorAll('[data-row-actions]')].map(node =>
                node.className.includes('-top-10') ? 'over-header' : 'lower'
            );
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

                    expect(screen.queryByText('Not delivered')).toBeNull();
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

    it('puts a restored message at the top of the view without flashing it', () => {
        const { container } = renderJump({ chatNo: 2, nonce: 1, restore: true });
        const row = container.querySelector('[data-chat-no="2"]');
        expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'start' });
        expect(row?.outerHTML).not.toMatch(/bg-primary\/10/);
    });

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

    it('renders the sender name as plain text with no app badge, not a profile trigger', () => {
        render(
            <MessageList
                messages={[webhookCard(1, 'hook', { name: 'Alarm Bot' })]}
                isLoading={false}
                viewer={VIEWER}
            />,
            { wrapper }
        );

        expect(screen.queryByText('App')).toBeNull();
        expect(screen.getByText('Alarm Bot')).toBeDefined();
        expect(screen.queryByRole('button', { name: 'Alarm Bot' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'A' })).toBeNull();
    });

    it('labels the sender "Webhook" when the server sent no owner$', () => {
        render(<MessageList messages={[webhookCard(1, 'hook')]} isLoading={false} viewer={VIEWER} />, { wrapper });

        expect(screen.getByText('Webhook')).toBeDefined();
        expect(screen.queryByText('App')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Webhook' })).toBeNull();
    });

    it('no longer carries copy for the app badge', () => {
        expect('chat.webhook.badge' in en).toBe(false);
        expect('chat.webhook.badge' in ko).toBe(false);
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

describe('a channel badged only for thread replies', () => {
    const replies = (newCount: number) =>
        new Map<string, ThreadMeta>([
            ['1', { count: 2, lastReplyAt: 1_700_000_100_000, repliers: [{ id: 'ada' }], newCount }],
        ]);
    const scrolledTo = () =>
        vi.mocked(Element.prototype.scrollIntoView).mock.contexts.map(el => (el as HTMLElement).dataset.chatNo);

    beforeEach(() => vi.mocked(Element.prototype.scrollIntoView).mockClear());

    const renderFeed = (baselineReadNo: number, newCount: number) =>
        render(
            <MessageList
                messages={[message(1, 'ada', 'parent'), message(2, 'bo', 'later')]}
                isLoading={false}
                viewer={VIEWER}
                names={new Map([['ada', 'Ada']])}
                baselineReadNo={baselineReadNo}
                threadMeta={replies(newCount)}
                onOpenThread={vi.fn()}
            />,
            { wrapper }
        );

    it('says how many replies are new on the root', () => {
        renderFeed(2, 1);

        expect(screen.getByText('1 new reply')).toBeDefined();
        expect(screen.getByRole('button', { name: 'Open thread · 2 replies · 1 new reply' })).toBeDefined();
    });

    it('lands on the root with new replies', () => {
        renderFeed(2, 1);

        expect(scrolledTo()).toContain('1');
    });

    it('lands on the unread divider instead when the feed has new messages too', () => {
        renderFeed(1, 1);

        expect(screen.getByText(/new messages/i)).toBeDefined();
        expect(scrolledTo()).not.toContain('1');
    });

    it('shows the last reply time and lands at the bottom once nothing is new', () => {
        renderFeed(2, 0);

        expect(screen.queryByText(/new repl/)).toBeNull();
        expect(scrolledTo()).not.toContain('1');
    });
});
