import { syncLanguageChoiceToShell } from './languageChoice';

const save = jest.fn();
let mockPreferences = true;
jest.mock('@chatic/runtime', () => {
    const { browserAppShell, fakeRuntimeModule } = require('@chatic/runtime/testing');
    return fakeRuntimeModule({
        get appShell() {
            return { ...browserAppShell(), preferences: mockPreferences ? { save, read: jest.fn() } : null };
        },
    });
});

beforeEach(() => {
    mockPreferences = true;
    save.mockReset().mockResolvedValue(undefined);
});

describe('syncLanguageChoiceToShell', () => {
    it('sends the choice itself under the legacy language key', async () => {
        await syncLanguageChoiceToShell('system');

        expect(save).toHaveBeenCalledWith('language', 'system');
    });

    it('retries once, like the theme, and then gives up without throwing', async () => {
        save.mockRejectedValue(new Error('dropped'));

        await expect(syncLanguageChoiceToShell('ko')).resolves.toBeUndefined();
        expect(save).toHaveBeenCalledTimes(2);
    });

    it('sends nothing where the frame keeps no preference store', async () => {
        mockPreferences = false;

        await syncLanguageChoiceToShell('ko');

        expect(save).not.toHaveBeenCalled();
    });
});
