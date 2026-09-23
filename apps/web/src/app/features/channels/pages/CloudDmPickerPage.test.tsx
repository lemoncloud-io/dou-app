import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { DomainProfile } from '@chatic/data';

const toast = jest.fn();
const startDm = jest.fn();

let mockCandidateIds: string[] = [];
let mockIsLoading = false;
let mockProfiles: Array<[string, Partial<DomainProfile>]> = [];
let mockUsers: Array<[string, { id: string; name?: string }]> = [];

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k }),
}));
jest.mock('@chatic/app-runtime', () => ({
    runtime: { session: { useSessionSelection: () => ({ selectedSiteId: 'S:active' }) } },
}));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('../../../ui/components', () => ({ PageHeader: ({ title }: any) => <div>{title}</div> }));
jest.mock('@chatic/web-ui-kit', () => ({
    SearchInput: ({ value, onChange }: any) => (
        <input aria-label="search" value={value} onChange={e => onChange(e.target.value)} />
    ),
    ListRow: ({ title, onClick, disabled }: any) => (
        <button data-testid={`cand-${title}`} onClick={onClick} disabled={disabled}>
            {title}
        </button>
    ),
    Text: ({ children }: any) => <p>{children}</p>,
    ImageAvatar: () => <img alt="" />,
    DefaultAvatar: () => <div />,
}));
jest.mock('../hooks', () => ({
    LIST_PROFILE_SYNC_INTERVAL_MS: 60_000,
    useCloudDmCandidates: () => ({ candidateIds: mockCandidateIds, isLoading: mockIsLoading }),
    useChannelProfiles: () => ({ profileMap: new Map(mockProfiles) }),
    useUserRecords: () => new Map(mockUsers),
    useStartDm: () => ({ startDm, isStarting: false, isError: false }),
}));

import { CloudDmPickerPage } from './CloudDmPickerPage';

beforeEach(() => {
    jest.clearAllMocks();
    mockCandidateIds = [];
    mockIsLoading = false;
    mockProfiles = [];
    mockUsers = [];
    startDm.mockResolvedValue({ id: 'dm-1' });
});

describe('CloudDmPickerPage — drawing candidates', () => {
    it('names people by their place profile nick', () => {
        mockCandidateIds = ['u1'];
        mockProfiles = [['u1', { nick: '토끼' } as Partial<DomainProfile>]];

        render(<CloudDmPickerPage />);

        expect(screen.getByTestId('cand-토끼')).toBeInTheDocument();
    });

    // The shared chain, not a copy of it: with no profile and no cached name it must reach the
    // label rather than printing the raw account id.
    it('falls to the label rather than an account id', () => {
        mockCandidateIds = ['b3f1-uuid'];

        render(<CloudDmPickerPage />);

        expect(screen.getByTestId('cand-chat.unknownUser')).toBeInTheDocument();
        expect(screen.queryByText('b3f1-uuid')).not.toBeInTheDocument();
    });
});

describe('CloudDmPickerPage — picking', () => {
    // One tap IS the action; there is no confirm step, so nothing can be selected and left unsent.
    it('opens the 1:1 on a single tap', async () => {
        mockCandidateIds = ['u1'];
        mockProfiles = [['u1', { nick: '토끼' } as Partial<DomainProfile>]];

        render(<CloudDmPickerPage />);
        fireEvent.click(screen.getByTestId('cand-토끼'));

        await waitFor(() => expect(startDm).toHaveBeenCalledWith('u1'));
    });

    // `startDm` navigates itself and answers null on failure, so this screen's whole job on a
    // failure is to say so — and to stay put, which is what not navigating means here.
    it('says so when the room could not be opened', async () => {
        mockCandidateIds = ['u1'];
        mockProfiles = [['u1', { nick: '토끼' } as Partial<DomainProfile>]];
        startDm.mockResolvedValue(null);

        render(<CloudDmPickerPage />);
        fireEvent.click(screen.getByTestId('cand-토끼'));

        await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: 'cloudDm.picker.failed' }));
    });

    it('stays quiet when it worked', async () => {
        mockCandidateIds = ['u1'];
        mockProfiles = [['u1', { nick: '토끼' } as Partial<DomainProfile>]];

        render(<CloudDmPickerPage />);
        fireEvent.click(screen.getByTestId('cand-토끼'));

        await waitFor(() => expect(startDm).toHaveBeenCalled());
        expect(toast).not.toHaveBeenCalled();
    });
});

describe('CloudDmPickerPage — search and empty', () => {
    it('filters by name', () => {
        mockCandidateIds = ['u1', 'u2'];
        mockProfiles = [
            ['u1', { nick: '토끼' } as Partial<DomainProfile>],
            ['u2', { nick: '거북이' } as Partial<DomainProfile>],
        ];

        render(<CloudDmPickerPage />);
        fireEvent.change(screen.getByLabelText('search'), { target: { value: '토끼' } });

        expect(screen.getByTestId('cand-토끼')).toBeInTheDocument();
        expect(screen.queryByTestId('cand-거북이')).not.toBeInTheDocument();
    });

    // "Nobody shares a room with me" and "nothing matched what I typed" are different facts, and
    // the empty body has to say which one it is.
    it('tells an empty cloud apart from an empty search', () => {
        render(<CloudDmPickerPage />);
        expect(screen.getByText('cloudDm.picker.empty')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('search'), { target: { value: 'zzz' } });
        expect(screen.getByText('cloudDm.picker.noMatch')).toBeInTheDocument();
    });

    // A cloud whose read has not landed is not an empty one, and must not claim to be.
    it('claims nothing while the read is still out', () => {
        mockIsLoading = true;

        render(<CloudDmPickerPage />);

        expect(screen.queryByText('cloudDm.picker.empty')).not.toBeInTheDocument();
    });
});
