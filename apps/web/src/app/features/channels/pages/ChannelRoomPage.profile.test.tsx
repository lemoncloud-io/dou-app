import '@testing-library/jest-dom';

import { act, fireEvent, render, screen } from '@testing-library/react';

import type { ClientChatView, DomainChannel } from '../types';

// Opening a person from the room: a sender's avatar or name, a 1:1's header, and a group's
// participant stack. Every hook is mocked, as in ChannelRoomPage.test.tsx, so these cases pin what
// the page hands the header, the rows and the profile dialog — not the hooks behind them.

// Loose on purpose: the page reads `isSelfChat`, which the cache view type does not declare.
let mockChannel: (Partial<DomainChannel> & { isSelfChat?: boolean }) | null = null;
let mockMessages: Partial<ClientChatView>[] = [];
let mockDmPeer: { id: string; profileNick?: string; thumbnail?: string } | null = null;
let mockProfileMap = new Map<string, { nick?: string; thumbnail?: string }>();
const mockNavigate = jest.fn();
let mockHeaderProps: Record<string, any> = {};
let mockDialogProps: Record<string, any> = {};

jest.mock('react-router-dom', () => ({
    useParams: () => ({ channelId: 'ch1' }),
    useSearchParams: () => [new URLSearchParams(), jest.fn()],
    useLocation: () => ({ state: null }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/bridges', () => ({ logger: { error: jest.fn(), info: jest.fn() }, isNative: () => false }));
jest.mock('@chatic/shared', () => ({
    ...jest.requireActual('@chatic/shared'),
    useNavigateWithTransition: () => mockNavigate,
}));
jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useSessionIdentity: () => ({ userId: 'me' }),
            useUidInCloud: () => 'me',
            useRuntimeProfile: () => ({ isGuest: false, isCloudActive: true }),
            useSessionSelection: () => ({ selectedCloudId: 'cloud-a', selectedSiteId: 'S:active' }),
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
    // Records what the page hands the header — the click hooks are what these cases are about.
    ChatRoomHeader: (props: any) => {
        mockHeaderProps = props;
        return null;
    },
    DateDivider: () => null,
    DefaultAvatar: () => null,
    FloatingDateChip: () => null,
    ImageAvatar: () => null,
    SystemNotice: () => null,
    MessageInput: () => null,
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
        followFooter: jest.fn(),
    }),
}));
jest.mock('../stores/useRecentEmojiStore', () => ({ useRecentEmojiStore: () => jest.fn() }));
// The row stand-in hands the page a sender the way the real row does — what it drew.
jest.mock('../components/ChannelMessageRow', () => ({
    ChannelMessageRow: ({ message, onOpenProfile, ownerDisplayName, ownerAvatar }: any) => (
        <button
            data-testid={`sender-${message.id}`}
            onClick={() => onOpenProfile?.({ id: message.ownerId, name: ownerDisplayName, avatar: ownerAvatar })}
        />
    ),
}));
jest.mock('../components/MemberProfileDialog', () => ({
    MemberProfileDialog: (props: any) => {
        mockDialogProps = props;
        return props.open ? <div data-testid="profile-dialog" /> : null;
    },
}));
jest.mock('../components/ConfirmDialog', () => ({ ConfirmDialog: () => null }));
jest.mock('../hooks/useStackIn', () => ({ useStackIn: () => undefined }));
jest.mock('../components/DmInviteFooter', () => ({ DmInviteFooter: () => null }));
jest.mock('../components/EmojiPickerSheet', () => ({ EmojiPickerSheet: () => null }));
jest.mock('../components/MessageDetailDialog', () => ({ MessageDetailDialog: () => null }));
jest.mock('../components/MessageActionSheet', () => ({ MessageActionSheet: () => null }));
jest.mock('../components/ReactionDetailSheet', () => ({ ReactionDetailSheet: () => null }));
jest.mock('../components/RoomIntro', () => ({ RoomIntro: () => null }));
jest.mock('../components/RoomSkeleton', () => ({ RoomSkeleton: () => null }));
jest.mock('../hooks/useSendImages', () => ({
    useSendImages: () => ({ sendImages: jest.fn(), retry: jest.fn(), canRetry: () => true, discard: jest.fn() }),
}));
jest.mock('../components/ChatImageAttach', () => ({
    useChatImageAttach: () => ({
        button: null,
        strip: null,
        overlays: null,
        panelOpen: false,
        sendReady: false,
        sendPicked: jest.fn(),
        closePanel: jest.fn(),
    }),
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
    useChannelProfiles: () => ({ profileMap: mockProfileMap }),
    useChannelTitle: () => 'room',
    useChatMutations: () => ({
        sendMessage: jest.fn(),
        retryMessage: jest.fn(),
        readMessage: jest.fn(),
        deleteMessage: jest.fn(),
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
        hasMore: false,
        loadMore: jest.fn(),
        loadUntil: jest.fn(),
    }),
    useChatScroll: () => ({ containerRef: { current: null }, handleScroll: jest.fn() }),
    useDmInviteState: () => ({ state: { kind: 'present' }, countdown: null, resolveReinvitePrefill: jest.fn() }),
    useDmPeer: () => mockDmPeer,
    useJoinPositions: () => ({ getReadCount: () => ({ readCount: 0, unreadCount: 0 }), isReady: false }),
    useMessageJump: () => undefined,
    useReactions: () => ({ toggleReaction: jest.fn(), failedId: null }),
    useReadMarker: () => ({ markSent: jest.fn() }),
}));

import { ChannelRoomPage } from './ChannelRoomPage';

const row = (over: Partial<ClientChatView>): Partial<ClientChatView> => ({
    id: 'm1',
    channelId: 'ch1',
    chatNo: 1,
    content: 'hi',
    isOwner: false,
    isSystem: false,
    ownerId: 'peer',
    ownerName: 'peer name',
    timestamp: new Date(1),
    ...over,
});

beforeEach(() => {
    mockChannel = {
        id: 'ch1',
        cid: 'cloud-a',
        stereo: 'private',
        ownerId: 'owner',
        memberIds: ['me', 'peer', 'owner'],
    };
    mockMessages = [];
    mockDmPeer = null;
    mockProfileMap = new Map();
    mockNavigate.mockReset();
    mockHeaderProps = {};
    mockDialogProps = {};
});

describe('ChannelRoomPage — opening a sender from their message', () => {
    it('opens the profile with exactly what the row drew, view and report only', () => {
        mockProfileMap = new Map([['peer', { nick: 'place nick', thumbnail: 'https://x/peer.png' }]]);
        mockMessages = [row({})];

        render(<ChannelRoomPage />);
        fireEvent.click(screen.getByTestId('sender-m1'));

        expect(screen.getByTestId('profile-dialog')).toBeInTheDocument();
        expect(mockDialogProps.member).toEqual({ id: 'peer', name: 'place nick', avatar: 'https://x/peer.png' });
        expect(mockDialogProps.canKick).toBe(false);
        expect(mockDialogProps.memberIsOwner).toBe(false);
    });

    it("badges the room's owner", () => {
        mockMessages = [row({ ownerId: 'owner' })];

        render(<ChannelRoomPage />);
        fireEvent.click(screen.getByTestId('sender-m1'));

        expect(mockDialogProps.memberIsOwner).toBe(true);
    });

    // My own profile carries "profile settings", whose editor this room does not mount.
    it('never opens my own profile', () => {
        mockMessages = [row({ ownerId: 'me' })];

        render(<ChannelRoomPage />);
        fireEvent.click(screen.getByTestId('sender-m1'));

        expect(screen.queryByTestId('profile-dialog')).not.toBeInTheDocument();
    });

    it('closes when the dialog asks to', () => {
        mockMessages = [row({})];

        render(<ChannelRoomPage />);
        fireEvent.click(screen.getByTestId('sender-m1'));
        act(() => mockDialogProps.onOpenChange(false));

        expect(screen.queryByTestId('profile-dialog')).not.toBeInTheDocument();
        // Still naming them while it slides away, rather than blanking mid-animation.
        expect(mockDialogProps.member).toEqual({ id: 'peer', name: 'peer name', avatar: undefined });
    });
});

describe('ChannelRoomPage — the header', () => {
    it("opens a 1:1 peer's profile from the avatar and title", () => {
        mockChannel = { id: 'ch1', cid: 'cloud-a', stereo: 'dm', ownerId: 'me', memberIds: ['me', 'peer'] };
        mockDmPeer = { id: 'peer', profileNick: 'place nick', thumbnail: 'https://x/peer.png' };
        mockProfileMap = new Map([['peer', { nick: 'place nick', thumbnail: 'https://x/peer.png' }]]);

        render(<ChannelRoomPage />);
        expect(mockHeaderProps.identityLabel).toBe('chat.room.openProfile');
        expect(mockHeaderProps.onMetaClick).toBeUndefined();
        act(() => mockHeaderProps.onIdentityClick());

        expect(screen.getByTestId('profile-dialog')).toBeInTheDocument();
        expect(mockDialogProps.member).toEqual({ id: 'peer', name: 'place nick', avatar: 'https://x/peer.png' });
        expect(mockDialogProps.canKick).toBe(false);
    });

    it('leaves a 1:1 header inert until the peer is known', () => {
        mockChannel = { id: 'ch1', cid: 'cloud-a', stereo: 'dm', ownerId: 'me', memberIds: ['me'] };

        render(<ChannelRoomPage />);

        expect(mockHeaderProps.onIdentityClick).toBeUndefined();
    });

    it("opens settings from a group's participant stack, as the ⋯ menu does", () => {
        render(<ChannelRoomPage />);
        expect(mockHeaderProps.onIdentityClick).toBeUndefined();
        expect(mockHeaderProps.metaLabel).toBe('chat.room.openMembers');
        mockHeaderProps.onMetaClick();

        expect(mockNavigate).toHaveBeenCalledWith('/channels/ch1/settings', { state: { roomDistance: 1 } });
    });

    it('adds nothing to a self chat header', () => {
        mockChannel = { id: 'ch1', cid: 'cloud-a', stereo: 'self', isSelfChat: true, ownerId: 'me', memberIds: ['me'] };

        render(<ChannelRoomPage />);

        expect(mockHeaderProps.onIdentityClick).toBeUndefined();
        expect(mockHeaderProps.onMetaClick).toBeUndefined();
    });
});
