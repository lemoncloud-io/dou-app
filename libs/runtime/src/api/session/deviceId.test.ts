import { lazySessionDeviceId, readSessionDeviceId } from './deviceId';

const mockStoredDeviceId = { value: null as string | null };

jest.mock('@chatic/session', () => ({
    identityStore: {
        getOrMakeDeviceId: (make: () => string) => (mockStoredDeviceId.value ??= make()),
    },
}));

beforeEach(() => {
    mockStoredDeviceId.value = null;
});

describe('readSessionDeviceId', () => {
    it('makes a uuid on a first visit and stores it, so the next read is the same id', () => {
        const first = readSessionDeviceId();

        expect(first).toMatch(/^[0-9a-f-]{36}$/);
        expect(mockStoredDeviceId.value).toBe(first);
        expect(readSessionDeviceId()).toBe(first);
    });

    it('returns the stored id when there is one', () => {
        mockStoredDeviceId.value = 'session-1';

        expect(readSessionDeviceId()).toBe('session-1');
    });
});

describe('lazySessionDeviceId', () => {
    it('reads nothing until it is called, then keeps the first answer', () => {
        mockStoredDeviceId.value = 'session-1';
        const read = lazySessionDeviceId();

        mockStoredDeviceId.value = 'session-2';
        expect(read()).toBe('session-2');

        mockStoredDeviceId.value = 'session-3';
        expect(read()).toBe('session-2');
    });
});
