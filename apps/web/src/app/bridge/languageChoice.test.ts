import { syncLanguageChoiceToShell } from './languageChoice';

let native = true;
// Whether the app runs the frame around the page, as the host's `appShell` port says.
jest.mock('@chatic/host', () => ({
    host: {
        get ports() {
            return { appShell: { kind: native ? 'app' : 'page', os: null } };
        },
    },
}));
const savePreferenceConfirmed = jest.fn();
jest.mock('./appBridge', () => ({
    appBridge: { savePreferenceConfirmed: (data: unknown) => savePreferenceConfirmed(data) },
}));

beforeEach(() => {
    native = true;
    savePreferenceConfirmed.mockReset().mockResolvedValue({ success: true });
});

describe('syncLanguageChoiceToShell', () => {
    it('sends the choice itself under the legacy language key', async () => {
        await syncLanguageChoiceToShell('system');

        expect(savePreferenceConfirmed).toHaveBeenCalledWith({ key: 'language', value: 'system' });
    });

    it('retries once, like the theme, and then gives up without throwing', async () => {
        savePreferenceConfirmed.mockRejectedValue(new Error('dropped'));

        await expect(syncLanguageChoiceToShell('ko')).resolves.toBeUndefined();
        expect(savePreferenceConfirmed).toHaveBeenCalledTimes(2);
    });

    it('sends nothing outside a shell', async () => {
        native = false;

        await syncLanguageChoiceToShell('ko');

        expect(savePreferenceConfirmed).not.toHaveBeenCalled();
    });
});
