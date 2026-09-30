import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render } from '@testing-library/react';
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
vi.mock('./Composer', () => ({
    Composer: ({ onSend }: { onSend: (content: string, files: File[]) => void }) => {
        composerOnSend = onSend;
        return null;
    },
}));

import '../../../../i18n';
import { ChatPane } from './ChatPane';

const wrapper = ({ children }: { children: ReactNode }) => <TooltipProvider>{children}</TooltipProvider>;

beforeEach(() => {
    vi.clearAllMocks();
    composerOnSend = undefined;
});

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
