import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { SetupWizardPage } from './SetupWizardPage';

const updateCloudName = jest.fn();
const createPlace = jest.fn();
const switchSite = jest.fn();
const setMyPlaceProfile = jest.fn();
const navigate = jest.fn();
const toast = jest.fn();
// One ordered record of the calls that matter, so a test can assert the switch came first.
const calls: string[] = [];

jest.mock('../../../hooks', () => ({
    useUpdateCloudProfile: () => ({ mutateAsync: updateCloudName }),
    useCreatePlace: () => ({ createPlace }),
    useSetMyPlaceProfile: () => setMyPlaceProfile,
    usePickImage: () => ({ open: jest.fn(), inputProps: { type: 'file', hidden: true } }),
}));
jest.mock('../../../runtime/useSiteSwitch', () => ({ useSiteSwitch: () => ({ switchSite }) }));
jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useSessionSelection: () => ({ selectedCloudId: 'cloud-1', selectedSiteId: 'previous-site' }),
        },
    },
}));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigate }));
jest.mock('@chatic/bridges', () => ({ logger: { error: jest.fn() } }));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

const type = (value: string) => fireEvent.change(screen.getByRole('textbox'), { target: { value } });
const next = () => screen.getByRole('button', { name: 'setupWizard.next' });
const done = () => screen.getByRole('button', { name: 'setupWizard.done' });

const reachPlaceStep = async () => {
    type('My cloud');
    fireEvent.click(next());
    await waitFor(() => expect(screen.getByText('2/3')).toBeInTheDocument());
};

/** Walks steps 1 and 2 so the test starts on the profile step. */
const reachProfileStep = async () => {
    await reachPlaceStep();
    type('Book club');
    fireEvent.click(next());
    await waitFor(() => expect(screen.getByText('3/3')).toBeInTheDocument());
};

beforeEach(() => {
    jest.clearAllMocks();
    calls.length = 0;
    updateCloudName.mockResolvedValue(undefined);
    createPlace.mockImplementation(async () => {
        calls.push('create');
        return { id: 'new-site' };
    });
    switchSite.mockImplementation(async (id: string) => {
        calls.push(`switch:${id}`);
    });
    setMyPlaceProfile.mockImplementation(async () => {
        calls.push('profile');
    });
});

describe('SetupWizardPage', () => {
    it('switches into the created place before writing the profile there', async () => {
        render(<SetupWizardPage />);
        await reachProfileStep();

        type('  Raine  ');
        fireEvent.click(done());

        await waitFor(() => expect(navigate).toHaveBeenCalledWith('/', { replace: true }));
        expect(calls).toEqual(['create', 'switch:new-site', 'profile']);
        expect(setMyPlaceProfile).toHaveBeenCalledWith({ nick: 'Raine', thumbnail: undefined });
    });

    it('stays on step 2 when the switch fails, and a retry switches again without creating a second place', async () => {
        switchSite.mockRejectedValueOnce(new Error('403'));
        render(<SetupWizardPage />);
        await reachPlaceStep();

        type('Book club');
        fireEvent.click(next());
        await waitFor(() =>
            expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'setupWizard.saveError' }))
        );
        expect(screen.getByText('2/3')).toBeInTheDocument();

        fireEvent.click(next());
        await waitFor(() => expect(screen.getByText('3/3')).toBeInTheDocument());

        expect(createPlace).toHaveBeenCalledTimes(1);
        expect(switchSite).toHaveBeenNthCalledWith(2, 'new-site');
        expect(setMyPlaceProfile).not.toHaveBeenCalled();
    });

    it('stays on step 2 and neither switches nor writes a profile when creating the place fails', async () => {
        createPlace.mockRejectedValue(new Error('nope'));
        render(<SetupWizardPage />);
        await reachPlaceStep();

        type('Book club');
        fireEvent.click(next());

        await waitFor(() =>
            expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'setupWizard.saveError' }))
        );
        expect(screen.getByText('2/3')).toBeInTheDocument();
        expect(switchSite).not.toHaveBeenCalled();
        expect(setMyPlaceProfile).not.toHaveBeenCalled();
    });
});
