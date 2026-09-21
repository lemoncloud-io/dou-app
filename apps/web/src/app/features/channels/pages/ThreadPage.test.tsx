import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import type { DomainChat } from '../types';

let mockLocationState: unknown = null;
let mockChats: DomainChat[] = [];
let mockIsLoading = false;
let mockChannel: Record<string, unknown> | null = { id: 'ch1', stereo: 'group' };
let mockMyJoin: { joinedNo?: number } | null = null;
let mockChatParams: unknown = null;
let mockHasMore = false;

jest.mock('react-router-dom', () => ({
    useParams: () => ({ channelId: 'ch1', rootNo: '7' }),
    useLocation: () => ({ state: mockLocationState }),
}));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, o?: any) => (o && 'count' in o ? `${k}:${o.count}` : k) }),
}));
jest.mock('@chatic/bridges', () => ({ logger: { error: jest.fn() } }));
// Partial mock: keep the real module for everything else. `@chatic/app-runtime`'s session hooks now
// reach `createQueryKeys` at import time, and a fully-replaced module would drop it.
jest.mock('@chatic/shared', () => ({
    ...jest.requireActual('@chatic/shared'),
    useNavigateWithTransition: () => jest.fn(),
}));
jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useSessionIdentity: () => ({ userId: 'me' }),
        },
    },
}));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast: jest.fn() }));

jest.mock('@chatic/web-ui-kit', () => ({
    ChatRoomHeader: ({ title, kind, hideAvatar }: any) => (
        <div data-testid="header" data-kind={kind} data-hide-avatar={!!hideAvatar}>
            {title}
        </div>
    ),
    MessageInput: ({ placeholder, disabled }: any) => (
        <div data-testid="composer" data-disabled={String(!!disabled)}>
            {placeholder}
        </div>
    ),
    ImageAvatar: ({ src }: any) => <img data-testid="root-avatar" src={src} alt="" />,
    DefaultAvatar: () => <div data-testid="root-default-avatar" />,
}));

jest.mock('../components/ChannelMessageRow', () => ({
    // The real row shows the "전체보기" affordance only on a truncated message; here every row
    // carries it, so a test can drive `onExpand` without composing a 200-character body.
    ChannelMessageRow: ({ message, onExpand }: any) => (
        <div data-testid={`row-${message.id}`}>
            {message.content}
            <button data-testid={`expand-${message.id}`} onClick={onExpand} />
        </div>
    ),
}));
// The root is no longer a message row — it renders as the thread's subject (plain text, no
// bubble), so its body and chips are stubbed separately from the reply rows above.
jest.mock('../components/MessageText', () => ({ MessageText: ({ text }: any) => <>{text}</> }));
jest.mock('../components/ReactionChips', () => ({
    ReactionChips: ({ tallies }: any) => <div data-testid="root-chips">{tallies?.length ?? 0}</div>,
}));
jest.mock('../components/MessageActionSheet', () => ({ MessageActionSheet: () => null }));
jest.mock('../components/ReactionDetailSheet', () => ({ ReactionDetailSheet: () => null }));
jest.mock('../components/EmojiPickerSheet', () => ({ EmojiPickerSheet: () => null }));
jest.mock('../lib', () => ({ resolveChannelAvatar: () => ({ src: undefined }) }));
jest.mock('../stores/useRecentEmojiStore', () => ({ useRecentEmojiStore: () => jest.fn() }));
jest.mock('../../../ui/hooks/useChromeInsets', () => ({
    useChromeInsets: () => ({
        headerRef: { current: null },
        footerRef: { current: null },
        headerHeight: 0,
        footerHeight: 0,
    }),
}));
jest.mock('../hooks', () => ({
    useChannel: () => ({ channel: mockChannel }),
    // The room and the thread are two screens of the same channel, so they share the same single join observation.
    useChannelJoins: () => ({ joins: [], myJoin: mockMyJoin, activeMemberIds: [], cursorByUser: new Map() }),
    useChannelMembers: () => ({ members: [] }),
    useChannelProfiles: () => ({ profileMap: new Map() }),
    useChannelTitle: () => '개발 모임방',
    useChatMutations: () => ({ sendMessage: jest.fn(), readMessage: jest.fn() }),
    useChats: (params: unknown) => {
        mockChatParams = params;
        return {
            rawChats: mockChats,
            isLoading: mockIsLoading,
            hasMore: mockHasMore,
            isLoadingMore: false,
            loadMore: jest.fn(),
        };
    },
    useDmPeer: () => null,
    useReactions: () => ({ toggleReaction: jest.fn(), failedId: null }),
    // This screen's tests do not cover edit and delete. That behaviour's contract is held by
    // useMessageEditing's own tests; here we only check the screen renders without them.
    useMessageEditing: () => ({
        isEditing: false,
        hasUnsavedEdit: false,
        startEdit: jest.fn(),
        requestCloseEdit: jest.fn(),
        closeEdit: jest.fn(),
        editStateFor: () => undefined,
        deleteTarget: null,
        requestDelete: jest.fn(),
        cancelDelete: jest.fn(),
        confirmDelete: jest.fn(),
        isDeleting: false,
        discardOpen: false,
        setDiscardOpen: jest.fn(),
    }),
}));

import { ThreadPage } from './ThreadPage';

const chat = (over: Partial<DomainChat> = {}): DomainChat =>
    ({ id: 'ch1:7', chatNo: 7, content: '루트 메시지', ownerId: 'u1', createdAtMs: 1, ...over }) as DomainChat;

// jsdom doesn't implement Element.scrollTo. The thread pins to the bottom when a new reply
// arrives, so without this stub every render would throw inside that effect.
beforeAll(() => {
    Element.prototype.scrollTo = jest.fn();
});

beforeEach(() => {
    mockLocationState = null;
    mockChats = [];
    mockIsLoading = false;
    mockChannel = { id: 'ch1', stereo: 'group' };
    mockMyJoin = null;
    mockChatParams = null;
    mockHasMore = false;
});

describe('ThreadPage — 진입 시 첫 화면', () => {
    // The cache's first emission is asynchronous even when warm, so without a root handed off by
    // the room, the thread opens with an empty spinner for one beat. There's nothing behind the
    // glass header to blur in that gap.
    it('방이 건네준 루트를 스피너 없이 즉시 그린다', () => {
        mockIsLoading = true;
        mockLocationState = { rootChat: chat() };

        render(<ThreadPage />);

        expect(screen.getByTestId('thread-root')).toHaveTextContent('루트 메시지');
        expect(screen.queryByTestId('thread-loading')).not.toBeInTheDocument();
    });

    it('건네받은 것이 없고 로딩 중이면 스피너가 정직하다', () => {
        mockIsLoading = true;

        render(<ThreadPage />);

        expect(screen.getByTestId('thread-loading')).toBeInTheDocument();
        expect(screen.queryByTestId('thread-root')).not.toBeInTheDocument();
    });

    // The seed is a snapshot taken at navigation time, so it knows nothing about a later edit or
    // tombstone. Once the cache has that row, the cache wins.
    it('캐시가 루트를 갖게 되면 씨앗 대신 캐시를 쓴다', () => {
        mockLocationState = { rootChat: chat({ content: '옛 스냅샷' }) };
        mockChats = [chat({ content: '캐시 최신본' })];

        render(<ThreadPage />);

        expect(screen.getByTestId('thread-root')).toHaveTextContent('캐시 최신본');
    });

    it('답글은 캐시에서 채워진다', () => {
        mockChats = [chat(), chat({ id: 'ch1:8', chatNo: 8, content: '답글', parentId: '7' })];

        render(<ThreadPage />);

        expect(screen.getByTestId('row-ch1:8')).toHaveTextContent('답글');
    });
});

// Figma 4718:22183 — the header names the screen, not the room. A thread is one conversation
// inside a channel, and labeling it with the channel's name and avatar would read as if it
// navigated to the channel.
describe('ThreadPage — 헤더는 방이 아니라 화면을 가리킨다', () => {
    it.each([
        ['group', { id: 'ch1', stereo: 'group' }],
        ['dm', { id: 'ch1', stereo: 'dm' }],
        ['self', { id: 'ch1', stereo: 'self', isSelfChat: true }],
    ])('%s 채널이어도 채널 제목이 아니라 "스레드"라고 적는다', (_label, channel) => {
        mockChannel = channel as Record<string, unknown>;
        mockLocationState = { rootChat: chat() };

        render(<ThreadPage />);

        expect(screen.getByTestId('header')).toHaveTextContent('chat.thread.title');
        expect(screen.getByTestId('header')).not.toHaveTextContent('개발 모임방');
    });

    it('채널 아바타를 달지 않는다', () => {
        mockLocationState = { rootChat: chat() };

        render(<ThreadPage />);

        expect(screen.getByTestId('header')).toHaveAttribute('data-hide-avatar', 'true');
    });
});

describe('ThreadPage — 루트는 메시지가 아니라 스레드의 주제다', () => {
    // As a bubble, the root would sit at the same visual rank as the replies below, and when it's
    // my message it'd get pushed to the right, pinning the thread's subject to one side of the screen.
    it('루트를 말풍선 행이 아닌 평문 블록으로 그린다', () => {
        mockLocationState = { rootChat: chat() };

        render(<ThreadPage />);

        expect(screen.getByTestId('thread-root')).toBeInTheDocument();
        expect(screen.queryByTestId('row-ch1:7')).not.toBeInTheDocument();
    });

    it('답글은 그대로 말풍선 행이다', () => {
        mockChats = [chat(), chat({ id: 'ch1:8', chatNo: 8, content: '답글', parentId: '7' })];

        render(<ThreadPage />);

        expect(screen.getByTestId('row-ch1:8')).toHaveTextContent('답글');
        expect(screen.queryByTestId('row-ch1:7')).not.toBeInTheDocument();
    });

    it('작성기 플레이스홀더는 댓글 추가다', () => {
        mockLocationState = { rootChat: chat() };

        render(<ThreadPage />);

        expect(screen.getByTestId('composer')).toHaveTextContent('chat.thread.inputPlaceholder');
    });
});

describe('ThreadPage — 긴 메시지 전체보기', () => {
    // A thread truncates a long body by the same rule as the room. It used to have only a button
    // at the cut with nothing behind it, so pressing it did nothing.
    it('답글의 전체보기를 누르면 전문 다이얼로그가 열린다', () => {
        mockChats = [chat(), chat({ id: 'ch1:8', chatNo: 8, content: '아주 긴 답글 본문', parentId: '7' })];

        render(<ThreadPage />);
        fireEvent.click(screen.getByTestId('expand-ch1:8'));

        expect(screen.getByText('chat.room.messageDetail')).toBeInTheDocument();
        expect(screen.getAllByText('아주 긴 답글 본문').length).toBeGreaterThan(1);
    });

    // A thread reads the same channel the room does, so it has to ask for the same slice of it.
    // It did not: the room passed `joinedNo` and this screen did not, so history the room had
    // already hidden after a re-join was still reachable by opening a thread on it.
    it('내 참여 구간 커서를 대화 조회에 그대로 넘긴다', () => {
        mockMyJoin = { joinedNo: 42 };

        render(<ThreadPage />);

        expect(mockChatParams).toMatchObject({ channelId: 'ch1', joinedNo: 42 });
    });

    // One tap away: somebody replies, after my re-join, to a message from before it. Their reply
    // is inside my window and carries a thread footer, so the thread opens on a root I will never
    // be served. The generic branch would promise it appears once older history loads, and hand
    // over a button to load it.
    describe('참여 구간 밖의 원본으로 스레드가 열릴 때', () => {
        beforeEach(() => {
            // rootNo is 7 (see the router mock); a cursor above it puts the root out of range.
            mockMyJoin = { joinedNo: 20 };
            mockHasMore = true;
            mockChats = [];
        });

        it('왜 안 보이는지 말하고, 불러올 수 없는 것을 불러오라고 하지 않는다', () => {
            render(<ThreadPage />);

            expect(screen.getByText('chat.thread.rootOutsideJoinWindow')).toBeInTheDocument();
            expect(screen.queryByText('chat.thread.unavailable')).not.toBeInTheDocument();
            expect(screen.queryByText('chat.thread.loadOlder')).not.toBeInTheDocument();
        });

        it('입력창을 닫는다 — 답글은 원본 id가 있어야 보내지므로 조용히 버려질 자리다', () => {
            render(<ThreadPage />);

            expect(screen.getByTestId('composer')).toHaveAttribute('data-disabled', 'true');
        });
    });

    // The cursor is not what is missing here, so the old promise still holds: the row really can
    // arrive, and the button really can fetch it.
    it('원본이 아직 안 온 것뿐이면 기존 안내와 불러오기 버튼을 그대로 둔다', () => {
        mockMyJoin = { joinedNo: 0 };
        mockHasMore = true;
        mockChats = [];

        render(<ThreadPage />);

        expect(screen.getByText('chat.thread.unavailable')).toBeInTheDocument();
        expect(screen.getByText('chat.thread.loadOlder')).toBeInTheDocument();
        expect(screen.getByTestId('composer')).toHaveAttribute('data-disabled', 'false');
    });

    // The full-text dialog renders plain text only. Passing the payload through as-is would open raw JSON.
    it('Block Kit 답글의 전체보기는 평문을 넘긴다', () => {
        mockChats = [
            chat(),
            chat({
                id: 'ch1:9',
                chatNo: 9,
                parentId: '7',
                content: JSON.stringify({
                    blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '*503* upstream timeout' } }],
                }),
            }),
        ];

        render(<ThreadPage />);
        fireEvent.click(screen.getByTestId('expand-ch1:9'));

        // The dialog is what this asserts — the row is a stub here and prints whatever
        // `content` it is handed, so its JSON is the harness, not the app.
        expect(screen.getByText('chat.room.messageDetail')).toBeInTheDocument();
        expect(screen.getByText('503 upstream timeout')).toBeInTheDocument();
    });
});
