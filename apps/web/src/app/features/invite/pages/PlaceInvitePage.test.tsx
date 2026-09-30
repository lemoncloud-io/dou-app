import '@testing-library/jest-dom';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const navigate = jest.fn();
const toast = jest.fn();
const createPlaceInvite = jest.fn();

type PlaceRow = { id: string; name?: string; isOwner?: boolean } | null;
/**
 * The cache's first answer for the routed place — `'pending'` answers nothing yet, as a cold cache
 * would — and `emitPlace` pushes a later one, as a place sync would.
 */
let placeRow: PlaceRow | 'pending' = { id: 'site-1', name: '레몬', isOwner: true };
let placeListener: ((row: PlaceRow) => void) | null = null;
const emitPlace = (row: PlaceRow) => act(() => placeListener?.(row));

let selectedCloudId = 'cloud-1';
let selectedSiteId: string | null = 'site-1';
let routePlaceId = 'site-1';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options?: Record<string, unknown>) => (options ? `${key}|${JSON.stringify(options)}` : key),
        i18n: { language: 'ko' },
    }),
}));
// One repository object for the whole suite, as the runtime hands out: a fresh one per render would
// re-run the page's subscription effect on every render and reset the row it just received.
const mockRepositories = {
    place: {
        observeItem: (_id: string, callback: (row: PlaceRow) => void) => {
            placeListener = callback;
            if (placeRow !== 'pending') callback(placeRow);
            return () => undefined;
        },
    },
};
jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: () => mockRepositories,
        },
        session: {
            useRuntimeProfile: () => ({ isGuest: false }),
            useSessionSelection: () => ({ selectedCloudId, selectedSiteId }),
        },
    },
}));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigate }));
jest.mock('react-router-dom', () => ({ useParams: () => ({ placeId: routePlaceId }) }));
// The real barrel also exports CloudLogo, which needs `@chatic/assets` (not resolvable under jest).
jest.mock('../../../ui/components', () => ({ PageHeader: (p: any) => <div>{p.title}</div> }));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('../../channels/hooks/useCreateInviteBatch', () => ({
    useCreateInviteBatch: () => ({ createPlaceInvite }),
}));

import { PlaceInvitePage } from './PlaceInvitePage';

const fillForm = (name: string, phone: string) => {
    fireEvent.change(screen.getByPlaceholderText('contactInvite.namePlaceholder'), { target: { value: name } });
    fireEvent.change(screen.getByPlaceholderText('contactInvite.phonePlaceholder'), { target: { value: phone } });
};
const submit = () => fireEvent.click(screen.getByText('contactInvite.submit'));

describe('PlaceInvitePage', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        placeRow = { id: 'site-1', name: '레몬', isOwner: true };
        placeListener = null;
        selectedCloudId = 'cloud-1';
        selectedSiteId = 'site-1';
        routePlaceId = 'site-1';
        createPlaceInvite.mockResolvedValue({ inviteView: {}, channel: 'sms' });
        // jsdom's `en-US` would open the picker on US and reject the Korean numbers below.
        localStorage.clear();
        localStorage.setItem('dou.phoneInput.country.v1', 'KR');
    });

    it('names the place it invites into', () => {
        render(<PlaceInvitePage />);

        expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('레몬');
    });

    it('sends an E.164 place invite, then goes back with the delivery toast', async () => {
        render(<PlaceInvitePage />);
        fillForm('홍길동', '01012345678');
        submit();

        await waitFor(() =>
            expect(createPlaceInvite).toHaveBeenCalledWith({
                name: '홍길동',
                phone: '+821012345678',
                placeName: '레몬',
            })
        );
        await waitFor(() => expect(navigate).toHaveBeenCalledWith(-1));
        expect(toast).toHaveBeenCalledWith({ title: 'inviteFriends.sentSms' });
    });

    it('says so when the invite was issued but the link could not be handed off', async () => {
        createPlaceInvite.mockResolvedValue({ inviteView: {}, channel: false });
        render(<PlaceInvitePage />);
        fillForm('홍길동', '01012345678');
        submit();

        await waitFor(() =>
            expect(toast).toHaveBeenCalledWith({ title: 'inviteFriends.sentFailed', variant: 'destructive' })
        );
    });

    it('shows an inline error and sends nothing for an invalid number', () => {
        render(<PlaceInvitePage />);
        fillForm('홍길동', '02012345678');
        submit();

        expect(screen.getByText('contactInvite.phoneInvalidFormat')).toBeInTheDocument();
        expect(createPlaceInvite).not.toHaveBeenCalled();
    });

    it('does not send once the session has moved to another place — the server would file it there', () => {
        selectedSiteId = 'site-2';
        render(<PlaceInvitePage />);
        fillForm('홍길동', '01012345678');

        expect(screen.getByText('contactInvite.submit').closest('button')).toBeDisabled();
        expect(createPlaceInvite).not.toHaveBeenCalled();
    });

    it('keeps the toast failure path when the server refuses', async () => {
        createPlaceInvite.mockRejectedValue(new Error('boom'));
        render(<PlaceInvitePage />);
        fillForm('홍길동', '01012345678');
        submit();

        await waitFor(() =>
            expect(toast).toHaveBeenCalledWith({ title: 'contactInvite.issueFailed', variant: 'destructive' })
        );
        expect(navigate).not.toHaveBeenCalled();
    });

    it('sends a non-owner who opened the route directly back home', () => {
        placeRow = { id: 'site-1', name: '레몬', isOwner: false };
        render(<PlaceInvitePage />);

        expect(navigate).toHaveBeenCalledWith('/', { replace: true });
    });

    it('sends a relay session back home, where no place can be invited into', () => {
        selectedCloudId = 'default';
        render(<PlaceInvitePage />);

        expect(navigate).toHaveBeenCalledWith('/', { replace: true });
    });

    it('waits for the place row before judging ownership, and holds the submit meanwhile', () => {
        placeRow = 'pending';
        render(<PlaceInvitePage />);
        fillForm('홍길동', '01012345678');

        // An unloaded row is not a non-owner: bouncing here would throw the owner out on a cold cache.
        expect(navigate).not.toHaveBeenCalled();
        expect(screen.getByText('contactInvite.submit').closest('button')).toBeDisabled();

        emitPlace({ id: 'site-1', name: '레몬', isOwner: true });

        expect(navigate).not.toHaveBeenCalled();
        expect(screen.getByText('contactInvite.submit').closest('button')).toBeEnabled();
    });
});
