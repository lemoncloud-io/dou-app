import { readNativeLogContext, setLogSessionOwnerSource } from './nativeLogContext';

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('react-native-device-info', () => ({
    getSystemVersion: () => '18.3',
    getDeviceId: () => 'iPhone17,1',
    getVersion: () => '0.155.0',
}));

describe('readNativeLogContext', () => {
    afterEach(() => setLogSessionOwnerSource(null));

    it('stamps which side holds the session, once a source is set', () => {
        expect(readNativeLogContext().sessionOwner).toBeUndefined();

        setLogSessionOwnerSource(() => 'native');

        expect(readNativeLogContext()).toMatchObject({ sessionOwner: 'native', platform: 'ios', host: 'app' });
    });

    it('leaves the field off when the source throws, rather than failing the entry', () => {
        setLogSessionOwnerSource(() => {
            throw new Error('mmkv');
        });

        expect(readNativeLogContext().sessionOwner).toBeUndefined();
        expect(readNativeLogContext().runId).toEqual(expect.any(String));
    });
});
