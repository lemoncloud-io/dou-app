import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ProfileEditPage } from './ProfileEditPage';

const navigate = jest.fn();
const toast = jest.fn();
const updateProfile = jest.fn();

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts?.max ? `${key}:${opts.max}` : key),
    }),
}));
jest.mock('@chatic/bridges', () => ({ logger: { error: jest.fn(), warn: jest.fn() } }));
jest.mock('@chatic/shared', () => ({
    useNavigateWithTransition: () => navigate,
    AVATAR_IMAGE: {},
    prepareImage: jest.fn(),
}));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('../hooks', () => ({ useUpdateProfile: () => ({ mutateAsync: updateProfile, isPending: false }) }));
jest.mock('../../../hooks', () => ({ useMyUser: () => ({ name: 'Raine', photo: '' }) }));
jest.mock('../../../ui/components', () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
// The real layout reaches the keyboard bridge; the page's content and footer are what is under test.
jest.mock('../../../ui/layouts', () => ({
    fixedViewportScreen: '',
    KeyboardAwareLayout: ({ header, footer, children }: Record<string, React.ReactNode>) => (
        <div>
            {header}
            {children}
            {footer}
        </div>
    ),
}));

beforeEach(() => jest.clearAllMocks());

describe('ProfileEditPage', () => {
    it('states the real name limit, 30 characters', () => {
        render(<ProfileEditPage />);

        expect(screen.getByText('profileEdit.nameHint:30')).toBeInTheDocument();
    });

    it('says the profile is set, then goes back, once a save succeeds', async () => {
        updateProfile.mockResolvedValue({});
        render(<ProfileEditPage />);

        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Raine Lee' } });
        fireEvent.click(screen.getByText('profileEdit.save'));

        await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: 'profileEdit.saveSuccess' }));
        expect(updateProfile).toHaveBeenCalledWith({ name: 'Raine Lee', photo: undefined });
        expect(navigate).toHaveBeenCalledWith(-1);
    });

    it('stays put without the toast when the save fails', async () => {
        updateProfile.mockRejectedValue(new Error('boom'));
        render(<ProfileEditPage />);

        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Raine Lee' } });
        fireEvent.click(screen.getByText('profileEdit.save'));

        await waitFor(() => expect(updateProfile).toHaveBeenCalled());
        expect(toast).not.toHaveBeenCalled();
        expect(navigate).not.toHaveBeenCalled();
    });
});
