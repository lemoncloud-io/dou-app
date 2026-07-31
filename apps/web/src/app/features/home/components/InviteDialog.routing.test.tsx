import '@testing-library/jest-dom';

import { render, screen } from '@testing-library/react';

import { InviteDialog } from './InviteDialog';

// Mutable per-test fixture (must be `mock`-prefixed to be usable inside jest.mock factories).
let mockSearch = '';

jest.mock('react-router-dom', () => ({ useLocation: () => ({ search: mockSearch }) }));
// Both branches are stubbed to sentinels: this suite is about which one the deeplink picks, and
// mounting either for real would drag in its data layer.
jest.mock('../../invite/accept/components', () => ({
    CloudInviteDialog: () => <div>cloud-branch</div>,
    RelayInviteDialog: ({ code }: { code: string }) => <div>relay-branch:{code}</div>,
}));

const CLOUD = '?provider=invite&code=abc&_backend=https%3A%2F%2Fx.example';
const RELAY = `${CLOUD}&relay`;

beforeEach(() => {
    mockSearch = CLOUD;
});

describe('InviteDialog — 딥링크 분기', () => {
    it('relay 마커가 없으면 기존 클라우드 초대로 간다', () => {
        render(<InviteDialog />);

        expect(screen.getByText('cloud-branch')).toBeInTheDocument();
    });

    it('relay 마커가 있으면 relay 수락 플로우로 가고 코드를 넘긴다', () => {
        mockSearch = RELAY;
        render(<InviteDialog />);

        expect(screen.getByText('relay-branch:abc')).toBeInTheDocument();
        expect(screen.queryByText('cloud-branch')).not.toBeInTheDocument();
    });

    it('relay 마커만 있고 초대 딥링크가 아니면 아무 분기도 타지 않는다', () => {
        mockSearch = '?relay&code=abc';
        const { container } = render(<InviteDialog />);

        expect(container).toBeEmptyDOMElement();
    });

    it('suppressed면 relay 초대여도 렌더하지 않는다', () => {
        mockSearch = RELAY;
        const { container } = render(<InviteDialog suppressed />);

        expect(container).toBeEmptyDOMElement();
    });
});
