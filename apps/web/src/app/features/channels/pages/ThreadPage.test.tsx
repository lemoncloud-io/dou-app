import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import type { DomainChat } from '../types';

let mockLocationState: unknown = null;
let mockChats: DomainChat[] = [];
let mockIsLoading = false;
let mockChannel: Record<string, unknown> | null = { id: 'ch1', stereo: 'group' };

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
    useSessionIdentity: () => ({ userId: 'me' }),
}));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast: jest.fn() }));

jest.mock('@chatic/web-ui-kit', () => ({
    ChatRoomHeader: ({ title, kind }: any) => (
        <div data-testid="header" data-kind={kind}>
            {title}
        </div>
    ),
    MessageInput: () => <div data-testid="composer" />,
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
    // 방과 스레드는 같은 채널의 두 화면이라 같은 단일 join 관측을 쓴다.
    useChannelJoins: () => ({ joins: [], myJoin: null, activeMemberIds: [], cursorByUser: new Map() }),
    useChannelMembers: () => ({ members: [] }),
    useChannelProfiles: () => ({ profileMap: new Map() }),
    useChannelTitle: () => '개발 모임방',
    useChatMutations: () => ({ sendMessage: jest.fn(), readMessage: jest.fn() }),
    useChats: () => ({
        rawChats: mockChats,
        isLoading: mockIsLoading,
        hasMore: false,
        isLoadingMore: false,
        loadMore: jest.fn(),
    }),
    useDmPeer: () => null,
    useReactions: () => ({ toggleReaction: jest.fn(), failedId: null }),
}));

import { ThreadPage } from './ThreadPage';

const chat = (over: Partial<DomainChat> = {}): DomainChat =>
    ({ id: 'ch1:7', chatNo: 7, content: '루트 메시지', ownerId: 'u1', createdAtMs: 1, ...over }) as DomainChat;

// jsdom은 Element.scrollTo를 구현하지 않는다. 스레드는 새 답글이 오면 바닥으로 붙으므로
// 이 스텁이 없으면 모든 렌더가 그 이펙트에서 던진다.
beforeAll(() => {
    Element.prototype.scrollTo = jest.fn();
});

beforeEach(() => {
    mockLocationState = null;
    mockChats = [];
    mockIsLoading = false;
    mockChannel = { id: 'ch1', stereo: 'group' };
});

describe('ThreadPage — 진입 시 첫 화면', () => {
    // 캐시의 첫 방출은 캐시가 더워도 비동기라, 방이 건네준 루트가 없으면 스레드는 한 박자
    // 빈 스피너로 열린다. 그 사이 유리 헤더 뒤에는 흐릴 것이 없다.
    it('방이 건네준 루트를 스피너 없이 즉시 그린다', () => {
        mockIsLoading = true;
        mockLocationState = { rootChat: chat() };

        render(<ThreadPage />);

        expect(screen.getByTestId('row-ch1:7')).toHaveTextContent('루트 메시지');
        expect(screen.queryByTestId('thread-loading')).not.toBeInTheDocument();
    });

    it('건네받은 것이 없고 로딩 중이면 스피너가 정직하다', () => {
        mockIsLoading = true;

        render(<ThreadPage />);

        expect(screen.getByTestId('thread-loading')).toBeInTheDocument();
        expect(screen.queryByTestId('row-ch1:7')).not.toBeInTheDocument();
    });

    // 씨앗은 이동 시점의 스냅샷이라 이후 편집·tombstone을 모른다. 캐시가 그 행을 갖게 되면
    // 캐시가 이긴다.
    it('캐시가 루트를 갖게 되면 씨앗 대신 캐시를 쓴다', () => {
        mockLocationState = { rootChat: chat({ content: '옛 스냅샷' }) };
        mockChats = [chat({ content: '캐시 최신본' })];

        render(<ThreadPage />);

        expect(screen.getByTestId('row-ch1:7')).toHaveTextContent('캐시 최신본');
    });

    it('답글은 캐시에서 채워진다', () => {
        mockChats = [chat(), chat({ id: 'ch1:8', chatNo: 8, content: '답글', parentId: '7' })];

        render(<ThreadPage />);

        expect(screen.getByTestId('row-ch1:8')).toHaveTextContent('답글');
    });
});

describe('ThreadPage — 헤더는 채널방과 같은 정체성', () => {
    it('채널 제목을 쓰고 "스레드"라고 적지 않는다', () => {
        mockLocationState = { rootChat: chat() };

        render(<ThreadPage />);

        expect(screen.getByTestId('header')).toHaveTextContent('개발 모임방');
    });

    it.each([
        ['group', { id: 'ch1', stereo: 'group' }, 'group'],
        ['dm', { id: 'ch1', stereo: 'dm' }, 'direct'],
        ['self', { id: 'ch1', stereo: 'self', isSelfChat: true }, 'self'],
    ])('%s 채널은 그 종류의 글리프로 연다 (하드코딩된 group이 아니라)', (_label, channel, expected) => {
        mockChannel = channel as Record<string, unknown>;
        mockLocationState = { rootChat: chat() };

        render(<ThreadPage />);

        expect(screen.getByTestId('header')).toHaveAttribute('data-kind', expected);
    });
});

describe('ThreadPage — 긴 메시지 전체보기', () => {
    // 스레드도 방과 같은 규칙으로 긴 본문을 자른다. 예전에는 자른 자리에 버튼만 있고
    // 뒤에 아무것도 없어서 눌러도 반응이 없었다.
    it('답글의 전체보기를 누르면 전문 다이얼로그가 열린다', () => {
        mockChats = [chat(), chat({ id: 'ch1:8', chatNo: 8, content: '아주 긴 답글 본문', parentId: '7' })];

        render(<ThreadPage />);
        fireEvent.click(screen.getByTestId('expand-ch1:8'));

        expect(screen.getByText('chat.room.messageDetail')).toBeInTheDocument();
        expect(screen.getAllByText('아주 긴 답글 본문').length).toBeGreaterThan(1);
    });
});
