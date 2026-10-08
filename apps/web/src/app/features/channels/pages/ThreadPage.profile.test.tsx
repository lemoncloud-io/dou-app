import '@testing-library/jest-dom';

import { act, fireEvent, render, screen } from '@testing-library/react';

import type { DomainChat } from '../types';

// Opening a person from the thread: the subject's author and a reply's sender, on the room's terms
// (view and report, never my own profile). Hooks are mocked as in ThreadPage.test.tsx.

let mockChats: DomainChat[] = [];
let mockDialogProps: Record<string, any> = {};

jest.mock('react-router-dom', () => ({
    useParams: () => ({ channelId: 'ch1', rootNo: '7' }),
    useLocation: () => ({ state: null }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/bridges', () => ({ logger: { error: jest.fn() } }));
jest.mock('@chatic/shared', () => ({
    ...jest.requireActual('@chatic/shared'),
    useNavigateWithTransition: () => jest.fn(),
}));
jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useSessionIdentity: () => ({ userId: 'me' }),
            useUidInCloud: () => 'me',
            useSessionSelection: () => ({ selectedSiteId: 'S:active' }),
        },
    },
}));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast: jest.fn() }));
jest.mock('@chatic/web-ui-kit', () => ({
    ChatRoomHeader: () => null,
    MessageInput: () => null,
    ImageAvatar: () => <img alt="" />,
    DefaultAvatar: () => <div />,
}));
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
jest.mock('../components/MessageText', () => ({ MessageText: ({ text }: any) => <>{text}</> }));
jest.mock('../components/ReactionChips', () => ({ ReactionChips: () => null }));
jest.mock('../components/MessageImages', () => ({ MessageImages: () => null }));
jest.mock('../components/MessageActionSheet', () => ({ MessageActionSheet: () => null }));
jest.mock('../components/ReactionDetailSheet', () => ({ ReactionDetailSheet: () => null }));
jest.mock('../components/EmojiPickerSheet', () => ({ EmojiPickerSheet: () => null }));
jest.mock('../hooks/useSendImages', () => ({
    useSendImages: () => ({ sendImages: jest.fn(), retry: jest.fn(), canRetry: () => false, discard: jest.fn() }),
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
    resolveChannelAvatar: () => ({ src: undefined }),
    profilePlaceOf: jest.requireActual('../lib/channelStereoPolicy').profilePlaceOf,
}));
jest.mock('../stores/useRecentEmojiStore', () => ({ useRecentEmojiStore: () => jest.fn() }));
jest.mock('../../../ui/hooks/useChromeInsets', () => ({
    useChromeInsets: () => ({
        headerRef: { current: null },
        footerRef: { current: null },
        headerHeight: 0,
        footerHeight: 0,
        followFooter: jest.fn(),
    }),
}));
jest.mock('../hooks', () => ({
    useChannel: () => ({ channel: { id: 'ch1', stereo: 'group', ownerId: 'owner' } }),
    useChannelJoins: () => ({ joins: [], myJoin: null, activeMemberIds: [], cursorByUser: new Map() }),
    useChannelMembers: () => ({ members: [] }),
    useChannelProfiles: () => ({
        profileMap: new Map([['owner', { nick: 'owner nick', thumbnail: 'https://x/owner.png' }]]),
    }),
    useChannelTitle: () => 'room',
    useChatMutations: () => ({ sendMessage: jest.fn(), readMessage: jest.fn() }),
    useChats: () => ({
        rawChats: mockChats,
        isLoading: false,
        hasMore: false,
        isLoadingMore: false,
        loadMore: jest.fn(),
        canLoadMore: true,
    }),
    useDmPeer: () => null,
    useReactions: () => ({ toggleReaction: jest.fn(), failedId: null }),
    useMessageEditing: () => ({
        isEditing: false,
        editStateFor: () => undefined,
        deleteTarget: null,
        cancelDelete: jest.fn(),
        confirmDelete: jest.fn(),
        isDeleting: false,
        discardOpen: false,
        setDiscardOpen: jest.fn(),
        closeEdit: jest.fn(),
    }),
}));

import { ThreadPage } from './ThreadPage';

const chat = (over: Partial<DomainChat> = {}): DomainChat =>
    ({ id: 'ch1:7', chatNo: 7, content: 'root', ownerId: 'owner', createdAtMs: 1, ...over }) as DomainChat;

beforeAll(() => {
    Element.prototype.scrollTo = jest.fn();
});

beforeEach(() => {
    mockChats = [];
    mockDialogProps = {};
});

describe('ThreadPage — opening a person', () => {
    it("opens the subject's author with the name and photo the subject shows, badged as owner", () => {
        mockChats = [chat()];

        render(<ThreadPage />);
        fireEvent.click(screen.getByRole('button', { name: 'chat.room.openProfile' }));

        expect(screen.getByTestId('profile-dialog')).toBeInTheDocument();
        expect(mockDialogProps.member).toEqual({ id: 'owner', name: 'owner nick', avatar: 'https://x/owner.png' });
        expect(mockDialogProps.memberIsOwner).toBe(true);
        expect(mockDialogProps.canKick).toBe(false);
    });

    it('leaves my own subject inert', () => {
        mockChats = [chat({ ownerId: 'me' })];

        render(<ThreadPage />);

        expect(screen.queryByRole('button', { name: 'chat.room.openProfile' })).not.toBeInTheDocument();
    });

    it("opens a reply's sender, and closes on request", () => {
        mockChats = [chat({ ownerId: 'me' }), chat({ id: 'ch1:8', chatNo: 8, parentId: '7', ownerId: 'peer' })];

        render(<ThreadPage />);
        fireEvent.click(screen.getByTestId('sender-ch1:8'));

        expect(screen.getByTestId('profile-dialog')).toBeInTheDocument();
        expect(mockDialogProps.member.id).toBe('peer');
        expect(mockDialogProps.memberIsOwner).toBe(false);

        act(() => mockDialogProps.onOpenChange(false));
        expect(screen.queryByTestId('profile-dialog')).not.toBeInTheDocument();
    });

    it('never opens my own profile from a reply', () => {
        mockChats = [chat(), chat({ id: 'ch1:8', chatNo: 8, parentId: '7', ownerId: 'me' })];

        render(<ThreadPage />);
        fireEvent.click(screen.getByTestId('sender-ch1:8'));

        expect(screen.queryByTestId('profile-dialog')).not.toBeInTheDocument();
    });
});
