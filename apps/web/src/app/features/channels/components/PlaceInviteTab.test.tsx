import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { DomainProfile } from '@chatic/data';

const navigate = jest.fn();
const toast = jest.fn();
const inviteChannel = jest.fn();
const cacheRead = jest.fn();

let mockCandidateIds: string[] = [];
let mockIsLoading = false;
let mockProfiles: Array<[string, Partial<DomainProfile>]> = [];
let mockUsers: Array<{ id: string; name?: string }> = [];

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, o?: any) => (o && 'count' in o ? `${k}:${o.count}` : k) }),
}));
jest.mock('@chatic/bridges', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigate }));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
// 실제 `useRuntimeRepositories`는 DataManager의 같은 객체를 돌려준다. 목이 매 렌더 새 객체를
// 만들면 유저 캐시 effect의 의존성이 계속 바뀌어 무한 렌더가 된다 — 안정적인 참조로 고정한다.
const repositories = { user: { cacheRead } };
jest.mock('@chatic/app-runtime', () => ({ useRuntimeRepositories: () => repositories }));
jest.mock('../hooks', () => ({
    LIST_PROFILE_SYNC_INTERVAL_MS: 60_000,
    useChannelMutations: () => ({ inviteChannel }),
    useInviteCandidates: () => ({ candidateIds: mockCandidateIds, isLoading: mockIsLoading }),
    useChannelProfiles: () => ({ profileMap: new Map(mockProfiles) }),
}));
jest.mock('@chatic/web-ui-kit', () => ({
    SearchInput: ({ value, onChange }: any) => (
        <input aria-label="search" value={value} onChange={e => onChange(e.target.value)} />
    ),
    SelectableUserItem: ({ name, avatarSrc, checked, onToggle, disabled }: any) => (
        <button
            data-testid={`cand-${name}`}
            data-avatar={avatarSrc ?? ''}
            disabled={disabled}
            onClick={() => onToggle?.(!checked)}
        >
            {name}
        </button>
    ),
    SelectedAvatarRow: ({ items }: any) => <div data-testid="selected-row">{items.length}</div>,
    FloatingButton: ({ label, onClick, loading, disabled }: any) => (
        <button data-testid="cta" disabled={disabled || loading} onClick={onClick}>
            {label}
        </button>
    ),
}));

import { PlaceInviteTab } from './PlaceInviteTab';

const setup = () => render(<PlaceInviteTab channelId="ch1" sid="site-1" maxSelection={100} />);

beforeEach(() => {
    jest.clearAllMocks();
    mockCandidateIds = ['u1', 'u2'];
    mockIsLoading = false;
    mockProfiles = [['u1', { nick: '아리' }]];
    mockUsers = [{ id: 'u2', name: '***5678' }];
    inviteChannel.mockResolvedValue({});
    cacheRead.mockImplementation((id: string) => Promise.resolve(mockUsers.find(user => user.id === id) ?? null));
});

describe('PlaceInviteTab — 표시', () => {
    it('플레이스 프로필 닉으로 그린다', () => {
        setup();

        expect(screen.getByTestId('cand-아리')).toBeInTheDocument();
    });

    // 설정 화면 멤버 행과 같은 체인: 프로필 닉 → 유저 레코드 name → userId.
    // 유저 레코드는 후보별 cacheRead 원샷이라 한 틱 뒤에 붙는다.
    it('프로필이 없으면 유저 레코드 name으로 떨어진다', async () => {
        setup();

        expect(await screen.findByTestId('cand-***5678')).toBeInTheDocument();
    });

    it('둘 다 없으면 userId를 그대로 쓴다', () => {
        mockProfiles = [];
        mockUsers = [];
        setup();

        expect(screen.getByTestId('cand-u1')).toBeInTheDocument();
        expect(screen.getByTestId('cand-u2')).toBeInTheDocument();
    });

    it('프로필 사진을 아바타로 넘긴다', () => {
        mockProfiles = [['u1', { nick: '아리', thumbnail: 'data:image/png;base64,AAA' }]];
        setup();

        expect(screen.getByTestId('cand-아리')).toHaveAttribute('data-avatar', 'data:image/png;base64,AAA');
    });

    // 공백만 든 닉은 빈 이름이나 마찬가지라 다음 단계로 내려가야 한다.
    it('닉이 공백뿐이면 다음 폴백으로 내려간다', async () => {
        mockProfiles = [['u2', { nick: '   ' }]];
        setup();

        expect(await screen.findByTestId('cand-***5678')).toBeInTheDocument();
    });
});

describe('PlaceInviteTab — 선택과 검색', () => {
    it('고르면 선택 행에 쌓이고 완료가 켜진다', () => {
        setup();
        expect(screen.getByTestId('cta')).toBeDisabled();

        fireEvent.click(screen.getByTestId('cand-아리'));

        expect(screen.getByTestId('selected-row')).toHaveTextContent('1');
        expect(screen.getByTestId('cta')).toBeEnabled();
    });

    it('상한을 넘기면 토스트만 띄우고 선택하지 않는다', async () => {
        render(<PlaceInviteTab channelId="ch1" sid="site-1" maxSelection={1} />);
        fireEvent.click(screen.getByTestId('cand-아리'));
        fireEvent.click(await screen.findByTestId('cand-***5678'));

        expect(screen.getByTestId('selected-row')).toHaveTextContent('1');
        expect(toast).toHaveBeenCalled();
    });

    it('검색은 닉으로 필터한다', async () => {
        setup();
        await screen.findByTestId('cand-***5678');

        fireEvent.change(screen.getByLabelText('search'), { target: { value: '아리' } });

        expect(screen.getByTestId('cand-아리')).toBeInTheDocument();
        expect(screen.queryByTestId('cand-***5678')).not.toBeInTheDocument();
    });

    // 닉을 모르는 상대에게 닿는 경로 — 데스크톱이 수동 id 입력 대신 남겨둔 것과 같다.
    it('검색은 userId로도 필터한다', async () => {
        setup();
        await screen.findByTestId('cand-***5678');

        fireEvent.change(screen.getByLabelText('search'), { target: { value: 'u2' } });

        expect(screen.getByTestId('cand-***5678')).toBeInTheDocument();
        expect(screen.queryByTestId('cand-아리')).not.toBeInTheDocument();
    });

    it('고른 사람은 검색어와 무관하게 위에 남는다', () => {
        setup();
        fireEvent.click(screen.getByTestId('cand-아리'));

        fireEvent.change(screen.getByLabelText('search'), { target: { value: 'u2' } });

        expect(screen.getByTestId('cand-아리')).toBeInTheDocument();
    });

    it('검색 결과가 없으면 안내를 띄운다', () => {
        setup();

        fireEvent.change(screen.getByLabelText('search'), { target: { value: 'zzz' } });

        expect(screen.getByText('inviteFriends.noSearchResults')).toBeInTheDocument();
    });
});

describe('PlaceInviteTab — 확정', () => {
    it('고른 전원을 한 번의 inviteChannel로 넣는다', async () => {
        setup();
        fireEvent.click(screen.getByTestId('cand-아리'));
        fireEvent.click(await screen.findByTestId('cand-***5678'));
        fireEvent.click(screen.getByTestId('cta'));

        await waitFor(() => expect(inviteChannel).toHaveBeenCalledTimes(1));
        expect(inviteChannel).toHaveBeenCalledWith({ channelId: 'ch1', userIds: ['u1', 'u2'] });
    });

    it('성공하면 토스트를 띄우고 이전 화면으로 돌아간다', async () => {
        setup();
        fireEvent.click(screen.getByTestId('cand-아리'));
        fireEvent.click(screen.getByTestId('cta'));

        await waitFor(() => expect(navigate).toHaveBeenCalledWith(-1));
        expect(toast).toHaveBeenCalledWith({ title: 'inviteFriends.placeSuccess:1' });
    });

    // 서버가 owner-only로 막을 수 있다(ADR-0075 미결) — 그 거부가 사용자에게 보여야 한다.
    it('실패하면 화면을 떠나지 않고 에러 토스트를 띄운다', async () => {
        inviteChannel.mockRejectedValue(new Error('denied'));
        setup();
        fireEvent.click(screen.getByTestId('cand-아리'));
        fireEvent.click(screen.getByTestId('cta'));

        await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: 'denied', variant: 'destructive' }));
        expect(navigate).not.toHaveBeenCalled();
    });
});

describe('PlaceInviteTab — 후보 없음', () => {
    it('후보가 0이면 안내와 연락처 탭 유도를 띄운다', () => {
        mockCandidateIds = [];
        setup();

        expect(screen.getByText('inviteFriends.noPlaceCandidates')).toBeInTheDocument();
        expect(screen.getByText('inviteFriends.noPlaceCandidatesHint')).toBeInTheDocument();
        expect(screen.queryByTestId('cta')).not.toBeInTheDocument();
    });

    // 아직 읽는 중인 것과 진짜 비어 있는 것은 다르다 — 로딩 중에 "없어요"를 띄우면 거짓말이다.
    it('로딩 중에는 후보 없음 안내를 띄우지 않는다', () => {
        mockCandidateIds = [];
        mockIsLoading = true;
        setup();

        expect(screen.queryByText('inviteFriends.noPlaceCandidates')).not.toBeInTheDocument();
    });
});

describe('PlaceInviteTab — 로딩 중', () => {
    // 후보를 아직 읽는 중이면 목록이 비어 있는데, 그때 "검색 결과가 없어요"를 그리면
    // 검색하지도 않은 사용자에게 거짓말이 된다.
    it('로딩 중 빈 목록에 검색 결과 없음 문구를 그리지 않는다', () => {
        mockCandidateIds = [];
        mockIsLoading = true;
        setup();

        expect(screen.queryByText('inviteFriends.noSearchResults')).not.toBeInTheDocument();
    });

    it('검색어가 없으면 결과 없음 문구도 그리지 않는다', () => {
        setup();

        expect(screen.queryByText('inviteFriends.noSearchResults')).not.toBeInTheDocument();
    });
});
