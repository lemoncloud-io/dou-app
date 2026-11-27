import * as storage from '.';

describe('@chatic/storage', () => {
    it('keeps every value its entry exported before the storage family split', () => {
        expect(Object.keys(storage).sort()).toEqual([
            'DomStorageAdapter',
            'MemoryStore',
            'NativeSecureStore',
            'SwitchableStore',
            'TolerantStore',
            'WebStore',
            'asDomStorage',
            'isNativeStore',
        ]);
    });

    it('hands out the stores of the family packages', () => {
        const store = new storage.TolerantStore(new storage.MemoryStore());
        store.set('k', 'v');
        expect(storage.asDomStorage(store).getItem('k')).toBe('v');
    });
});
