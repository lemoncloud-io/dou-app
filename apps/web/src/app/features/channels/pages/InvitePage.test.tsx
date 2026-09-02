import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const navigate = jest.fn();
const toast = jest.fn();
const getContacts = jest.fn();
const openSettings = jest.fn();
const createSingleInvite = jest.fn().mockResolvedValue(undefined);
const createBatchInvite = jest.fn().mockResolvedValue(undefined);
let isNativeValue = true;

jest.mock('react-router-dom', () => ({
    useParams: () => ({ channelId: 'ch1' }),
    useLocation: () => ({ state: null }),
}));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, o?: any) => (o && 'count' in o ? `${k}:${o.count}` : k) }),
}));
jest.mock('@chatic/bridges', () => ({
    isNative: () => isNativeValue,
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigate }));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('@chatic/app-runtime', () => ({}));
jest.mock('../../../ui/components', () => ({ PageHeader: (p: any) => <div>{p.title}</div> }));
jest.mock('../../../bridge', () => ({ appBridge: { getContacts, openSettings } }));
jest.mock('../hooks', () => ({
    useCreateInviteBatch: () => ({ createSingleInvite, createBatchInvite }),
}));
jest.mock('../components/AddFriendSheet', () => ({
    AddFriendSheet: (p: any) => <div data-testid="add-friend-sheet" data-open={String(p.open)} />,
}));
jest.mock('../components/PermissionDeniedBanner', () => ({
    PermissionDeniedBanner: () => <div data-testid="permission-banner" />,
}));
jest.mock('@chatic/web-ui-kit', () => ({
    IconLink: () => <span />,
    SearchInput: ({ value, onChange, trailing }: any) => (
        <div>
            <input aria-label="search" value={value} onChange={e => onChange(e.target.value)} />
            {trailing}
        </div>
    ),
    SelectableUserItem: ({ name, checked, onToggle, disabled }: any) => (
        <button data-testid={`user-${name}`} disabled={disabled} onClick={() => onToggle?.(!checked)}>
            {name}
        </button>
    ),
    SelectedAvatarRow: ({ items }: any) => <div data-testid="selected-row">{items.length}</div>,
    Button: ({ children, onClick, loading }: any) => (
        <button data-testid="link-cta" disabled={loading} onClick={onClick}>
            {children}
        </button>
    ),
    FloatingButton: ({ label, onClick, loading, disabled }: any) => (
        <button data-testid="cta" disabled={disabled || loading} onClick={onClick}>
            {label}
        </button>
    ),
}));

import { InvitePage } from './InvitePage';

const contact = (id: string, phone = '010-1234-5678') => ({
    recordID: id,
    displayName: `N${id}`,
    givenName: `N${id}`,
    familyName: '',
    phoneNumbers: [{ number: phone }],
});

beforeEach(() => {
    jest.clearAllMocks();
    isNativeValue = true;
    getContacts.mockResolvedValue({ data: { contacts: [contact('1'), contact('2')] } });
});

describe('InvitePage (native)', () => {
    it('renders fetched contacts and batch-invites the selection', async () => {
        render(<InvitePage />);
        await screen.findByTestId('user-N1');

        fireEvent.click(screen.getByTestId('user-N1'));
        fireEvent.click(screen.getByTestId('user-N2'));

        fireEvent.click(screen.getByTestId('cta'));

        await waitFor(() => expect(createBatchInvite).toHaveBeenCalledTimes(1));
        // E.164, not the local form: `user.invite-batch` has nowhere to carry a country
        // (to/channelId/cloudId/cloudName), so the number has to declare its own (ADR-0044 §5).
        // Both fixtures share a number; de-duplication belongs to the hook that owns the wire
        // payload, so the page still passes what it collected.
        expect(createBatchInvite).toHaveBeenCalledWith(
            expect.objectContaining({ channelId: 'ch1', phones: ['+821012345678', '+821012345678'] })
        );
        await waitFor(() => expect(navigate).toHaveBeenCalledWith(-1));
    });

    it('uses single invite when exactly one is selected', async () => {
        render(<InvitePage />);
        await screen.findByTestId('user-N1');
        fireEvent.click(screen.getByTestId('user-N1'));
        fireEvent.click(screen.getByTestId('cta'));
        await waitFor(() => expect(createSingleInvite).toHaveBeenCalledTimes(1));
    });

    it('docks the CTA disabled until something is selected', async () => {
        render(<InvitePage />);
        await screen.findByTestId('user-N1');

        expect(screen.getByTestId('cta')).toBeDisabled();
        fireEvent.click(screen.getByTestId('user-N1'));
        expect(screen.getByTestId('cta')).toBeEnabled();
    });

    it('shows the permission banner when contacts are denied', async () => {
        getContacts.mockRejectedValueOnce(new Error('denied'));
        render(<InvitePage />);
        expect(await screen.findByTestId('permission-banner')).toBeInTheDocument();
    });

    // 목록이 채워진 상태에서는 OS 설정 경로를 두지 않는다. 부분 연락처 접근으로 목록이
    // 잘렸을 때의 탈출구는 링크 초대다(아래 share-link availability 참고).
    it('opens the invite sheet from the populated list instead of the OS settings', async () => {
        render(<InvitePage />);
        await screen.findByTestId('user-N1');

        fireEvent.click(screen.getByRole('button', { name: 'inviteFriends.sendLink' }));

        expect(screen.getByTestId('add-friend-sheet')).toHaveAttribute('data-open', 'true');
        expect(openSettings).not.toHaveBeenCalled();
    });

    it('caps the selection at 100 and toasts', async () => {
        const many = Array.from({ length: 101 }, (_, i) => contact(String(i)));
        getContacts.mockResolvedValue({ data: { contacts: many } });
        render(<InvitePage />);
        await screen.findByTestId('user-N0');

        for (let i = 0; i < 100; i++) fireEvent.click(screen.getByTestId(`user-N${i}`));
        toast.mockClear();
        fireEvent.click(screen.getByTestId('user-N100'));

        expect(toast).toHaveBeenCalledWith({ title: 'inviteFriends.limitToast' });
    });
});

describe('share-link availability', () => {
    // 링크 초대는 한때 DEV/LOCAL 빌드에서만 열려 있었다(임시 기획). 그 제한이 풀렸으므로
    // 운영 앱에서도 세 진입점이 모두 살아 있어야 한다.
    it('exposes every share-link entry on a release app build', async () => {
        render(<InvitePage />);
        await screen.findByTestId('user-N1');

        expect(screen.getByRole('button', { name: 'inviteFriends.sendLink' })).toBeInTheDocument();
        expect(screen.getByTestId('add-friend-sheet')).toBeInTheDocument();
    });

    // 검색줄에는 링크 버튼 하나만 둔다. 부분 연락처 접근이 잘린 목록을 돌려줘도, 이름+번호를
    // 직접 넣는 링크 초대가 목록에 없는 사람에게 닿는 경로가 된다 — 이 경로가 운영 앱에서
    // 열려 있다는 것이 위 테스트가 지키는 전제다.
    it('leaves the link button alone in the search row', async () => {
        render(<InvitePage />);
        await screen.findByTestId('user-N1');

        expect(screen.getByRole('button', { name: 'inviteFriends.sendLink' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'inviteFriends.openContactSettings' })).not.toBeInTheDocument();
    });

    it('offers the link CTA from the permission-denied state too', async () => {
        getContacts.mockRejectedValueOnce(new Error('denied'));
        render(<InvitePage />);
        await screen.findByTestId('permission-banner');

        expect(screen.getByTestId('link-cta')).toBeInTheDocument();
    });
});

describe('InvitePage (web)', () => {
    it('shows the invite-link guide instead of a contact list', async () => {
        isNativeValue = false;
        render(<InvitePage />);
        expect(await screen.findByText('inviteFriends.sendLink')).toBeInTheDocument();
        expect(screen.queryByTestId('user-N1')).not.toBeInTheDocument();
        expect(getContacts).not.toHaveBeenCalled();
    });
});
