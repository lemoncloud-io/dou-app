import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const navigate = jest.fn();
const toast = jest.fn();
const getContacts = jest.fn();
const openSettings = jest.fn();
const createSingleInvite = jest.fn().mockResolvedValue(undefined);
const createBatchInvite = jest.fn().mockResolvedValue(undefined);
let isNativeValue = true;
let isDevBuildValue = false;

jest.mock('react-router-dom', () => ({ useParams: () => ({ channelId: 'ch1' }) }));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, o?: any) => (o && 'count' in o ? `${k}:${o.count}` : k) }),
}));
jest.mock('@chatic/bridges', () => ({ isNative: () => isNativeValue }));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigate }));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('@chatic/web-core', () => ({ reportError: jest.fn() }));
jest.mock('../../../ui/components', () => ({ PageHeader: (p: any) => <div>{p.title}</div> }));
jest.mock('../../../bridge', () => ({ appBridge: { getContacts, openSettings } }));
// `buildEnv` reads `import.meta`, which ts-jest's CommonJS transform cannot parse.
jest.mock('../../../utils/buildEnv', () => ({ isDevBuild: () => isDevBuildValue }));
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
    isDevBuildValue = false;
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

    it('opens the OS settings from the populated list (partial contacts access)', async () => {
        render(<InvitePage />);
        await screen.findByTestId('user-N1');

        fireEvent.click(screen.getByRole('button', { name: 'inviteFriends.openContactSettings' }));
        expect(openSettings).toHaveBeenCalledTimes(1);
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
    it('hides every share-link entry on a production app build', async () => {
        render(<InvitePage />);
        await screen.findByTestId('user-N1');

        expect(screen.queryByRole('button', { name: 'inviteFriends.sendLink' })).not.toBeInTheDocument();
        expect(screen.queryByTestId('add-friend-sheet')).not.toBeInTheDocument();
    });

    it('keeps the share-link entry on a DEV/LOCAL app build', async () => {
        isDevBuildValue = true;
        render(<InvitePage />);
        await screen.findByTestId('user-N1');

        expect(screen.getByRole('button', { name: 'inviteFriends.sendLink' })).toBeInTheDocument();
        expect(screen.getByTestId('add-friend-sheet')).toBeInTheDocument();
    });

    it('keeps the share-link entry when the permission banner is shown on DEV', async () => {
        isDevBuildValue = true;
        getContacts.mockRejectedValueOnce(new Error('denied'));
        render(<InvitePage />);
        await screen.findByTestId('permission-banner');

        expect(screen.getByTestId('link-cta')).toBeInTheDocument();
    });

    it('leaves the denied state with the settings button alone on a production app build', async () => {
        getContacts.mockRejectedValueOnce(new Error('denied'));
        render(<InvitePage />);
        await screen.findByTestId('permission-banner');

        expect(screen.queryByTestId('link-cta')).not.toBeInTheDocument();
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
