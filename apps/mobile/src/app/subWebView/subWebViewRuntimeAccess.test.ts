import type { SubWebViewRuntimePermission } from '@chatic/bridge-messages';

import { openSubWebViewRuntime } from './subWebViewRuntimeAccess';

let mockOwner: string | undefined = 'native';
let mockReportsFrameOrigin = true;
const mockEngine = jest.fn();

jest.mock('../services/runtime/launchSessionOwner', () => ({ settledSessionOwner: () => mockOwner }));
jest.mock('./subWebViewFrameOrigin', () => ({ subWebViewReportsFrameOrigin: () => mockReportsFrameOrigin }));
jest.mock('../services/runtime/nativeRuntime', () => ({ nativeRuntimeHost: { engine: () => mockEngine() } }));
jest.mock('./subWebViewRuntimeConsentPrompt', () => ({ createAppSubWebViewRuntimeConsent: () => ({}) }));

const permissions = new Set<SubWebViewRuntimePermission>(['chat']);
const engineOn = (cloudId: string | null) => ({
    session: { snapshot: () => ({ context: { cloud: { cloudId } }, committedSiteId: 'p1' }) },
});

describe('openSubWebViewRuntime', () => {
    beforeEach(() => {
        mockOwner = 'native';
        mockReportsFrameOrigin = true;
        mockEngine.mockReset();
        mockEngine.mockReturnValue(engineOn('c1'));
    });

    it('opens the runtime for a reviewed page on a cloud, bound to that cloud and place', () => {
        const access = openSubWebViewRuntime({ trust: 'reviewed', permissions });

        expect(access).toMatchObject({ openedCloudId: 'c1', openedPlaceId: 'p1', granted: permissions });
    });

    it('opens nothing, and never asks the runtime, where the WebView reports every frame as the page', () => {
        mockReportsFrameOrigin = false;

        expect(openSubWebViewRuntime({ trust: 'reviewed', permissions })).toBeNull();
        expect(mockEngine).not.toHaveBeenCalled();
    });

    it.each<[string, () => void]>([
        ['the page holds the session', () => (mockOwner = 'web')],
        ['no cloud is selected', () => mockEngine.mockReturnValue(engineOn(null))],
        ['the runtime has no engine', () => mockEngine.mockReturnValue(null)],
    ])('opens nothing when %s', (_, arrange) => {
        arrange();
        expect(openSubWebViewRuntime({ trust: 'reviewed', permissions })).toBeNull();
    });
});
