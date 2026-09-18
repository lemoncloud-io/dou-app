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
// The real `useRuntimeRepositories` returns DataManager's same object every time. If the mock
// returned a new object on every render, the user-cache effect's dependency would keep changing
// and cause an infinite render loop — pin it to a stable reference.
const repositories = { user: { cacheRead } };
jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: () => repositories,
        },
    },
}));
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

    // Same chain as the settings screen's member row: profile nick → user record name → userId.
    // The user record is a one-shot cacheRead per candidate, so it lands a tick later.
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

    // A nick that's only whitespace is as good as an empty name, so it must fall through to the next step.
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

    // The path for reaching someone whose nick you don't know — same as what desktop leaves in place of manual id entry.
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

    // The server can block this as owner-only (ADR-0075, unresolved) — that rejection must be shown to the user.
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

    // Still loading and genuinely empty are different things — showing "none" while loading would be a lie.
    it('로딩 중에는 후보 없음 안내를 띄우지 않는다', () => {
        mockCandidateIds = [];
        mockIsLoading = true;
        setup();

        expect(screen.queryByText('inviteFriends.noPlaceCandidates')).not.toBeInTheDocument();
    });
});

describe('PlaceInviteTab — 로딩 중', () => {
    // While candidates are still being read, the list is empty — rendering "no search results" at
    // that point would be a lie to a user who hasn't even searched yet.
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
