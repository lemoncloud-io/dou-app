import '@testing-library/jest-dom';

import { act, render, screen } from '@testing-library/react';

import type { InviteParams } from '../types';

const finishProfile = jest.fn();
const setMyPlaceProfile = jest.fn();
let acceptState: Record<string, unknown> = {};
// What the invite lookup answers: the screen waits on it before offering Accept.
let inviteInfo: { data?: unknown; error?: Error | null; fetchStatus?: 'fetching' | 'paused' | 'idle' } = {};
// What the dialog stub last received, so a test can drive its submit and read its dismissibility.
let activePlaceName = 'Book club';
// What the screen stub last received, so a test can read the values this component fills it with.
let screenProps: Record<string, unknown> = {};
let dialogProps: {
    dismissible?: boolean;
    placeName: string;
    onSubmit: (value: { nick: string }) => Promise<void>;
    onDone: () => void;
    onExit: () => void;
} | null = null;

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/bridges', () => ({ logger: { info: jest.fn() } }));
jest.mock('@chatic/web-ui-kit', () => ({
    AlertDialog: ({ title }: { title: React.ReactNode }) => <div role="alertdialog">{title}</div>,
}));
jest.mock('@chatic/app-runtime', () => ({
    runtime: { session: { useInviteInfo: () => inviteInfo } },
}));
jest.mock('../../../../runtime/useSessionLogout', () => ({ useSessionLogout: () => jest.fn() }));
jest.mock('../../../../navigation', () => ({ useStackNavigate: () => jest.fn() }));
jest.mock('../../hooks/useInviteCountdown', () => ({ useInviteCountdown: () => null }));
jest.mock('../hooks', () => ({
    useInviteAccept: () => acceptState,
    // The mapping itself is covered with the pipeline; here only its two outcomes matter.
    resolveInviteErrorKey: (_step: string, error: Error) =>
        error.message.includes('404') ? 'inviteAccept.expired' : 'inviteAccept.failed',
}));
jest.mock('../../../../hooks', () => ({
    useSetMyPlaceProfile: () => setMyPlaceProfile,
    useActivePlaceName: () => activePlaceName,
}));
jest.mock('./InviteAcceptScreen', () => ({
    InviteAcceptScreen: (props: Record<string, unknown>) => {
        screenProps = props;
        return <div>accept-screen</div>;
    },
}));
jest.mock('./InviteAcceptLoading', () => ({ InviteAcceptLoading: () => <div>accept-loading</div> }));
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
    screenProps = {};
    activePlaceName = 'Book club';
    inviteInfo = { data: { site$: { name: 'Invite copy' } }, error: null, fetchStatus: 'idle' };
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

describe('CloudInviteAccept — waiting for the invite lookup', () => {
    it('holds on the loading screen, with no Accept to press, until the lookup answers', () => {
        inviteInfo = { data: undefined, error: null, fetchStatus: 'fetching' };
        render(<CloudInviteAccept params={params} />);

        expect(screen.getByText('accept-loading')).toBeInTheDocument();
        expect(screen.queryByText('accept-screen')).not.toBeInTheDocument();
    });

    it('shows the expired notice when the lookup says the invite is gone', () => {
        inviteInfo = { data: undefined, error: new Error('404 NOT FOUND - invite') };
        render(<CloudInviteAccept params={params} />);

        expect(screen.getByRole('alertdialog')).toHaveTextContent('inviteAccept.dialog.expired.title');
        expect(screen.queryByText('accept-screen')).not.toBeInTheDocument();
    });

    it('shows the generic notice when the lookup fails for any other reason', () => {
        inviteInfo = { data: undefined, error: new Error('500 boom') };
        render(<CloudInviteAccept params={params} />);

        expect(screen.getByRole('alertdialog')).toHaveTextContent('inviteAccept.dialog.generic.title');
    });

    it('shows the generic notice instead of spinning when the lookup can never run', () => {
        // A disabled query (no address to ask) sits idle with neither data nor an error.
        inviteInfo = { data: undefined, error: null, fetchStatus: 'idle' };
        render(<CloudInviteAccept params={params} />);

        expect(screen.getByRole('alertdialog')).toHaveTextContent('inviteAccept.dialog.generic.title');
        expect(screen.queryByText('accept-loading')).not.toBeInTheDocument();
    });

    it('keeps the accept screen when a refetch fails after the invite was read', () => {
        inviteInfo = { data: { site$: { name: 'Invite copy' } }, error: new Error('500 boom') };
        render(<CloudInviteAccept params={params} />);

        expect(screen.getByText('accept-screen')).toBeInTheDocument();
    });
});

describe('CloudInviteAccept — what the accept screen is told', () => {
    const open = (data: Record<string, unknown>) => {
        inviteInfo = { data, error: null, fetchStatus: 'idle' };
        render(<CloudInviteAccept params={params} />);
    };

    it('names the inviter by the place nickname', () => {
        open({ inviter$: { name: 'Account Name', nick: 'Sunny' } });

        expect(screen.getByText('accept-screen')).toBeInTheDocument();
        expect(screenProps.inviterName).toBe('Sunny');
    });

    it.each([
        ['no nickname, only an account name', { name: 'Account Name' }],
        ['a blank nickname', { name: 'Account Name', nick: '   ' }],
        ['an empty nickname', { name: 'Account Name', nick: '' }],
        ['no inviter at all', undefined],
    ])('passes no name, never the account name, for %s', (_label, inviter) => {
        open({ inviter$: inviter });

        expect(screenProps.inviterName).toBeUndefined();
    });

    it('trims the nickname', () => {
        open({ inviter$: { nick: '  Sunny  ' } });

        expect(screenProps.inviterName).toBe('Sunny');
    });

    it('passes the group room name as the card name', () => {
        open({ channelId: 'ch-1', channelName: '  독서 모임  ' });

        expect(screenProps.targetKind).toBe('group');
        expect(screenProps.targetName).toBe('독서 모임');
    });

    it.each([
        ['absent', undefined],
        ['blank', '  '],
    ])('passes no card name when the room name is %s', (_l, name) => {
        open({ channelId: 'ch-1', channelName: name });

        expect(screenProps.targetKind).toBe('group');
        expect(screenProps.targetName).toBeUndefined();
    });

    it('tells the screen a place invite is a place invite', () => {
        open({ site$: { id: '10002', name: '우리 팀' } });

        expect(screenProps.targetKind).toBe('place');
    });

    it('shows a cloud place under its own name', () => {
        open({ site$: { id: '10002', name: '우리 팀' } });

        expect(screenProps.placeName).toBe('우리 팀');
    });

    it('does not brand a cloud place as the relay home, whatever the backend called it', () => {
        // The context comes from the invite kind, not from the current selection: a cloud invite opened
        // while the relay is selected must not turn into "DoU Home".
        open({ site$: { id: '10002', name: 'default' } });

        expect(screenProps.placeName).toBe('default');
    });

    it('passes no place name when the invite has no place', () => {
        open({});

        expect(screenProps.placeName).toBeUndefined();
    });

    it('titles the profile step with the invite place when the active place has no name yet', () => {
        activePlaceName = '';
        acceptState.profilePending = true;
        open({ site$: { id: '10002', name: '우리 팀' } });

        expect(dialogProps?.placeName).toBe('우리 팀');
    });
});

describe('CloudInviteAccept — a link past its grace period', () => {
    it('shows the already-joined notice for the used-link key, not the expired one', () => {
        acceptState.errorKey = 'inviteAccept.alreadyUsed';
        render(<CloudInviteAccept params={params} />);

        expect(screen.getByRole('alertdialog')).toHaveTextContent('inviteAccept.dialog.alreadyJoined.title');
    });

    it('still shows the expired notice for the expired key', () => {
        acceptState.errorKey = 'inviteAccept.expired';
        render(<CloudInviteAccept params={params} />);

        expect(screen.getByRole('alertdialog')).toHaveTextContent('inviteAccept.dialog.expired.title');
    });
});
