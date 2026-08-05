import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { render, screen } from '@testing-library/react';

import type { DomainChat } from '@chatic/data';
import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

// The row's action controls reach for the chat repository and the active place at
// module scope; neither is available outside the app shell. Nothing here asserts on
// them — this file is about whether the list renders at all.
vi.mock('@chatic/app-runtime', () => ({
    useRuntimeRepositories: () => ({ chat: { updateChat: vi.fn(), deleteChat: vi.fn(), setReaction: vi.fn() } }),
}));
vi.mock('@chatic/web-core', () => ({
    getActiveServerContext: () => ({ siteId: 'S1' }),
    useGlobalSession: () => ({ activeServer: { siteId: 'S1' } }),
}));

// Initialises i18next as a side effect, so `t` resolves to real copy instead of
// echoing the key back. Assertions can then name what the reader sees.
import '../../../../i18n';

import { MessageList } from './MessageList';
import type { ThreadMeta } from '../utils';

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
        expect(screen.queryByLabelText('Copy')).toBeNull();
        expect(screen.queryByLabelText('Delete message')).toBeNull();
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
        expect(screen.getByLabelText('👍 — Me, Ada')).toBeDefined();
    });
});
