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
    useChannel: () => ({ channel: { id: 'ch1', sid: 'site-1' } }),
}));
// The place tab has its own separate tests — here only "the tab wires it up" is checked.
jest.mock('../components/PlaceInviteTab', () => ({
    PlaceInviteTab: (p: any) => <div data-testid="place-tab" data-sid={String(p.sid)} />,
}));
jest.mock('../components/AddFriendSheet', () => ({
    AddFriendSheet: (p: any) => <div data-testid="add-friend-sheet" data-open={String(p.open)} />,
}));
jest.mock('../components/PermissionDeniedBanner', () => ({
    PermissionDeniedBanner: () => <div data-testid="permission-banner" />,
}));
jest.mock('@chatic/web-ui-kit', () => ({
    IconLink: () => <span />,
    SegmentedTabs: ({ items, value, onChange }: any) => (
        <div>
            {items.map((item: any) => (
                <button
                    key={item.id}
                    data-testid={`tab-${item.id}`}
                    data-active={String(item.id === value)}
                    onClick={() => onChange(item.id)}
                >
                    {item.label}
                </button>
            ))}
        </div>
    ),
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

/**
 * The default tab is place (ADR-0075). Tests exercising the contacts flow switch the tab first —
 * since the contacts fetch also starts at that point, this switch is itself the trigger for
 * `getContacts()`.
 */
const renderOnContactTab = () => {
    const result = render(<InvitePage />);
    fireEvent.click(screen.getByTestId('tab-contact'));
    return result;
};

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
        renderOnContactTab();
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
        renderOnContactTab();
        await screen.findByTestId('user-N1');
        fireEvent.click(screen.getByTestId('user-N1'));
        fireEvent.click(screen.getByTestId('cta'));
        await waitFor(() => expect(createSingleInvite).toHaveBeenCalledTimes(1));
    });

    it('docks the CTA disabled until something is selected', async () => {
        renderOnContactTab();
        await screen.findByTestId('user-N1');

        expect(screen.getByTestId('cta')).toBeDisabled();
        fireEvent.click(screen.getByTestId('user-N1'));
        expect(screen.getByTestId('cta')).toBeEnabled();
    });

    it('shows the permission banner when contacts are denied', async () => {
        getContacts.mockRejectedValueOnce(new Error('denied'));
        renderOnContactTab();
        expect(await screen.findByTestId('permission-banner')).toBeInTheDocument();
    });

    // When the list is populated, there's no OS settings path. The escape hatch for when partial
    // contacts access truncates the list is the link invite (see share-link availability below).
    it('opens the invite sheet from the populated list instead of the OS settings', async () => {
        renderOnContactTab();
        await screen.findByTestId('user-N1');

        fireEvent.click(screen.getByRole('button', { name: 'inviteFriends.sendLink' }));

        expect(screen.getByTestId('add-friend-sheet')).toHaveAttribute('data-open', 'true');
        expect(openSettings).not.toHaveBeenCalled();
    });

    it('caps the selection at 100 and toasts', async () => {
        const many = Array.from({ length: 101 }, (_, i) => contact(String(i)));
        getContacts.mockResolvedValue({ data: { contacts: many } });
        renderOnContactTab();
        await screen.findByTestId('user-N0');

        for (let i = 0; i < 100; i++) fireEvent.click(screen.getByTestId(`user-N${i}`));
        toast.mockClear();
        fireEvent.click(screen.getByTestId('user-N100'));

        expect(toast).toHaveBeenCalledWith({ title: 'inviteFriends.limitToast' });
    });
});

describe('share-link availability', () => {
    // The link invite used to be open only on DEV/LOCAL builds (a temporary plan). Now that
    // restriction is lifted, all three entry points must be live on the production app too.
    it('exposes every share-link entry on a release app build', async () => {
        renderOnContactTab();
        await screen.findByTestId('user-N1');

        expect(screen.getByRole('button', { name: 'inviteFriends.sendLink' })).toBeInTheDocument();
        expect(screen.getByTestId('add-friend-sheet')).toBeInTheDocument();
    });

    // The search row keeps just the one link button. Even when partial contacts access returns a
    // truncated list, the link invite where you type a name + number directly becomes the path
    // that reaches someone missing from the list — the test above protects the premise that this
    // path stays open on the production app.
    it('leaves the link button alone in the search row', async () => {
        renderOnContactTab();
        await screen.findByTestId('user-N1');

        expect(screen.getByRole('button', { name: 'inviteFriends.sendLink' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'inviteFriends.openContactSettings' })).not.toBeInTheDocument();
    });

    it('offers the link CTA from the permission-denied state too', async () => {
        getContacts.mockRejectedValueOnce(new Error('denied'));
        renderOnContactTab();
        await screen.findByTestId('permission-banner');

        expect(screen.getByTestId('link-cta')).toBeInTheDocument();
    });
});

/**
 * The payload an iPhone actually sends. iOS never fills `displayName` and omits a name key outright
 * when the field is empty, so every one of these rows used to render with a blank label.
 */
describe('contacts that carry no display name', () => {
    const ios = (partial: any) => ({ recordID: 'ios-1', ...partial });

    it('labels a contact that has only a family name', async () => {
        getContacts.mockResolvedValue({
            data: { contacts: [ios({ familyName: '김', phoneNumbers: [{ number: '010-1234-5678' }] })] },
        });
        renderOnContactTab();
        expect(await screen.findByTestId('user-김')).toBeEnabled();
    });

    it('labels a business contact by its company', async () => {
        getContacts.mockResolvedValue({
            data: { contacts: [ios({ company: '동네치킨', phoneNumbers: [{ number: '010-1234-5678' }] })] },
        });
        renderOnContactTab();
        expect(await screen.findByTestId('user-동네치킨')).toBeInTheDocument();
    });

    it('labels a nameless contact by its number and still invites it', async () => {
        getContacts.mockResolvedValue({ data: { contacts: [ios({ phoneNumbers: [{ number: '01012345678' }] })] } });
        renderOnContactTab();

        const row = await screen.findByTestId('user-010-1234-5678');
        expect(row).toBeEnabled();
        fireEvent.click(row);
        fireEvent.click(screen.getByTestId('cta'));

        await waitFor(() => expect(createSingleInvite).toHaveBeenCalledTimes(1));
        expect(createSingleInvite).toHaveBeenCalledWith(
            expect.objectContaining({ name: '010-1234-5678', phone: '+821012345678' })
        );
    });

    // A contact with no number at all can neither be invited nor identified, so it is left out
    // rather than shown as a row nobody can tap.
    it('leaves out a contact that has no number at all', async () => {
        getContacts.mockResolvedValue({
            data: {
                contacts: [
                    ios({}),
                    ios({
                        recordID: 'ios-2',
                        givenName: '민수',
                        familyName: '김',
                        phoneNumbers: [{ number: '010-1234-5678' }],
                    }),
                ],
            },
        });
        renderOnContactTab();
        await screen.findByTestId('user-김민수');

        expect(screen.queryByTestId('user-inviteFriends.unnamedContact')).not.toBeInTheDocument();
    });

    // Not the same thing as "cannot be invited": a landline-only contact is still recognisable by
    // its number, so it stays on the list and only the checkbox is off.
    it('keeps a contact whose only number is not an invitable mobile', async () => {
        getContacts.mockResolvedValue({ data: { contacts: [ios({ phoneNumbers: [{ number: '02-123-4567' }] })] } });
        renderOnContactTab();

        expect(await screen.findByTestId('user-02-123-4567')).toBeDisabled();
    });

    it('explains an empty list when nothing received carries a number', async () => {
        getContacts.mockResolvedValue({
            data: { contacts: [ios({}), ios({ recordID: 'ios-2', company: '동네치킨' })] },
        });
        renderOnContactTab();

        expect(await screen.findByText('inviteFriends.noInvitableContacts')).toBeInTheDocument();
    });

    it('invites by the mobile even when a landline is stored first', async () => {
        getContacts.mockResolvedValue({
            data: {
                contacts: [
                    ios({
                        givenName: '민수',
                        familyName: '김',
                        phoneNumbers: [{ number: '02-123-4567' }, { number: '010-1234-5678' }],
                    }),
                ],
            },
        });
        renderOnContactTab();

        const row = await screen.findByTestId('user-김민수');
        expect(row).toBeEnabled();
        fireEvent.click(row);
        fireEvent.click(screen.getByTestId('cta'));

        await waitFor(() => expect(createSingleInvite).toHaveBeenCalledTimes(1));
        expect(createSingleInvite).toHaveBeenCalledWith(expect.objectContaining({ phone: '+821012345678' }));
    });

    it('finds a company-labelled row by search', async () => {
        getContacts.mockResolvedValue({
            data: {
                contacts: [
                    ios({ company: '동네치킨', phoneNumbers: [{ number: '010-1234-5678' }] }),
                    { recordID: 'ios-2', givenName: '민수', familyName: '김' },
                ],
            },
        });
        renderOnContactTab();
        await screen.findByTestId('user-동네치킨');

        fireEvent.change(screen.getByLabelText('search'), { target: { value: '치킨' } });

        expect(screen.getByTestId('user-동네치킨')).toBeInTheDocument();
        expect(screen.queryByTestId('user-김민수')).not.toBeInTheDocument();
    });
});

describe('InvitePage (web)', () => {
    it('shows the invite-link guide instead of a contact list', async () => {
        isNativeValue = false;
        renderOnContactTab();
        expect(await screen.findByText('inviteFriends.sendLink')).toBeInTheDocument();
        expect(screen.queryByTestId('user-N1')).not.toBeInTheDocument();
        expect(getContacts).not.toHaveBeenCalled();
    });
});

describe('InvitePage — 탭 셸', () => {
    it('플레이스 탭으로 열린다', () => {
        render(<InvitePage />);

        expect(screen.getByTestId('tab-place')).toHaveAttribute('data-active', 'true');
        expect(screen.getByTestId('place-tab')).toBeInTheDocument();
    });

    it('플레이스 탭에는 채널의 sid를 넘긴다', () => {
        render(<InvitePage />);

        expect(screen.getByTestId('place-tab')).toHaveAttribute('data-sid', 'site-1');
    });

    it('연락처 탭으로 넘기면 플레이스 탭 본문이 사라진다', async () => {
        render(<InvitePage />);
        fireEvent.click(screen.getByTestId('tab-contact'));

        expect(screen.queryByTestId('place-tab')).not.toBeInTheDocument();
        expect(await screen.findByTestId('user-N1')).toBeInTheDocument();
    });

    /**
     * `getContacts()` raises the OS permission popup. Now that the default tab is place, calling
     * it on mount would prompt for permission even a user with no intention of using contacts, so
     * it's deferred until the tab is actually opened.
     */
    it('플레이스 탭에 머무는 동안에는 연락처를 요청하지 않는다', () => {
        render(<InvitePage />);

        expect(getContacts).not.toHaveBeenCalled();
    });

    it('연락처 탭에 들어와야 연락처를 요청한다', () => {
        render(<InvitePage />);
        fireEvent.click(screen.getByTestId('tab-contact'));

        expect(getContacts).toHaveBeenCalledTimes(1);
    });

    /**
     * Regression guard: if the trigger were hooked directly to `activeTab`, flipping the tab back
     * would run cleanup that cancels the in-flight request, leaving only the re-request guard
     * behind — so the contacts tab would stay empty forever.
     */
    it('응답 전에 탭을 되돌려도 연락처가 결국 도착한다', async () => {
        let resolveContacts: (v: unknown) => void = () => undefined;
        getContacts.mockReturnValue(new Promise(res => (resolveContacts = res)));
        render(<InvitePage />);
        fireEvent.click(screen.getByTestId('tab-contact'));
        fireEvent.click(screen.getByTestId('tab-place'));
        resolveContacts({ data: { contacts: [contact('1')] } });

        fireEvent.click(screen.getByTestId('tab-contact'));

        expect(await screen.findByTestId('user-N1')).toBeInTheDocument();
    });

    it('탭을 오가도 연락처를 다시 요청하지 않는다', async () => {
        render(<InvitePage />);
        fireEvent.click(screen.getByTestId('tab-contact'));
        await screen.findByTestId('user-N1');
        fireEvent.click(screen.getByTestId('tab-place'));
        fireEvent.click(screen.getByTestId('tab-contact'));

        expect(getContacts).toHaveBeenCalledTimes(1);
    });

    // The web has no device contacts — even so, the place tab opens to a screen with something to pick from.
    it('웹에서도 기본 탭은 플레이스다', () => {
        isNativeValue = false;
        render(<InvitePage />);

        expect(screen.getByTestId('place-tab')).toBeInTheDocument();
        expect(getContacts).not.toHaveBeenCalled();
    });
});
