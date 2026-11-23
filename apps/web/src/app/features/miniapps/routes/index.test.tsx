import { screen, waitFor } from '@testing-library/react';

import { renderAt } from '../testing/setup';
import { MiniAppRoutes } from './index';

let mockMiniAppTab = false;

jest.mock('@chatic/runtime', () =>
    require('@chatic/runtime/testing').fakeRuntimeModule({
        settings: { useConfigValue: (key: string) => (key === 'feature.miniApp.tab' ? mockMiniAppTab : undefined) },
    })
);
jest.mock('../pages/MiniAppsPage', () => ({ MiniAppsPage: () => <p>tab</p> }));
jest.mock('../pages/MiniAppManagePage', () => ({ MiniAppManagePage: () => <p>manage</p> }));

const at = (path: string) => renderAt(<MiniAppRoutes />, path, { route: '/miniapps/*' });

describe('MiniAppRoutes', () => {
    it.each(['/miniapps', '/miniapps/manage'])('sends %s home while the toggle is off', async path => {
        mockMiniAppTab = false;
        at(path);

        await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/'));
        expect(screen.queryByText('tab')).toBeNull();
        expect(screen.queryByText('manage')).toBeNull();
    });

    it.each([
        ['/miniapps', 'tab'],
        ['/miniapps/manage', 'manage'],
    ])('opens %s while the toggle is on', (path, screenName) => {
        mockMiniAppTab = true;
        at(path);

        expect(screen.getByText(screenName)).toBeTruthy();
    });

    it('sends an unknown address under the tab back to the tab', async () => {
        mockMiniAppTab = true;
        at('/miniapps/elsewhere');

        await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/miniapps'));
    });
});
