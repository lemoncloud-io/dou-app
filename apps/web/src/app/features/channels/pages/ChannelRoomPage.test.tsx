import '@testing-library/jest-dom';

import { act, fireEvent, render, screen } from '@testing-library/react';

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
    // The field and the send button, and what the room tells the button: enough to drive the send.
    MessageInput: ({ onSend, value, onChange, inputRef, sendReady }: any) => (
        <>
            <textarea
                data-testid="composer-input"
                ref={inputRef}
                value={value}
                onChange={e => onChange(e.target.value)}
            />
            <button data-testid="send" data-send-ready={String(!!sendReady)} onClick={() => onSend('hello')} />
        </>
    ),
}));
jest.mock('../../../bridge', () => ({ appBridge: {} }));
jest.mock('../../../runtime/logging/pushEntryRegistry', () => ({ pushEntryRegistry: { consume: () => null } }));
jest.mock('../../../hooks/useMenuNavigate', () => ({ useMenuNavigate: () => jest.fn() }));
const mockFollowFooter = jest.fn();
jest.mock('../../../ui/hooks/useChromeInsets', () => ({
    useChromeInsets: () => ({
        headerRef: { current: null },
        footerRef: { current: null },
        headerHeight: 0,
        footerHeight: 0,
        followFooter: mockFollowFooter,
    }),
}));
jest.mock('../stores/useRecentEmojiStore', () => ({ useRecentEmojiStore: () => jest.fn() }));
jest.mock('../components/ChannelMessageRow', () => ({
    ChannelMessageRow: ({ message, onRetry, onDelete, onLongPress }: any) => (
        <div>
            <button data-testid={`retry-${message.id}`} onClick={onRetry} />
            <button data-testid={`delete-${message.id}`} onClick={onDelete} />
            <button data-testid={`press-${message.id}`} onClick={onLongPress} />
        </div>
    ),
}));
jest.mock('../components/ConfirmDialog', () => ({ ConfirmDialog: () => null }));
jest.mock('../components/DmInviteFooter', () => ({ DmInviteFooter: () => null }));
jest.mock('../components/EmojiPickerSheet', () => ({ EmojiPickerSheet: () => null }));
jest.mock('../components/MessageDetailDialog', () => ({ MessageDetailDialog: () => null }));
// Surfaces only whether the sheet opened and whether it was told the message has text.
jest.mock('../components/MessageActionSheet', () => ({
    MessageActionSheet: ({ open, hasText }: any) =>
        open ? <div data-testid="action-sheet" data-has-text={String(hasText)} /> : null,
}));
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
// The attach panel as the room sees it: whether its pick is ready to send, whether the panel is open,
// the row of picked photos it hands the composer, and what the room calls.
let mockAttachReady = false;
let mockPanelOpen = false;
let mockAttachStrip = false;
const mockSendPicked = jest.fn();
const mockClosePanel = jest.fn();
interface MockAttachInput {
    onUnsentText?: (text: string) => void;
    composerRef?: { current: HTMLElement | null };
    onComposerSlide?: (sliding: boolean) => void;
}
let mockAttachInput: MockAttachInput = {};
jest.mock('../components/ChatImageAttach', () => ({
    useChatImageAttach: (input: MockAttachInput) => {
        mockAttachInput = input;
        return {
            button: null,
            strip: mockAttachStrip ? <div data-testid="attach-strip" /> : null,
            overlays: null,
            panelOpen: mockPanelOpen,
            sendReady: mockAttachReady,
            sendPicked: mockSendPicked,
            closePanel: mockClosePanel,
        };
    },
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

import { COMPOSER_PADDING_BOTTOM } from '../hooks/useAttachPanelSlot';
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
        mockAttachReady = false;
        mockPanelOpen = false;
        mockAttachStrip = false;
        mockFollowFooter.mockReset();
        mockSendPicked.mockReset().mockReturnValue(true);
        mockClosePanel.mockReset();
    });

    const field = () => screen.getByTestId('composer-input') as HTMLTextAreaElement;

    it('sends the photos picked in the panel with the text as their caption, and clears the field', () => {
        mockAttachReady = true;
        mockPanelOpen = true;
        render(<ChannelRoomPage />);
        fireEvent.change(field(), { target: { value: 'hello' } });

        expect(screen.getByTestId('send')).toHaveAttribute('data-send-ready', 'true');
        fireEvent.click(screen.getByTestId('send'));

        expect(mockSendPicked).toHaveBeenCalledWith('hello');
        expect(mockSendMessage).not.toHaveBeenCalled();
        expect(field().value).toBe('');
    });

    // Typing closed the panel for the keyboard; the photos wait above the field, and still take the press.
    it('sends the photos waiting above the field, the panel closed, with the text as their caption', () => {
        mockAttachReady = true;
        mockAttachStrip = true;
        render(<ChannelRoomPage />);
        fireEvent.change(field(), { target: { value: 'hello' } });

        expect(screen.getByTestId('send')).toHaveAttribute('data-send-ready', 'true');
        fireEvent.click(screen.getByTestId('send'));

        expect(mockSendPicked).toHaveBeenCalledWith('hello');
        expect(mockSendMessage).not.toHaveBeenCalled();
        expect(field().value).toBe('');
    });

    it('puts the waiting photos inside the composer bar, directly above the field', () => {
        mockAttachStrip = true;
        render(<ChannelRoomPage />);

        const strip = screen.getByTestId('attach-strip');
        // Inside the bar, so its measured height — what the list clears — carries the row.
        expect(strip.parentElement).toBe(field().parentElement);
        expect(strip.compareDocumentPosition(field()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('sends the text as a message of its own while nothing is picked', () => {
        render(<ChannelRoomPage />);

        expect(screen.getByTestId('send')).toHaveAttribute('data-send-ready', 'false');
        fireEvent.click(screen.getByTestId('send'));

        expect(mockSendPicked).not.toHaveBeenCalled();
        expect(mockSendMessage).toHaveBeenCalledWith('cloud-b', { channelId: 'ch1', content: 'hello' });
    });

    it('sends the text as usual when the panel turns out to have nothing to send', () => {
        mockAttachReady = true;
        mockSendPicked.mockReturnValue(false);
        render(<ChannelRoomPage />);

        fireEvent.click(screen.getByTestId('send'));

        expect(mockSendMessage).toHaveBeenCalledWith('cloud-b', { channelId: 'ch1', content: 'hello' });
    });

    it('closes the attach panel when the field takes focus, for the keyboard', () => {
        render(<ChannelRoomPage />);

        act(() => field().focus());

        expect(mockClosePanel).toHaveBeenCalledTimes(1);
    });

    it('keeps the composer above the attach panel, as it does above the keyboard, and hands the panel its bar', () => {
        render(<ChannelRoomPage />);

        const composer = field().parentElement as HTMLElement;
        // The panel's share of the padding is written on the bar by the panel's slot, never rendered.
        expect(composer.style.paddingBottom).toBe(COMPOSER_PADDING_BOTTOM);
        expect(mockAttachInput.composerRef?.current).toBe(composer);
        // No transition: the keyboard moves it at once, and the panel's slide frame by frame.
        expect(composer.className).not.toMatch(/transition/);
    });

    it('keeps the list clear of the composer through the attach panel’s slide without rendering each frame', () => {
        render(<ChannelRoomPage />);
        const list = document.querySelector('.flex-col-reverse') as HTMLElement;

        act(() => mockAttachInput.onComposerSlide?.(true));

        // Each frame's composer height goes straight to the list's padding, the room's 16px above it.
        const follow = mockFollowFooter.mock.calls.at(-1)?.[0] as (height: number) => void;
        follow(402);
        expect(list.style.paddingBottom).toBe('418px');
        follow(260.5);
        expect(list.style.paddingBottom).toBe('276.5px');

        act(() => mockAttachInput.onComposerSlide?.(false));

        expect(mockFollowFooter).toHaveBeenLastCalledWith(null);
    });

    it('puts a caption whose photos could not go back in an empty field, and leaves new text alone', () => {
        render(<ChannelRoomPage />);

        act(() => mockAttachInput.onUnsentText?.('caption'));
        expect(field().value).toBe('caption');

        fireEvent.change(field(), { target: { value: 'newer' } });
        act(() => mockAttachInput.onUnsentText?.('caption'));
        expect(field().value).toBe('newer');
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

    // A photo is a message like a line of text: holding it offers reactions and a thread.
    it('opens the action sheet on a sent image-only message, telling it there is no text', () => {
        mockMessages = [
            failedRow({ id: 'ch1:9', chatNo: 9, isFailed: false, content: '', upload$$: [{ id: 'u1' }] } as never),
        ];

        render(<ChannelRoomPage />);
        fireEvent.click(screen.getByTestId('press-ch1:9'));

        expect(screen.getByTestId('action-sheet')).toHaveAttribute('data-has-text', 'false');
    });

    it('keeps the sheet shut on an image-only row that never landed', () => {
        mockMessages = [failedImageRow()];

        render(<ChannelRoomPage />);
        fireEvent.click(screen.getByTestId('press-tmp-1'));

        expect(screen.queryByTestId('action-sheet')).not.toBeInTheDocument();
    });
});
