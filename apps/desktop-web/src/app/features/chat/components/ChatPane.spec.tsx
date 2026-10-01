import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

import type { DomainChannel } from '@chatic/data';
import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import type * as SharedModule from '../../../shared';

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useSessionIdentity: () => ({ userId: 'me' }),
            useSessionSelection: () => ({ selectedCloudId: 'cloud-a', selectedSiteId: 'site-a' }),
        },
    },
}));
vi.mock('../../../shared', async () => ({
    ...(await vi.importActual<typeof SharedModule>('../../../shared')),
    useChats: () => ({ messages: [], isLoading: false, loadOlder: vi.fn(), hasMore: false, isLoadingOlder: false }),
    useAuthorNames: () => new Map(),
    useChannelLabels: () => (channel: { name?: string }) => channel.name ?? '',
    useReadReceipts: () => undefined,
}));
vi.mock('../../channels', () => ({
    useChannelActions: () => ({}),
    useChannelSettingsStore: (select: (s: { open: () => void }) => unknown) => select({ open: vi.fn() }),
}));
vi.mock('../../search', () => ({
    useSearchDialogStore: (select: (s: { open: () => void }) => unknown) => select({ open: vi.fn() }),
}));
const composerSend = vi.fn();
const useComposerSend = vi.fn((_target: unknown) => ({ send: composerSend }));
const clearTray = vi.fn();
vi.mock('../hooks', () => ({
    useMentionables: () => [],
    useMessageViewer: () => ({ uid: 'me', name: 'Me', cloudUid: 'me-cloud' }),
    useImageAttachments: () => ({
        attachments: [],
        addFiles: vi.fn(),
        remove: vi.fn(),
        clear: clearTray,
    }),
    useFileDrop: () => ({ isDragging: false, dropHandlers: {} }),
    useComposerSend: (target: unknown) => useComposerSend(target),
}));
vi.mock('./DesktopLayout', () => ({ useShellSidebar: () => ({ isDrawer: false, open: vi.fn() }) }));
vi.mock('./MessageList', () => ({ MessageList: () => null }));
vi.mock('./ChannelHeaderMenu', () => ({ ChannelHeaderMenu: () => null }));
let composerOnSend: ((content: string, files: File[]) => void) | undefined;
/** Every `autoFocus` the composer was rendered with — the real one focuses itself on `true`. */
const composerAutoFocus: (boolean | undefined)[] = [];
vi.mock('./Composer', () => ({
    Composer: ({ onSend, autoFocus }: { onSend: (content: string, files: File[]) => void; autoFocus?: boolean }) => {
        composerOnSend = onSend;
        composerAutoFocus.push(autoFocus);
        return null;
    },
}));

import '../../../../i18n';
import i18next from 'i18next';
import { useComposerFocusStore } from '../../../shared';
import { ChatPane } from './ChatPane';

const wrapper = ({ children }: { children: ReactNode }) => <TooltipProvider>{children}</TooltipProvider>;

beforeEach(() => {
    vi.clearAllMocks();
    composerOnSend = undefined;
    composerAutoFocus.length = 0;
    useComposerFocusStore.setState({ removedId: null });
});

const room = (id: string) => ({ id, name: id, cid: 'cloud-a' }) as DomainChannel;

describe('ChatPane', () => {
    it("sends the composer's text and pictures to the channel in its own cloud, and empties the tray", () => {
        const files = [new File(['a'], 'a.png', { type: 'image/png' })];

        render(<ChatPane channel={{ id: 'C1', name: 'general', cid: 'cloud-a' } as DomainChannel} members={[]} />, {
            wrapper,
        });
        composerOnSend?.('caption', files);

        expect(useComposerSend).toHaveBeenLastCalledWith({ cid: 'cloud-a', channelId: 'C1' });
        expect(composerSend).toHaveBeenCalledWith('caption', files);
        expect(clearTray).toHaveBeenCalled();
    });

    it('binds no room for pictures while no channel is open', () => {
        render(<ChatPane channel={undefined} members={[]} />, { wrapper });

        expect(useComposerSend).toHaveBeenLastCalledWith({ cid: '', channelId: '' });
    });
});

// Deleting or leaving the open room takes the focused header with it; the room shown next
// has to pick focus up, and only that one.
describe('ChatPane focus after a channel was removed', () => {
    it('does not focus the composer on a plain open', () => {
        render(<ChatPane channel={room('C2')} members={[]} />, { wrapper });

        expect(composerAutoFocus).not.toContain(true);
    });

    it('waits while the removed room is still the one shown', () => {
        useComposerFocusStore.getState().request('C1');
        render(<ChatPane channel={room('C1')} members={[]} />, { wrapper });

        expect(composerAutoFocus).not.toContain(true);
        expect(useComposerFocusStore.getState().removedId).toBe('C1');
    });

    it('focuses the composer of the room the pane switches to, once', () => {
        useComposerFocusStore.getState().request('C1');
        const { rerender } = render(<ChatPane channel={undefined} members={[]} />, { wrapper });
        // Channels are still listed, so the pane is between rooms, not out of them.
        expect(useComposerFocusStore.getState().removedId).toBe('C1');

        rerender(<ChatPane channel={room('C2')} members={[]} />);
        expect(composerAutoFocus).toContain(true);
        expect(useComposerFocusStore.getState().removedId).toBeNull();

        composerAutoFocus.length = 0;
        rerender(<ChatPane channel={room('C3')} members={[]} />);
        expect(composerAutoFocus).not.toContain(true);
    });

    it('focuses the open room when the removed channel was another one', () => {
        useComposerFocusStore.getState().request('C1');
        render(<ChatPane channel={room('C2')} members={[]} />, { wrapper });

        expect(composerAutoFocus).toContain(true);
        expect(useComposerFocusStore.getState().removedId).toBeNull();
    });

    it("focuses the empty state's action when no room is left, and spends the request", () => {
        useComposerFocusStore.getState().request('C1');
        const { rerender } = render(
            <ChatPane channel={undefined} members={[]} emptyState={{ mode: 'create', onAction: vi.fn() }} />,
            { wrapper }
        );

        expect(document.activeElement).toBe(screen.getByRole('button'));
        expect(useComposerFocusStore.getState().removedId).toBeNull();

        rerender(<ChatPane channel={room('C3')} members={[]} />);
        expect(composerAutoFocus).not.toContain(true);
    });
});

describe('ChatPane empty state', () => {
    const pointer = () => screen.queryByText(i18next.t('mobileApp.planAndCloud'), { exact: false });

    // Home offered only an invite, and nothing said where a cloud of one's own comes from.
    it('says where to make a cloud beside the invite on Home', () => {
        render(<ChatPane channel={undefined} members={[]} emptyState={{ mode: 'join', onAction: vi.fn() }} />, {
            wrapper,
        });
        expect(screen.getByRole('button', { name: i18next.t('chat.empty.join.action') })).toBeTruthy();
        expect(pointer()).toBeTruthy();
        expect(screen.getByRole('link', { name: 'App Store' })).toBeTruthy();
    });

    it('does not repeat it in a cloud with no channels, where the answer is to make one', () => {
        render(<ChatPane channel={undefined} members={[]} emptyState={{ mode: 'create', onAction: vi.fn() }} />, {
            wrapper,
        });
        expect(pointer()).toBeNull();
    });
});
