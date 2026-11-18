import { readNativeHostFacts } from './hostFacts';

jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

describe('readNativeHostFacts', () => {
    it("reads the OS from React Native's Platform and takes the user agent the app resolved", () => {
        expect(readNativeHostFacts({ userAgent: 'DoU/1.0 (DOU_ANDROID)' })).toEqual({
            platform: 'android',
            userAgent: 'DoU/1.0 (DOU_ANDROID)',
        });
    });

    it('reads the platform it is handed instead, when given one', () => {
        expect(readNativeHostFacts({ userAgent: 'ua' }, { OS: 'ios' }).platform).toBe('ios');
    });

    it('answers a frozen object, so no reader can change what the process knows', () => {
        const facts = readNativeHostFacts({ userAgent: 'ua' });

        expect(Object.isFrozen(facts)).toBe(true);
    });
});
