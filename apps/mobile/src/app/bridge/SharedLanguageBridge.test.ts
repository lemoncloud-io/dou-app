import { SharedLanguageBridge } from './SharedLanguageBridge';

const mockSet = jest.fn();

jest.mock('react-native', () => ({
    NativeModules: { SharedLanguage: { set: (value: string) => mockSet(value) } },
}));

describe('SharedLanguageBridge.set', () => {
    beforeEach(() => mockSet.mockReset().mockResolvedValue(true));

    it('hands the choice to the native module', async () => {
        await SharedLanguageBridge.set('ko');

        expect(mockSet).toHaveBeenCalledWith('ko');
    });

    it('swallows a native failure — the next launch copies it again', async () => {
        mockSet.mockRejectedValue(new Error('no app group'));

        await expect(SharedLanguageBridge.set('en')).resolves.toBeUndefined();
    });
});
