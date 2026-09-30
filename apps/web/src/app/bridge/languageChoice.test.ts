import { syncLanguageChoiceToShell } from './languageChoice';

let native = true;
jest.mock('@chatic/bridges', () => ({ isNative: () => native }));
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
