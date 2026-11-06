import { AppStorage } from './appStorage';

import type { StorageAdapter } from './types';

const mapAdapter = (): StorageAdapter & { values: Map<string, string> } => {
    const values = new Map<string, string>();
    return {
        values,
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => void values.set(key, value),
        removeItem: key => void values.delete(key),
    };
};

describe('AppStorage', () => {
    beforeEach(() => sessionStorage.clear());

    it("uses this tab's sessionStorage until an adapter is set", () => {
        new AppStorage().set('k', 'v');
        expect(sessionStorage.getItem('k')).toBe('v');
    });

    it('writes through the adapter it was pointed at, and only that one', () => {
        const app = new AppStorage();
        const first = mapAdapter();
        const second = mapAdapter();

        app.use(first);
        app.set('k', '1');
        app.use(second);
        app.set('k', '2');
        app.remove('missing');

        expect(first.values.get('k')).toBe('1');
        expect(app.get('k')).toBe('2');
        expect(sessionStorage.getItem('k')).toBeNull();
    });
});
