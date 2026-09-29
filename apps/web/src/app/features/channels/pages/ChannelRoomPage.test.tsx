import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import type { ClientChatView, DomainChannel } from '../types';

let mockChannel: Partial<DomainChannel> | null = null;
let mockMessages: Partial<ClientChatView>[] = [];
let mockSelectedCloudId = 'cloud-a';
const mockSendMessage = jest.fn();
const mockRetryMessage = jest.fn();
const mockDeleteMessage = jest.fn();
const mockUseJoinPositions = jest.fn();
// Every cloud gives the account its own uid. The session is committed to cloud-a, whose uid is
// 'uid-a'; in cloud-b the same account is 'uid-b'.
const mockUidInCloud: Record<string, string> = { 'cloud-a': 'uid-a', 'cloud-b': 'uid-b' };

jest.mock('react-router-dom', () => ({
    useParams: () => ({ channelId: 'ch1' }),
    useSearchParams: () => [new URLSearchParams(), jest.fn()],
    useLocation: () => ({ state: null }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/bridges', () => ({ logger: { error: jest.fn(), info: jest.fn() }, isNative: () => false }));
// Partial mock: keep the real module for everything else. `@chatic/app-runtime`'s session hooks
// reach `createQueryKeys` at import time, and a fully-replaced module would drop it.
jest.mock('@chatic/shared', () => ({
    ...jest.requireActual('@chatic/shared'),
    useNavigateWithTransition: () => jest.fn(),
}));
jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            // The committed session's uid. The room must not use it to recognise me — see the tests.
            useSessionIdentity: () => ({ userId: 'uid-a' }),
            useUidInCloud: (cid: string) => mockUidInCloud[cid] ?? null,
            useRuntimeProfile: () => ({ isGuest: false, isCloudActive: true }),
            useSessionSelection: () => ({ selectedCloudId: mockSelectedCloudId, selectedSiteId: 'S:active' }),
        },
        connection: {
            useRuntimeSocketState: () => ({ isVerified: true }),
        },
    },
}));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast: jest.fn() }));
jest.mock('@chatic/ui-kit/components/ui/dropdown-menu', () => ({ DropdownMenuItem: () => null }));
jest.mock('@chatic/web-ui-kit', () => ({
    AvatarGroup: () => null,
    ChatRoomHeader: () => null,
    DateDivider: () => null,
    DefaultAvatar: () => null,
    FloatingDateChip: () => null,
    ImageAvatar: () => null,
    SystemNotice: () => null,
    MessageInput: ({ onSend }: any) => <button data-testid="send" onClick={() => onSend('hello')} />,
}));
jest.mock('../../../bridge', () => ({ appBridge: {} }));
jest.mock('../../../runtime/logging/pushEntryRegistry', () => ({ pushEntryRegistry: { consume: () => null } }));
jest.mock('../../../hooks/useMenuNavigate', () => ({ useMenuNavigate: () => jest.fn() }));
jest.mock('../../../ui/hooks/useChromeInsets', () => ({
    useChromeInsets: () => ({
        headerRef: { current: null },
        footerRef: { current: null },
        headerHeight: 0,
        footerHeight: 0,
    }),
}));
jest.mock('../stores/useRecentEmojiStore', () => ({ useRecentEmojiStore: () => jest.fn() }));
jest.mock('../components/ChannelMessageRow', () => ({
    ChannelMessageRow: ({ message, onRetry, onDelete }: any) => (
        <div>
            <button data-testid={`retry-${message.id}`} onClick={onRetry} />
            <button data-testid={`delete-${message.id}`} onClick={onDelete} />
        </div>
    ),
}));
jest.mock('../components/ConfirmDialog', () => ({ ConfirmDialog: () => null }));
jest.mock('../components/DmInviteFooter', () => ({ DmInviteFooter: () => null }));
jest.mock('../components/EmojiPickerSheet', () => ({ EmojiPickerSheet: () => null }));
jest.mock('../components/MessageDetailDialog', () => ({ MessageDetailDialog: () => null }));
jest.mock('../components/MessageActionSheet', () => ({ MessageActionSheet: () => null }));
jest.mock('../components/ReactionDetailSheet', () => ({ ReactionDetailSheet: () => null }));
jest.mock('../components/RoomIntro', () => ({ RoomIntro: () => null }));
jest.mock('../components/RoomSkeleton', () => ({ RoomSkeleton: () => null }));
// The image send and the attach flow have their own tests; here only what the room hands them.
const mockSendImagesInputs: { cid: string; channelId: string }[] = [];
const mockImageRetry = jest.fn();
let mockImageCanRetry = true;
jest.mock('../hooks/useSendImages', () => ({
    useSendImages: (input: { cid: string; channelId: string }) => {
        mockSendImagesInputs.push(input);
        return {
            sendImages: jest.fn(),
            retry: (id: string) => mockImageRetry(id),
            canRetry: () => mockImageCanRetry,
            discard: jest.fn(),
        };
    },
}));
jest.mock('../components/ChatImageAttach', () => ({
    useChatImageAttach: () => ({ button: null, overlays: null }),
}));
jest.mock('../lib', () => ({
    ...jest.requireActual('../lib/channelStereoPolicy'),
    resolveChannelAvatar: () => ({ src: undefined }),
}));
jest.mock('../hooks', () => ({
    useRoomOpenTrace: () => undefined,
    useRoomSyncTrace: () => undefined,
    useChannel: () => ({ channel: mockChannel, isLoading: false, isError: false, isForbidden: false }),
    useChannelJoins: () => ({ joins: [], myJoin: null, activeMemberIds: [], cursorByUser: new Map() }),
    useChannelMembers: () => ({ members: [] }),
    useChannelProfiles: () => ({ profileMap: new Map() }),
    useChannelTitle: () => 'room',
    useChatMutations: () => ({
        sendMessage: mockSendMessage,
        retryMessage: mockRetryMessage,
        readMessage: jest.fn(),
        deleteMessage: mockDeleteMessage,
    }),
    useMessageEditing: () => ({
        isEditing: false,
        editStateFor: () => undefined,
        deleteTarget: null,
        discardOpen: false,
        cancelDelete: jest.fn(),
        confirmDelete: jest.fn(),
        setDiscardOpen: jest.fn(),
        closeEdit: jest.fn(),
        isDeleting: false,
    }),
    useChats: () => ({
        messages: mockMessages,
        rawChats: [],
        isLoading: false,
        isEmpty: mockMessages.length === 0,
        isLoadingMore: false,
        isError: false,
        hasMore: false,
        loadMore: jest.fn(),
        loadUntil: jest.fn(),
    }),
    useChatScroll: () => ({ containerRef: { current: null }, handleScroll: jest.fn() }),
    useDmInviteState: () => ({ state: { kind: 'present' }, countdown: null, resolveReinvitePrefill: jest.fn() }),
    useDmPeer: () => null,
    useJoinPositions: (...args: unknown[]) => {
        mockUseJoinPositions(...args);
        return { getReadCount: () => ({ readCount: 0, unreadCount: 0 }), isReady: false };
    },
    useMessageJump: () => undefined,
    useReactions: () => ({ toggleReaction: jest.fn(), failedId: null }),
    useReadMarker: () => ({ markSent: jest.fn() }),
}));

import { ChannelRoomPage } from './ChannelRoomPage';

/** The arguments of the latest `useJoinPositions` call: (cid, channelId, active, all, cursors, isMember). */
const lastJoinPositionsArgs = (): unknown[] => mockUseJoinPositions.mock.calls.at(-1) ?? [];

const failedRow = (over: Partial<ClientChatView> = {}): Partial<ClientChatView> => ({
    id: 'tmp-1',
    cid: 'cloud-b',
    channelId: 'ch1',
    content: 'hi',
    isFailed: true,
    isOwner: true,
    isSystem: false,
    ownerId: 'uid-b',
    ownerName: 'me',
    timestamp: new Date(1),
    ...over,
});

beforeEach(() => {
    mockChannel = { id: 'ch1', cid: 'cloud-b', stereo: 'group', memberIds: ['peer'] };
    mockMessages = [];
    mockSelectedCloudId = 'cloud-a';
    mockSendMessage.mockReset().mockResolvedValue({ chatNo: 3 });
    mockRetryMessage.mockReset().mockResolvedValue({ chatNo: 4 });
    mockDeleteMessage.mockReset().mockResolvedValue(undefined);
    mockUseJoinPositions.mockReset();
    (toast as jest.Mock).mockClear();
});

describe('ChannelRoomPage — the cloud a write is addressed to', () => {
    it("sends to the room's own cloud, not the selected one", () => {
        render(<ChannelRoomPage />);
        fireEvent.click(screen.getByTestId('send'));

        expect(mockSendMessage).toHaveBeenCalledWith('cloud-b', { channelId: 'ch1', content: 'hello' });
    });

    it('falls back to the selected cloud when the row names none', () => {
        mockChannel = { id: 'ch1', cid: '', stereo: 'group', memberIds: [] };

        render(<ChannelRoomPage />);
        fireEvent.click(screen.getByTestId('send'));

        expect(mockSendMessage).toHaveBeenCalledWith('cloud-a', expect.anything());
    });

    it('hands a failed row to the retry as it is, so it goes back to its own cloud', () => {
        mockMessages = [failedRow()];

        render(<ChannelRoomPage />);
        fireEvent.click(screen.getByTestId('retry-tmp-1'));

        expect(mockRetryMessage).toHaveBeenCalledWith(expect.objectContaining({ id: 'tmp-1', cid: 'cloud-b' }));
        expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it("removes a failed row from its own cloud's partition", () => {
        mockMessages = [failedRow()];

        render(<ChannelRoomPage />);
        fireEvent.click(screen.getByTestId('delete-tmp-1'));

        expect(mockDeleteMessage).toHaveBeenCalledWith('cloud-b', 'tmp-1');
    });
});

describe("ChannelRoomPage — recognising me by the room's cloud", () => {
    it("registers the join cursors under the room's cloud with my uid there added to the roster", () => {
        render(<ChannelRoomPage />);

        const [cid, channelId, , allMemberIds] = lastJoinPositionsArgs();
        expect(cid).toBe('cloud-b');
        expect(channelId).toBe('ch1');
        expect(allMemberIds).toEqual(['peer', 'uid-b']);
        expect(allMemberIds).not.toContain('uid-a');
    });

    it("reads me as a member when the roster holds my uid in the room's cloud", () => {
        mockChannel = { id: 'ch1', cid: 'cloud-b', stereo: 'group', memberIds: ['peer', 'uid-b'] };

        render(<ChannelRoomPage />);

        const isMember = lastJoinPositionsArgs()[5];
        expect(isMember).toBe(true);
    });

    it("does not read me as a member on the strength of another cloud's uid", () => {
        mockChannel = { id: 'ch1', cid: 'cloud-b', stereo: 'group', memberIds: ['peer', 'uid-a'] };

        render(<ChannelRoomPage />);

        const isMember = lastJoinPositionsArgs()[5];
        expect(isMember).toBe(false);
    });
});

describe('ChannelRoomPage — staying in my own room during a switch', () => {
    it("does not bounce me out of my self-chat in the room's cloud while the session is still another cloud's", () => {
        mockChannel = { id: 'ch1', cid: 'cloud-b', stereo: 'self', ownerId: 'uid-b', memberIds: ['uid-b'] };

        render(<ChannelRoomPage />);

        expect(toast).not.toHaveBeenCalledWith({ title: 'chat.notAMember' });
    });

    it('still leaves a self-chat that belongs to somebody else in that cloud', () => {
        mockChannel = { id: 'ch1', cid: 'cloud-b', stereo: 'self', ownerId: 'someone', memberIds: ['someone'] };

        render(<ChannelRoomPage />);

        expect(toast).toHaveBeenCalledWith({ title: 'chat.notAMember' });
    });
});

describe('ChannelRoomPage — photos', () => {
    const failedImageRow = () =>
        failedRow({ content: '', upload$$: [{ localStatus: 'failed', localThumbUrl: 'blob:1' }] } as never);

    beforeEach(() => {
        mockSendImagesInputs.length = 0;
        mockImageRetry.mockReset();
        mockImageCanRetry = true;
    });

    it("sends photos to the room's own cloud, like a text", () => {
        render(<ChannelRoomPage />);

        expect(mockSendImagesInputs.at(-1)).toEqual({ cid: 'cloud-b', channelId: 'ch1' });
    });

    // The text retry resends `content`, which an image row does not have — it would post a blank message.
    it('retries a failed image row through the image send, not the text path', () => {
        mockMessages = [failedImageRow()];

        render(<ChannelRoomPage />);
        fireEvent.click(screen.getByTestId('retry-tmp-1'));

        expect(mockImageRetry).toHaveBeenCalledWith('tmp-1');
        expect(mockRetryMessage).not.toHaveBeenCalled();
    });

    it('says to delete an image row whose files a reload took away', () => {
        mockImageCanRetry = false;
        mockMessages = [failedImageRow()];

        render(<ChannelRoomPage />);
        fireEvent.click(screen.getByTestId('retry-tmp-1'));

        expect(mockImageRetry).not.toHaveBeenCalled();
        expect(toast).toHaveBeenCalledWith({ title: 'chat.attach.cannotRetry' });
    });
});
