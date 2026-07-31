import '@testing-library/jest-dom';

import { render, screen } from '@testing-library/react';

import { InviteAcceptPage } from './InviteAcceptPage';

// Mutable per-test fixtures (must be `mock`-prefixed to be usable inside jest.mock factories).
let mockSearch = '';
let mockIsAuthenticated = true;

const mockBackHandler = jest.fn();

jest.mock('react-router-dom', () => ({
    useLocation: () => ({ search: mockSearch }),
    Navigate: ({ to }: { to: string }) => <div>navigated:{to}</div>,
}));
jest.mock('@chatic/web-core', () => ({ useSessionAuth: () => ({ isAuthenticated: mockIsAuthenticated }) }));
jest.mock('../../../hooks/useBackHandler', () => ({ useBackHandler: () => mockBackHandler() }));
// Every branch is stubbed to a sentinel: this suite is about which one the deeplink picks, and
// mounting any of them for real would drag in its data layer.
jest.mock('./components', () => ({
    CloudInviteDialog: () => <div>cloud-branch</div>,
    RelayInviteDialog: ({ code }: { code: string }) => <div>relay-branch:{code}</div>,
    InviteAcceptLoading: () => <div>loading-branch</div>,
}));

const CLOUD = '?provider=invite&code=abc&_backend=https%3A%2F%2Fx.example';
const RELAY = '?provider=invite&code=abc&relay=1';

beforeEach(() => {
    jest.clearAllMocks();
    mockSearch = CLOUD;
    mockIsAuthenticated = true;
});

describe('InviteAcceptPage — 딥링크 분기', () => {
    it('relay 마커가 없으면 클라우드 초대로 간다', () => {
        render(<InviteAcceptPage />);

        expect(screen.getByText('cloud-branch')).toBeInTheDocument();
    });

    it('relay 마커가 있으면 relay 수락 플로우로 가고 코드를 넘긴다', () => {
        mockSearch = RELAY;
        render(<InviteAcceptPage />);

        expect(screen.getByText('relay-branch:abc')).toBeInTheDocument();
        expect(screen.queryByText('cloud-branch')).not.toBeInTheDocument();
    });

    it('값 없는 bare relay 도 마커로 인정한다', () => {
        mockSearch = '?provider=invite&code=abc&relay';
        render(<InviteAcceptPage />);

        expect(screen.getByText('relay-branch:abc')).toBeInTheDocument();
    });
});

describe('InviteAcceptPage — 진입 조건', () => {
    it('초대 딥링크가 아니면 홈으로 돌려보낸다', () => {
        mockSearch = '?foo=bar';
        render(<InviteAcceptPage />);

        expect(screen.getByText('navigated:/')).toBeInTheDocument();
    });

    it('provider 마커 없는 code 만으로는 진입하지 않는다 (OAuth 콜백 등 남의 파라미터)', () => {
        mockSearch = '?code=abc&relay=1';
        render(<InviteAcceptPage />);

        expect(screen.getByText('navigated:/')).toBeInTheDocument();
    });

    it('수락할 대상(_backend / relay)이 없으면 진입하지 않는다', () => {
        mockSearch = '?provider=invite&code=abc';
        render(<InviteAcceptPage />);

        expect(screen.getByText('navigated:/')).toBeInTheDocument();
    });
});

describe('InviteAcceptPage — 인증 전 도착', () => {
    it('세션이 아직 없으면 로딩 화면을 띄우고 어떤 수락 흐름도 시작하지 않는다', () => {
        // Firing a relay-pinned invite.get before the handshake rejects as an unclassified failure,
        // which surfaces as a useless "generic" dialog on a perfectly valid invite.
        mockIsAuthenticated = false;
        mockSearch = RELAY;
        render(<InviteAcceptPage />);

        expect(screen.getByText('loading-branch')).toBeInTheDocument();
        expect(screen.queryByText(/relay-branch/)).not.toBeInTheDocument();
        expect(screen.queryByText('cloud-branch')).not.toBeInTheDocument();
    });

    it('세션이 없어도 초대가 아니면 홈으로 보낸다 (로딩으로 붙잡지 않는다)', () => {
        mockIsAuthenticated = false;
        mockSearch = '?foo=bar';
        render(<InviteAcceptPage />);

        expect(screen.getByText('navigated:/')).toBeInTheDocument();
    });
});

describe('InviteAcceptPage — 셸 밖에서의 책임', () => {
    it('UnifiedLayout 밖이므로 네이티브 백 핸들러를 직접 마운트한다', () => {
        mockSearch = RELAY;
        render(<InviteAcceptPage />);

        expect(mockBackHandler).toHaveBeenCalled();
    });
});
