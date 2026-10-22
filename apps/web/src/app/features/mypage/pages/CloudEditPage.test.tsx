import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { CloudView } from '@lemoncloud/chatic-backend-api';

const navigate = jest.fn();
const updateCloudName = jest.fn();
const setQueriesData = jest.fn();
const toast = jest.fn();
const switchCloud = jest.fn();
let clouds: Partial<CloudView>[] = [];

jest.mock('@chatic/bridges', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('react-router-dom', () => ({ useParams: () => ({ cloudId: 'CL1' }) }));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigate }));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ setQueriesData }) }));
// The session hooks are here so that a screen which went back to switching into the cloud on entry
// would reach `switchCloud` — the test below asserts it never does.
jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: { cloudsKeys: { lists: () => ['clouds', 'list'] } },
        session: {
            useSessionSelection: () => ({ selectedCloudId: 'OTHER' }),
            useRuntimeProfile: () => ({ isCloudActive: false }),
            useSwitchCloudSession: () => ({ switchCloud, isPending: false }),
        },
    },
}));
jest.mock('../../../hooks', () => ({
    useUpdateCloudProfile: () => ({ mutateAsync: updateCloudName, isPending: false }),
}));
let cachedNames: Record<string, string> = {};
jest.mock('../../../hooks/useCachedCloudNames', () => ({ useCachedCloudNames: () => cachedNames }));
jest.mock('../../../hooks/useCloudCatalog', () => ({
    useCloudSessionCatalog: () => ({ clouds, hasCloudCatalog: true }),
}));
jest.mock('../../../ui/components', () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
jest.mock('../../../ui/layouts', () => ({
    fixedViewportScreen: '',
    KeyboardAwareLayout: ({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) => (
        <div>
            {children}
            {footer}
        </div>
    ),
}));

import { CloudEditPage } from './CloudEditPage';

beforeEach(() => {
    jest.clearAllMocks();
    clouds = [{ id: 'CL1', name: 'Lemon', status: 'active' }];
    cachedNames = {};
    switchCloud.mockResolvedValue(undefined);
    updateCloudName.mockResolvedValue({ id: 'CL1', name: 'Orange' });
});

const nameBox = () => screen.getByRole('textbox');
const save = () => screen.getByRole('button', { name: 'profileEdit.save' });

describe('CloudEditPage', () => {
    it('renames the cloud from another session without switching into it', async () => {
        render(<CloudEditPage />);

        expect(nameBox()).toHaveValue('Lemon');
        fireEvent.change(nameBox(), { target: { value: 'Orange' } });
        fireEvent.click(save());

        await waitFor(() => expect(updateCloudName).toHaveBeenCalledWith({ id: 'CL1', name: 'Orange' }));
        expect(switchCloud).not.toHaveBeenCalled();
        expect(navigate).toHaveBeenCalledWith(-1);
    });

    it('patches the new name into the relay catalog query after the save', async () => {
        render(<CloudEditPage />);

        fireEvent.change(nameBox(), { target: { value: 'Orange' } });
        fireEvent.click(save());

        await waitFor(() => expect(setQueriesData).toHaveBeenCalled());
        const [filter, patch] = setQueriesData.mock.calls[0];
        expect(filter).toEqual({ queryKey: ['clouds', 'list'] });
        expect(
            patch({
                list: [
                    { id: 'CL1', name: 'Lemon' },
                    { id: 'CL2', name: 'Lime' },
                ],
            })
        ).toEqual({
            list: [
                { id: 'CL1', name: 'Orange' },
                { id: 'CL2', name: 'Lime' },
            ],
        });
    });

    it('keeps the form and reports the failure when the rename is refused', async () => {
        updateCloudName.mockRejectedValue(new Error('403 FORBIDDEN'));
        render(<CloudEditPage />);

        fireEvent.change(nameBox(), { target: { value: 'Orange' } });
        fireEvent.click(save());

        await waitFor(() =>
            expect(toast).toHaveBeenCalledWith({ title: 'profileEdit.cloudSaveError', variant: 'destructive' })
        );
        expect(setQueriesData).not.toHaveBeenCalled();
        expect(navigate).not.toHaveBeenCalledWith(-1);
    });

    it('starts from the just-saved name while the catalog still answers with the old one', () => {
        cachedNames = { CL1: 'Orange' };

        render(<CloudEditPage />);

        expect(nameBox()).toHaveValue('Orange');
    });

    it('does not offer a save until the name changes', () => {
        render(<CloudEditPage />);

        expect(save()).toBeDisabled();
    });

    it('sends a typed URL for a cloud that is not ready back to its hub', () => {
        clouds = [{ id: 'CL1', name: 'Lemon', status: 'reserved' }];

        render(<CloudEditPage />);

        expect(navigate).toHaveBeenCalledWith('/mypage/cloud-manage/CL1', { replace: true });
    });
});
