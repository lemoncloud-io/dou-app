import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import type { DomainPlaceMember } from '@chatic/data';

import type { PlaceMembersStatus } from '../../place/hooks/usePlaceMembers';

const startDm = jest.fn();
const navigate = jest.fn();
const retry = jest.fn();
const usePlaceMembers = jest.fn();
const useChannelProfiles = jest.fn();

let mockMembers: DomainPlaceMember[] = [];
let mockStatus: PlaceMembersStatus = 'ready';
let mockProfiles = new Map<string, { nick?: string; thumbnail?: string }>();
let mockIsStarting = false;
let mockIsAvailable = true;

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useSessionSelection: () => ({ selectedCloudId: 'cloud-a', selectedSiteId: 'p1' }),
            // My session id and my id in this cloud differ on purpose: both have to be left out.
            useSessionIdentity: () => ({ userId: 'me-session' }),
            useUidInCloud: () => 'me-cloud',
        },
    },
}));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigate }));
jest.mock('../../../hooks', () => ({ useSelectedCloudId: () => 'cloud-a' }));
// The real `ui` barrel pulls `@chatic/assets` through PrivateLayout, which jest cannot parse.
jest.mock('../../../ui/components', () => ({ PageHeader: ({ title }: { title: string }) => <div>{title}</div> }));
jest.mock('@chatic/web-ui-kit', () => ({
    SearchInput: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
        <input aria-label="search" value={value} onChange={e => onChange(e.target.value)} />
    ),
    ListRow: ({ title, onClick, disabled }: { title: string; onClick: () => void; disabled?: boolean }) => (
        <button data-testid={`cand-${title}`} onClick={onClick} disabled={disabled}>
            {title}
        </button>
    ),
    Text: ({ children }: { children: unknown }) => <p>{children as string}</p>,
    ImageAvatar: () => <img alt="" />,
    DefaultAvatar: () => <div />,
}));
jest.mock('../../place/hooks/usePlaceMembers', () => ({
    usePlaceMembers: (placeId: string | null) => usePlaceMembers(placeId),
}));
jest.mock('../hooks', () => ({
    useChannelProfiles: (placeId: string | null, ids: string[]) => useChannelProfiles(placeId, ids),
    useStartDm: () => ({ startDm, isStarting: mockIsStarting, isAvailable: mockIsAvailable }),
}));

import { CloudDmPickerPage } from './CloudDmPickerPage';

const member = (id: string, extra: Partial<DomainPlaceMember> = {}): DomainPlaceMember => ({
    id,
    cid: 'cloud-a',
    ...extra,
});

/** The candidate rows' names, top to bottom. */
const rowNames = () => screen.queryAllByTestId(/^cand-/).map(el => el.textContent);

beforeEach(() => {
    jest.clearAllMocks();
    mockMembers = [];
    mockStatus = 'ready';
    mockProfiles = new Map();
    mockIsStarting = false;
    mockIsAvailable = true;
    usePlaceMembers.mockImplementation(() => ({ members: mockMembers, status: mockStatus, retry }));
    useChannelProfiles.mockImplementation(() => ({ profileMap: mockProfiles }));
    startDm.mockResolvedValue({ id: 'dm-1' });
});

describe('CloudDmPickerPage — the candidates', () => {
    it('reads the members of the session place', () => {
        render(<CloudDmPickerPage />);

        expect(usePlaceMembers).toHaveBeenCalledWith('p1');
        expect(useChannelProfiles).toHaveBeenCalledWith('p1', []);
    });

    it('lists the place members without me', () => {
        mockMembers = [
            member('me-cloud', { nick: 'Me in cloud' }),
            member('u1', { nick: 'Bora' }),
            member('me-session', { nick: 'Me in session' }),
            member('u2', { nick: 'Dana' }),
        ];

        render(<CloudDmPickerPage />);

        expect(rowNames()).toEqual(['Bora', 'Dana']);
    });

    it('prefers the place profile nick over the member row', () => {
        mockMembers = [member('u1', { nick: 'Row nick' })];
        mockProfiles = new Map([['u1', { nick: 'Profile nick' }]]);

        render(<CloudDmPickerPage />);

        expect(rowNames()).toEqual(['Profile nick']);
    });

    // The shared naming chain, not a copy of it: with nothing to name them by it reaches the label
    // rather than printing the raw account id.
    it('falls back to the unknown label rather than an account id', () => {
        mockMembers = [member('b3f1-uuid')];

        render(<CloudDmPickerPage />);

        expect(rowNames()).toEqual(['chat.unknownUser']);
        expect(screen.queryByText('b3f1-uuid')).not.toBeInTheDocument();
    });
});

describe('CloudDmPickerPage — picking', () => {
    // One tap IS the action; there is no confirm step, so nothing can be selected and left unsent.
    it('opens the 1:1 with that member on a single tap, replacing the picker in history', () => {
        mockMembers = [member('u1', { nick: 'Bora' }), member('u2', { nick: 'Dana' })];

        render(<CloudDmPickerPage />);
        fireEvent.click(screen.getByTestId('cand-Dana'));

        expect(startDm).toHaveBeenCalledTimes(1);
        expect(startDm).toHaveBeenCalledWith('u2', { replace: true });
    });

    it('disables the rows while a 1:1 is being opened', () => {
        mockMembers = [member('u1', { nick: 'Bora' })];
        mockIsStarting = true;

        render(<CloudDmPickerPage />);

        expect(screen.getByTestId('cand-Bora')).toBeDisabled();
    });
});

describe('CloudDmPickerPage — search', () => {
    it('filters the rows by name, ignoring case', () => {
        mockMembers = [member('u1', { nick: 'Bora' }), member('u2', { nick: 'Dana' })];

        render(<CloudDmPickerPage />);
        fireEvent.change(screen.getByLabelText('search'), { target: { value: 'bor' } });

        expect(rowNames()).toEqual(['Bora']);
    });

    // "Nobody here" and "nothing matched what I typed" are different facts; the empty body says which.
    it('says nothing matched when the search hides every row', () => {
        mockMembers = [member('u1', { nick: 'Bora' })];

        render(<CloudDmPickerPage />);
        fireEvent.change(screen.getByLabelText('search'), { target: { value: 'zzz' } });

        expect(rowNames()).toEqual([]);
        expect(screen.getByText('cloudDm.picker.noMatch')).toBeInTheDocument();
        expect(screen.queryByText('cloudDm.picker.empty')).not.toBeInTheDocument();
    });
});

describe('CloudDmPickerPage — states', () => {
    it('shows the empty state when the place has nobody but me', () => {
        mockMembers = [member('me-cloud')];

        render(<CloudDmPickerPage />);

        expect(screen.getByText('cloudDm.picker.empty')).toBeInTheDocument();
        expect(screen.getByText('cloudDm.picker.emptyHint')).toBeInTheDocument();
    });

    // A place whose read has not landed is not an empty one, and must not claim to be.
    it('shows loading and claims nothing while the read is out', () => {
        mockStatus = 'loading';

        render(<CloudDmPickerPage />);

        expect(screen.getByRole('status')).toHaveTextContent('cloudDm.picker.loading');
        expect(screen.queryByText('cloudDm.picker.empty')).not.toBeInTheDocument();
    });

    it.each<PlaceMembersStatus>(['error', 'forbidden'])('offers a retry when the read ends in %s', status => {
        mockStatus = status;

        render(<CloudDmPickerPage />);

        expect(screen.getByText('cloudDm.picker.loadFailed')).toBeInTheDocument();
        fireEvent.click(screen.getByText('cloudDm.picker.retry'));
        expect(retry).toHaveBeenCalledTimes(1);
        expect(screen.queryByText('cloudDm.picker.empty')).not.toBeInTheDocument();
    });
});

describe('CloudDmPickerPage — where a cloud 1:1 cannot open', () => {
    it('stays put and reads the session place when a cloud 1:1 can open', () => {
        render(<CloudDmPickerPage />);

        expect(navigate).not.toHaveBeenCalled();
        expect(usePlaceMembers).toHaveBeenCalledWith('p1');
    });

    // Reached on the relay or with no place (back after a push moved the session), the screen goes
    // home instead of listing people a tap could never reach.
    it('goes home with replace, renders nothing and reads no members', () => {
        mockIsAvailable = false;
        mockMembers = [member('u1', { nick: 'Bora' })];

        const { container } = render(<CloudDmPickerPage />);

        expect(navigate).toHaveBeenCalledWith('/', { replace: true });
        expect(container).toBeEmptyDOMElement();
        expect(usePlaceMembers).toHaveBeenCalledWith(null);
        expect(usePlaceMembers).not.toHaveBeenCalledWith('p1');
    });
});
