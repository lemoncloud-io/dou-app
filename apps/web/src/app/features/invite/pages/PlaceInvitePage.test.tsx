import '@testing-library/jest-dom';

import { act, render, screen } from '@testing-library/react';

const navigate = jest.fn();
const createPlaceInvite = jest.fn();
const createBatchInvite = jest.fn();
const requestInviteLink = jest.fn();

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
let isExperimentEnabled = true;

/** The props the page handed the shared contact tab and link sheet, captured on each render. */
let tab: any = null;
let sheet: any = null;

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
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
        data: { useRuntimeRepositories: () => mockRepositories },
        session: {
            useRuntimeProfile: () => ({ isGuest: false }),
            useSessionSelection: () => ({ selectedCloudId, selectedSiteId }),
        },
    },
}));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigate }));
jest.mock('react-router-dom', () => ({ useParams: () => ({ placeId: 'site-1' }) }));
// The real barrel also exports CloudLogo, which needs `@chatic/assets` (not resolvable under jest).
jest.mock('../../../ui/components', () => ({ PageHeader: (p: any) => <div>{p.title}</div> }));
jest.mock('../../../hooks/usePlaceInviteExperiment', () => ({
    usePlaceInviteExperiment: () => ({ isEnabled: isExperimentEnabled, setEnabled: jest.fn() }),
}));
jest.mock('../../channels/hooks/useCreateInviteBatch', () => ({
    useCreateInviteBatch: () => ({ createPlaceInvite, createBatchInvite, requestInviteLink }),
}));
// The picker and the sheet have their own suites; here only what this page binds them to matters.
jest.mock('../../channels/components/ContactInviteTab', () => ({
    ContactInviteTab: (p: any) => {
        tab = p;
        return <div data-testid="contact-tab" />;
    },
}));
jest.mock('../../channels/components/AddFriendSheet', () => ({
    AddFriendSheet: (p: any) => {
        sheet = p;
        return null;
    },
}));

import { PlaceInvitePage } from './PlaceInvitePage';

describe('PlaceInvitePage', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        placeRow = { id: 'site-1', name: '레몬', isOwner: true };
        placeListener = null;
        selectedCloudId = 'cloud-1';
        selectedSiteId = 'site-1';
        isExperimentEnabled = true;
        tab = null;
        sheet = null;
        createPlaceInvite.mockResolvedValue({ inviteView: {}, channel: 'sms' });
        createBatchInvite.mockResolvedValue([]);
        requestInviteLink.mockResolvedValue('https://dou.link/abc');
    });

    it('is the contact invite, always showing', () => {
        render(<PlaceInvitePage />);

        expect(screen.getByText('placeInvite.title')).toBeInTheDocument();
        expect(tab.active).toBe(true);
    });

    it('invites one contact into the place, texting the place copy', async () => {
        render(<PlaceInvitePage />);

        await expect(tab.sendSingle({ name: '홍길동', phone: '01012345678' })).resolves.toBe('sms');
        expect(createPlaceInvite).toHaveBeenCalledWith({ name: '홍길동', phone: '01012345678', placeName: '레몬' });
    });

    it('invites several contacts as a batch that names no room', async () => {
        render(<PlaceInvitePage />);
        await tab.sendBatch(['01011112222', '01033334444']);

        expect(createBatchInvite).toHaveBeenCalledWith({ phones: ['01011112222', '01033334444'] });
    });

    it('asks for a link that names no room, and opens the place link page with it', async () => {
        render(<PlaceInvitePage />);

        await expect(sheet.requestLink({ name: '홍길동', phone: '01012345678' })).resolves.toBe('https://dou.link/abc');
        expect(requestInviteLink).toHaveBeenCalledWith({ name: '홍길동', phone: '01012345678' });

        sheet.onLinkReady('https://dou.link/abc');
        expect(navigate).toHaveBeenCalledWith('/invite/place/site-1/link', {
            state: { inviteLink: 'https://dou.link/abc' },
        });
    });

    it('leaves the flow once an invite went out', () => {
        render(<PlaceInvitePage />);
        tab.onSent();

        expect(navigate).toHaveBeenCalledWith(-1);
    });

    it('refuses every send once the session is on another place — the server would file it there', async () => {
        selectedSiteId = 'site-2';
        render(<PlaceInvitePage />);

        await expect(tab.sendSingle({ name: 'n', phone: 'p' })).rejects.toThrow('placeInvite.placeChanged');
        await expect(tab.sendBatch(['p'])).rejects.toThrow('placeInvite.placeChanged');
        await expect(sheet.requestLink({ name: 'n', phone: 'p' })).rejects.toThrow('placeInvite.placeChanged');
        expect(createPlaceInvite).not.toHaveBeenCalled();
        expect(createBatchInvite).not.toHaveBeenCalled();
        expect(requestInviteLink).not.toHaveBeenCalled();
    });

    it('sends a non-owner who opened the route directly back home', () => {
        placeRow = { id: 'site-1', name: '레몬', isOwner: false };
        render(<PlaceInvitePage />);

        expect(navigate).toHaveBeenCalledWith('/', { replace: true });
    });

    it('sends the owner back home while the Lab experiment is off, and refuses to send', async () => {
        isExperimentEnabled = false;
        render(<PlaceInvitePage />);

        expect(navigate).toHaveBeenCalledWith('/', { replace: true });
        await expect(tab.sendBatch(['p'])).rejects.toThrow('placeInvite.placeChanged');
        expect(createBatchInvite).not.toHaveBeenCalled();
    });

    it('sends the owner home at once with the experiment off, before the place row has loaded', () => {
        isExperimentEnabled = false;
        placeRow = 'pending';
        render(<PlaceInvitePage />);

        // Ownership waits for the row; the switch is already known, so there is nothing to wait for.
        expect(navigate).toHaveBeenCalledWith('/', { replace: true });
    });

    it('leaves and stops sending when the experiment is turned off under an open page', async () => {
        const { rerender } = render(<PlaceInvitePage />);
        expect(navigate).not.toHaveBeenCalled();

        isExperimentEnabled = false;
        rerender(<PlaceInvitePage />);

        expect(navigate).toHaveBeenCalledWith('/', { replace: true });
        await expect(tab.sendBatch(['p'])).rejects.toThrow('placeInvite.placeChanged');
        expect(createBatchInvite).not.toHaveBeenCalled();
    });

    it('sends a relay session back home, where no place can be invited into', () => {
        selectedCloudId = 'default';
        render(<PlaceInvitePage />);

        expect(navigate).toHaveBeenCalledWith('/', { replace: true });
    });

    it('waits for the place row before judging ownership, and refuses to send meanwhile', async () => {
        placeRow = 'pending';
        render(<PlaceInvitePage />);

        // An unloaded row is not a non-owner: bouncing here would throw the owner out on a cold cache.
        expect(navigate).not.toHaveBeenCalled();
        await expect(tab.sendBatch(['p'])).rejects.toThrow('placeInvite.placeChanged');

        emitPlace({ id: 'site-1', name: '레몬', isOwner: true });

        expect(navigate).not.toHaveBeenCalled();
        await expect(tab.sendBatch(['p'])).resolves.toEqual([]);
    });
});
