import '@testing-library/jest-dom';

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import type { DomainPlaceMember } from '@chatic/data';

type MembersAnswer = { members: DomainPlaceMember[]; context: { cid: string; sid: string }; profiles: string };

let mockPlace: { id: string; isOwner?: boolean } | null = null;
let mockVerified = true;
let mockProfiles = new Map<string, { nick?: string; thumbnail?: string }>();
const navigate = jest.fn();
const toast = jest.fn();
const listPlaceMembers = jest.fn((_query: { placeId: string; sessionPlaceId: string | null }) =>
    Promise.resolve<MembersAnswer>({ members: [], context: { cid: 'cloud-a', sid: 'p1' }, profiles: 'loaded' })
);
const removeMember = jest.fn((_placeId: string, _userId: string) => Promise.resolve({}));
const observeItem = jest.fn((_id: string, cb: (item: unknown) => void) => {
    cb(mockPlace);
    return jest.fn();
});

const repositories = { user: { listPlaceMembers }, place: { observeItem, removeMember } };

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options?: Record<string, unknown>) =>
            options && 'name' in options ? `${key}:${options.name}` : key,
    }),
}));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigate }));
jest.mock('@chatic/bridges', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useSessionIdentity: () => ({ userId: 'me' }),
            useSessionSelection: () => ({ selectedCloudId: 'cloud-a', selectedSiteId: 'p1' }),
            useUidInCloud: () => 'me',
            SWITCH_SITE_MUTATION_KEY: ['switch-site'],
            SWITCH_CLOUD_MUTATION_KEY: ['switch-cloud'],
        },
        connection: { useCloudVerified: () => mockVerified },
        // One object for the session, as the runtime's is.
        data: { useRuntimeRepositories: () => repositories },
    },
}));
jest.mock('@tanstack/react-query', () => ({ useIsMutating: () => 0 }));
jest.mock('react-router-dom', () => ({ useParams: () => ({ placeId: 'p1' }) }));
jest.mock('../../../hooks', () => ({ useSelectedCloudId: () => 'cloud-a' }));
// The real `ui` barrel pulls `@chatic/assets` through PrivateLayout, which jest cannot parse.
jest.mock('../../../ui', () => ({ PageHeader: ({ title }: { title: string }) => <div>header:{title}</div> }));
jest.mock('../../channels/hooks', () => ({ useChannelProfiles: () => ({ profileMap: mockProfiles }) }));

import { PlaceMembersPage } from './PlaceMembersPage';

const member = (id: string, extra: Partial<DomainPlaceMember> = {}): DomainPlaceMember => ({
    id,
    cid: 'cloud-a',
    ...extra,
});
const answer = (members: DomainPlaceMember[], context = { cid: 'cloud-a', sid: 'p1' }, profiles = 'loaded') =>
    listPlaceMembers.mockResolvedValue({ members, context, profiles });

/** The member rows' names, top to bottom (the header and the count label are not rows). */
const rowNames = () =>
    screen.getAllByText((_, el) => el?.tagName === 'SPAN' && el.className === 'truncate').map(el => el.textContent);
/** The whole row a name sits in — the row's root is the first `div` above the name. */
const rowOf = (name: string) => screen.getByText(name).closest('div') as HTMLElement;

const renderSettled = async () => {
    render(<PlaceMembersPage />);
    await waitFor(() => expect(listPlaceMembers).toHaveBeenCalled());
    // A macrotask, not a single microtask: the answer's then/catch chain takes more than one tick to
    // reach state, and under a loaded runner a one-tick flush read the screen before it had.
    await act(() => new Promise(resolve => setTimeout(resolve, 0)));
};

beforeEach(() => {
    jest.clearAllMocks();
    mockPlace = { id: 'p1', isOwner: false };
    mockProfiles = new Map();
    mockVerified = true;
    answer([]);
});

describe('PlaceMembersPage — the list', () => {
    it('puts the owner first, then me, then everyone else in server order, with their badges', async () => {
        answer([
            member('u-2', { nick: 'Bora' }),
            member('me', { nick: 'Mina' }),
            member('u-3', { nick: 'Chul' }),
            member('owner', { nick: 'Olivia', isOwner: true }),
        ]);

        await renderSettled();

        expect(rowNames()).toEqual(['Olivia', 'Mina', 'Bora', 'Chul']);
        expect(screen.getByText('chat.settings.badge.owner')).toBeInTheDocument();
        expect(screen.getByText('placeMembers.badge.me')).toBeInTheDocument();
        // The count is the rows received.
        expect(screen.getByText('placeMembers.count')).toBeInTheDocument();
    });

    it('reads the session place for profiles and asks only once', async () => {
        await renderSettled();

        expect(listPlaceMembers).toHaveBeenCalledTimes(1);
        expect(listPlaceMembers).toHaveBeenCalledWith({ placeId: 'p1', sessionPlaceId: 'p1' });
    });

    it('names a member by their place profile first, and by their own name when no profile was loaded', async () => {
        mockProfiles = new Map([['u-2', { nick: 'Bora in this place', thumbnail: 'https://img/b.png' }]]);
        answer([member('u-2', { nick: 'Bora' }), member('u-3', { name: 'Chul' })], undefined, 'skipped');

        await renderSettled();

        expect(rowNames()).toEqual(['Bora in this place', 'Chul']);
        expect(screen.getByAltText('Bora in this place')).toHaveAttribute('src', 'https://img/b.png');
    });

    it('drops an answer that names another place', async () => {
        answer([member('u-9', { nick: 'Elsewhere' })], { cid: 'cloud-a', sid: 'p2' });

        await renderSettled();

        expect(screen.queryByText('Elsewhere')).not.toBeInTheDocument();
        expect(screen.getByText('placeMembers.loading')).toBeInTheDocument();
    });

    it('shows an error with a retry when the list fails, and offers no stand-in list', async () => {
        listPlaceMembers.mockRejectedValueOnce(new Error('500 INTERNAL'));

        await renderSettled();

        expect(screen.getByText('placeMembers.loadFailed')).toBeInTheDocument();
        expect(screen.queryByText('placeMembers.count')).not.toBeInTheDocument();

        answer([member('u-2', { nick: 'Bora' })]);
        fireEvent.click(screen.getByText('placeMembers.retry'));
        await waitFor(() => expect(screen.getByText('Bora')).toBeInTheDocument());
        expect(listPlaceMembers).toHaveBeenCalledTimes(2);
    });

    it('goes back to the place settings when the server says I am not a member', async () => {
        listPlaceMembers.mockRejectedValueOnce(new Error('403 FORBIDDEN - not a member'));

        await renderSettled();

        expect(toast).toHaveBeenCalledWith({ title: 'placeMembers.notMember' });
        expect(navigate).toHaveBeenCalledWith('/place/p1/settings', { replace: true });
    });
});

describe('PlaceMembersPage — removing a member', () => {
    const roster = [member('owner', { nick: 'Olivia', isOwner: true }), member('me', { nick: 'Mina' })];

    it('gives the owner a Remove on every row but their own and the owner row', async () => {
        mockPlace = { id: 'p1', isOwner: true };
        answer([member('me', { nick: 'Mina', isOwner: true }), member('u-2', { nick: 'Bora' }), member('u-3')]);

        await renderSettled();

        expect(screen.getAllByText('placeMembers.remove')).toHaveLength(2);
        expect(within(rowOf('Mina')).queryByText('placeMembers.remove')).not.toBeInTheDocument();
        expect(within(rowOf('Bora')).getByText('placeMembers.remove')).toBeInTheDocument();
    });

    it('gives a member who is not the owner no Remove at all', async () => {
        answer([...roster, member('u-2', { nick: 'Bora' })]);

        await renderSettled();

        expect(screen.queryByText('placeMembers.remove')).not.toBeInTheDocument();
    });

    it('removes the confirmed member, drops only that row and does not read the list again', async () => {
        mockPlace = { id: 'p1', isOwner: true };
        answer([
            member('me', { nick: 'Mina', isOwner: true }),
            member('u-2', { nick: 'Bora' }),
            member('u-3', { nick: 'Chul' }),
        ]);
        await renderSettled();

        fireEvent.click(within(rowOf('Bora')).getByText('placeMembers.remove'));
        expect(screen.getByText('placeMembers.removeDialog.title:Bora')).toBeInTheDocument();
        await act(async () => {
            fireEvent.click(within(screen.getByRole('alertdialog')).getByText('placeMembers.removeDialog.confirm'));
        });

        expect(removeMember).toHaveBeenCalledWith('p1', 'u-2');
        expect(screen.queryByText('Bora')).not.toBeInTheDocument();
        expect(screen.getByText('Chul')).toBeInTheDocument();
        expect(toast).toHaveBeenCalledWith({ title: 'placeMembers.removed:Bora' });
        expect(listPlaceMembers).toHaveBeenCalledTimes(1);
    });

    it('keeps a removed member out when the list is read again while the screen is open', async () => {
        mockPlace = { id: 'p1', isOwner: true };
        // The server's list catches up late: a read straight after still names her.
        answer([member('me', { nick: 'Mina', isOwner: true }), member('u-2', { nick: 'Bora' })]);
        const { rerender } = render(<PlaceMembersPage />);
        await act(() => new Promise(resolve => setTimeout(resolve, 0)));
        fireEvent.click(within(rowOf('Bora')).getByText('placeMembers.remove'));
        await act(async () => {
            fireEvent.click(within(screen.getByRole('alertdialog')).getByText('placeMembers.removeDialog.confirm'));
        });

        // The socket drops and comes back, which reads the list again.
        mockVerified = false;
        rerender(<PlaceMembersPage />);
        mockVerified = true;
        rerender(<PlaceMembersPage />);
        await act(() => new Promise(resolve => setTimeout(resolve, 0)));

        expect(listPlaceMembers).toHaveBeenCalledTimes(2);
        expect(screen.getByText('Mina')).toBeInTheDocument();
        expect(screen.queryByText('Bora')).not.toBeInTheDocument();
    });

    it('keeps the row and says why when the removal fails', async () => {
        mockPlace = { id: 'p1', isOwner: true };
        answer([member('me', { nick: 'Mina', isOwner: true }), member('u-2', { nick: 'Bora' })]);
        removeMember.mockRejectedValueOnce(new Error('403 FORBIDDEN - not the owner'));
        await renderSettled();

        fireEvent.click(within(rowOf('Bora')).getByText('placeMembers.remove'));
        await act(async () => {
            fireEvent.click(within(screen.getByRole('alertdialog')).getByText('placeMembers.removeDialog.confirm'));
        });

        expect(toast).toHaveBeenCalledWith({ title: 'placeMembers.removeDenied', variant: 'destructive' });
        expect(screen.getByText('Bora')).toBeInTheDocument();
    });

    it('disables only the row being removed while the request runs', async () => {
        mockPlace = { id: 'p1', isOwner: true };
        answer([
            member('me', { nick: 'Mina', isOwner: true }),
            member('u-2', { nick: 'Bora' }),
            member('u-3', { nick: 'Chul' }),
        ]);
        let finish!: () => void;
        removeMember.mockImplementationOnce(() => new Promise(resolve => (finish = () => resolve({}))));
        await renderSettled();

        fireEvent.click(within(rowOf('Bora')).getByText('placeMembers.remove'));
        fireEvent.click(within(screen.getByRole('alertdialog')).getByText('placeMembers.removeDialog.confirm'));

        expect(within(rowOf('Bora')).getByText('placeMembers.remove').closest('button')).toBeDisabled();
        expect(within(rowOf('Chul')).getByText('placeMembers.remove').closest('button')).toBeEnabled();
        await act(async () => finish());
    });
});
