import '@testing-library/jest-dom';

import { act, render, screen } from '@testing-library/react';

import type { InviteParams } from '../types';

const finishProfile = jest.fn();
const setMyPlaceProfile = jest.fn();
let acceptState: Record<string, unknown> = {};
// What the dialog stub last received, so a test can drive its submit and read its dismissibility.
let dialogProps: {
    dismissible?: boolean;
    placeName: string;
    onSubmit: (value: { nick: string }) => Promise<void>;
    onDone: () => void;
    onExit: () => void;
} | null = null;

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/bridges', () => ({ logger: { info: jest.fn() } }));
jest.mock('@chatic/web-ui-kit', () => ({ AlertDialog: () => <div>alert</div> }));
jest.mock('@chatic/app-runtime', () => ({
    runtime: { session: { useInviteInfo: () => ({ data: { site$: { name: 'Invite copy' } } }) } },
}));
jest.mock('../../../../runtime/useSessionLogout', () => ({ useSessionLogout: () => jest.fn() }));
jest.mock('../../../../navigation', () => ({ useStackNavigate: () => jest.fn() }));
jest.mock('../../hooks/useInviteCountdown', () => ({ useInviteCountdown: () => null }));
jest.mock('../hooks', () => ({ useInviteAccept: () => acceptState }));
jest.mock('../../../../hooks', () => ({
    useSetMyPlaceProfile: () => setMyPlaceProfile,
    useActivePlaceName: () => 'Book club',
}));
jest.mock('./InviteAcceptScreen', () => ({ InviteAcceptScreen: () => <div>accept-screen</div> }));
jest.mock('../../../../ui/components/PlaceProfileCreateDialog', () => ({
    PlaceProfileCreateDialog: (props: NonNullable<typeof dialogProps>) => {
        dialogProps = props;
        return <div>profile-dialog</div>;
    },
}));

import { CloudInviteAccept } from './CloudInviteAccept';

const params = { code: 'invt:1:abc', backend: 'https://cloud.example' } as InviteParams;

beforeEach(() => {
    jest.clearAllMocks();
    dialogProps = null;
    acceptState = {
        accept: jest.fn(),
        isAccepting: false,
        missingDelegator: false,
        errorKey: null,
        profilePending: false,
        finishProfile,
    };
});

describe('CloudInviteAccept — place profile step', () => {
    it('shows the accept screen, not the profile form, until the pipeline asks for a profile', () => {
        render(<CloudInviteAccept params={params} />);

        expect(screen.getByText('accept-screen')).toBeInTheDocument();
        expect(screen.queryByText('profile-dialog')).not.toBeInTheDocument();
    });

    it('asks for the profile of the invited place with no way out yet', () => {
        acceptState.profilePending = true;
        render(<CloudInviteAccept params={params} />);

        expect(screen.getByText('profile-dialog')).toBeInTheDocument();
        expect(dialogProps?.placeName).toBe('Book club');
        expect(dialogProps?.dismissible).toBe(false);
    });

    it('saves through the active-place write and continues into the room when done', async () => {
        acceptState.profilePending = true;
        setMyPlaceProfile.mockResolvedValue(undefined);
        render(<CloudInviteAccept params={params} />);

        await act(async () => {
            await dialogProps?.onSubmit({ nick: 'Raine' });
        });
        dialogProps?.onDone();

        expect(setMyPlaceProfile).toHaveBeenCalledWith({ nick: 'Raine' });
        expect(finishProfile).toHaveBeenCalled();
    });

    it('lets the invitee leave after a failed save, and leaving still enters the room', async () => {
        acceptState.profilePending = true;
        setMyPlaceProfile.mockRejectedValue(new Error('save failed'));
        render(<CloudInviteAccept params={params} />);

        await act(async () => {
            await expect(dialogProps?.onSubmit({ nick: 'Raine' })).rejects.toThrow('save failed');
        });

        expect(dialogProps?.dismissible).toBe(true);
        dialogProps?.onExit();
        expect(finishProfile).toHaveBeenCalled();
    });
});
