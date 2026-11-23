import '@testing-library/jest-dom';

import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import { miniApp, renderAt } from '../testing/setup';
import { MiniAppManagePage } from './MiniAppManagePage';

import type { DomainMiniApp } from '@chatic/runtime';

const mockToast = jest.fn();
const mockNavigate = jest.fn();
let mockOwned: { id: string; name?: string }[] = [];
let mockCatalogAnswered = true;
const mockRepo = {
    listMiniApps: jest.fn(),
    addMiniApp: jest.fn(),
    updateMiniApp: jest.fn(),
    removeMiniApp: jest.fn(),
};

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, values?: Record<string, unknown>) =>
            values?.max !== undefined && !values?.count ? `${key}:${values.max}` : key,
    }),
}));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock('@chatic/shared', () => ({
    ...jest.requireActual('@chatic/shared'),
    useNavigateWithTransition: () => mockNavigate,
}));
jest.mock('@chatic/runtime', () =>
    require('@chatic/runtime/testing').fakeRuntimeModule({
        session: { useSessionSelection: () => ({ selectedCloudId: 'c1', selectedSiteId: 'p1' }) },
        data: { useRuntimeRepositories: () => ({ cloud: mockRepo }) },
    })
);
jest.mock('../../../hooks', () => ({ useInvitedClouds: () => ({ invitedClouds: [] }) }));
jest.mock('../../../hooks/useCloudCatalog', () => ({
    useCloudSessionCatalog: () => ({ clouds: mockOwned, hasCloudCatalog: mockCatalogAnswered }),
}));

const ON = miniApp('shop');
const OFF = miniApp('lunch', { enabled: false, status: 'inactive' });
const HELD = miniApp('coupon', { status: 'held' });

const show = async (apps: DomainMiniApp[], state?: unknown) => {
    mockRepo.listMiniApps.mockResolvedValue(apps);
    const view = renderAt(<MiniAppManagePage />, '/miniapps/manage', { state });
    if (apps.length > 0) await screen.findByRole('button', { name: new RegExp(apps[0].name), hidden: true });
    else await waitFor(() => expect(mockRepo.listMiniApps).toHaveBeenCalled());
    return view;
};

const switchIn = (id: string) =>
    within(document.querySelector(`[data-mini-app-id="${id}"]`) as HTMLElement).getByRole('switch');

const bridged = (code: string) => Object.assign(new Error('save refused'), { name: 'MiniAppSaveRefused', code });

const fillAndSubmit = async ({ name, url }: { name?: string; url?: string }, submit = 'miniApps.sheet.submitAdd') => {
    if (name !== undefined) {
        fireEvent.change(await screen.findByLabelText('miniApps.sheet.nameLabel'), { target: { value: name } });
    }
    if (url !== undefined) {
        fireEvent.change(await screen.findByLabelText('miniApps.sheet.urlLabel'), { target: { value: url } });
    }
    fireEvent.click(screen.getByRole('button', { name: submit }));
};

beforeEach(() => {
    jest.clearAllMocks();
    mockOwned = [{ id: 'c1', name: 'Team' }];
    mockCatalogAnswered = true;
});

describe('MiniAppManagePage — who may be here', () => {
    it('sends anyone who is not the owner back to the tab', async () => {
        mockOwned = [];
        renderAt(<MiniAppManagePage />, '/miniapps/manage');

        await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/miniapps'));
    });

    it('waits for the catalog before deciding, rather than bounce an owner', () => {
        mockOwned = [];
        mockCatalogAnswered = false;
        renderAt(<MiniAppManagePage />, '/miniapps/manage');

        expect(screen.getByTestId('where').textContent).toBe('/miniapps/manage');
    });
});

describe('MiniAppManagePage — the switch', () => {
    it('sends the change, takes no second press meanwhile, keeps focus, and keeps the answer', async () => {
        let answer: (app: DomainMiniApp) => void = () => undefined;
        mockRepo.updateMiniApp.mockReturnValue(new Promise(resolve => (answer = resolve)));
        await show([OFF]);

        fireEvent.click(switchIn('lunch'));

        await waitFor(() => expect(mockRepo.updateMiniApp).toHaveBeenCalledWith('lunch', { enabled: true }));
        expect(switchIn('lunch')).toHaveAttribute('aria-checked', 'true');
        expect(switchIn('lunch')).not.toBeDisabled();
        expect(document.querySelector('[data-mini-app-id="lunch"]')).toHaveAttribute('aria-busy', 'true');
        fireEvent.click(switchIn('lunch'));
        expect(mockRepo.updateMiniApp).toHaveBeenCalledTimes(1);

        answer({ ...OFF, enabled: true, status: 'active' });

        await waitFor(() =>
            expect(document.querySelector('[data-mini-app-id="lunch"]')).not.toHaveAttribute('aria-busy')
        );
        expect(switchIn('lunch')).toHaveAttribute('aria-checked', 'true');
        expect(
            within(document.querySelector('[data-mini-app-id="lunch"]') as HTMLElement).queryByText(
                'miniApps.chip.inactive'
            )
        ).toBeNull();
    });

    it('falls back and says so when the change is refused', async () => {
        mockRepo.updateMiniApp.mockRejectedValue(new Error('403 FORBIDDEN - not owner of cloud'));
        await show([ON]);

        fireEvent.click(switchIn('shop'));

        await waitFor(() =>
            expect(mockToast).toHaveBeenCalledWith({ title: 'miniApps.toggleFailed', variant: 'destructive' })
        );
        expect(switchIn('shop')).toHaveAttribute('aria-checked', 'true');
        expect(switchIn('shop')).not.toBeDisabled();
    });

    it("keeps a held mini app's switch locked off", async () => {
        await show([HELD]);

        expect(switchIn('coupon')).toBeDisabled();
        expect(switchIn('coupon')).toHaveAttribute('aria-checked', 'false');
        expect(switchIn('coupon')).toHaveAccessibleName('miniApps.switchLabelHeld');
    });
});

describe('MiniAppManagePage — adding', () => {
    it('offers the add row while the cloud has room', async () => {
        await show(Array.from({ length: 9 }, (_, i) => miniApp(`app${i}`)));

        expect(screen.getByRole('button', { name: /miniApps\.add/ })).toBeTruthy();
    });

    it('offers no add row at ten', async () => {
        await show(Array.from({ length: 10 }, (_, i) => miniApp(`app${i}`)));

        expect(screen.queryByRole('button', { name: /miniApps\.add/ })).toBeNull();
    });

    it('opens no add sheet at ten, even when the hub asked', async () => {
        await show(
            Array.from({ length: 10 }, (_, i) => miniApp(`app${i}`)),
            { add: true }
        );

        await waitFor(() => expect(mockRepo.listMiniApps).toHaveBeenCalled());
        expect(screen.queryByText('miniApps.sheet.addTitle')).toBeNull();
    });

    it('adds a mini app and lists what the relay stored, without reading the list again', async () => {
        const stored = miniApp('poll');
        mockRepo.addMiniApp.mockResolvedValue(stored);
        await show([ON]);

        fireEvent.click(screen.getByRole('button', { name: /miniApps\.add/ }));
        await fillAndSubmit({ name: ' Poll ', url: 'https://poll.example/' });

        await waitFor(() => expect(mockToast).toHaveBeenCalledWith({ title: 'miniApps.sheet.added' }));
        expect(mockRepo.addMiniApp).toHaveBeenCalledWith('c1', {
            name: 'Poll',
            url: 'https://poll.example/',
            enabled: true,
        });
        expect(await screen.findByRole('button', { name: /Poll/ })).toBeTruthy();
        expect(mockRepo.listMiniApps).toHaveBeenCalledTimes(1);
    });

    it('opens the add sheet at once when the hub sent the owner here to add one', async () => {
        await show([ON], { add: true });

        expect(await screen.findByText('miniApps.sheet.addTitle')).toBeTruthy();
    });

    it('catches a mistake before sending, by the rule the relay applies', async () => {
        await show([ON]);
        fireEvent.click(screen.getByRole('button', { name: /miniApps\.add/ }));

        await fillAndSubmit({ name: 'Hub', url: 'https://apps.chatic.io/tools' });

        expect(await screen.findByText('miniApps.error.hubUrl:10')).toBeTruthy();
        expect(mockRepo.addMiniApp).not.toHaveBeenCalled();
    });

    it.each([
        ['nameMissing', 'miniApps.sheet.nameLabel', 'miniApps.error.nameMissing:30'],
        ['nameTooLong', 'miniApps.sheet.nameLabel', 'miniApps.error.nameTooLong:30'],
        ['invalidUrl', 'miniApps.sheet.urlLabel', 'miniApps.error.invalidUrl:10'],
        ['hubUrl', 'miniApps.sheet.urlLabel', 'miniApps.error.hubUrl:10'],
        ['tooMany', 'miniApps.sheet.urlLabel', 'miniApps.error.tooMany:10'],
    ])('shows the %s refusal under its field', async (code, field, message) => {
        mockRepo.addMiniApp.mockRejectedValue(bridged(code));
        await show([ON]);
        fireEvent.click(screen.getByRole('button', { name: /miniApps\.add/ }));

        await fillAndSubmit({ name: 'Poll', url: 'https://poll.example/' });

        await screen.findByText(message);
        expect(screen.getByLabelText(field)).toHaveAccessibleDescription(message);
        expect(screen.getByLabelText(field)).toHaveAttribute('aria-invalid', 'true');
        expect(mockToast).not.toHaveBeenCalled();
    });

    it('shows any other failure as the general message under the address', async () => {
        mockRepo.addMiniApp.mockRejectedValue(new Error('Network Error'));
        await show([ON]);
        fireEvent.click(screen.getByRole('button', { name: /miniApps\.add/ }));

        await fillAndSubmit({ name: 'Poll', url: 'https://poll.example/' });

        expect(await screen.findByText('miniApps.error.failed')).toBeTruthy();
    });
});

describe('MiniAppManagePage — editing and removing', () => {
    it('sends only what changed', async () => {
        mockRepo.updateMiniApp.mockResolvedValue({ ...ON, name: 'Store' });
        await show([ON]);
        fireEvent.click(screen.getByRole('button', { name: /^Shop/ }));

        await fillAndSubmit({ name: 'Store' }, 'miniApps.sheet.save');

        await waitFor(() => expect(mockToast).toHaveBeenCalledWith({ title: 'miniApps.sheet.saved' }));
        expect(mockRepo.updateMiniApp).toHaveBeenCalledWith('shop', { name: 'Store' });
    });

    it("says at the top of a held mini app's sheet why its switch is locked", async () => {
        await show([HELD]);
        fireEvent.click(screen.getByRole('button', { name: /Coupon/ }));

        expect(await screen.findByText('miniApps.sheet.heldNotice')).toBeTruthy();
        expect(screen.getByRole('switch', { name: 'miniApps.sheet.visible' })).toBeDisabled();
    });

    it('removes without asking, says so and closes', async () => {
        mockRepo.removeMiniApp.mockResolvedValue(undefined);
        await show([ON, OFF]);
        fireEvent.click(screen.getByRole('button', { name: /^Shop/ }));

        fireEvent.click(await screen.findByRole('button', { name: 'miniApps.sheet.remove' }));

        await waitFor(() => expect(mockToast).toHaveBeenCalledWith({ title: 'miniApps.sheet.removed' }));
        expect(mockRepo.removeMiniApp).toHaveBeenCalledWith('shop');
        await waitFor(() => expect(document.querySelector('[data-mini-app-id="shop"]')).toBeNull());
    });
});
