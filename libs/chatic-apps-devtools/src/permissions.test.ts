import { DATA_METHOD_NAME, DATA_METHODS, MANIFEST_PERMISSIONS } from './permissions';

describe('the permission table', () => {
    it('maps every typed data method to a permission the manifest knows', () => {
        for (const permission of Object.values(DATA_METHODS)) expect(MANIFEST_PERMISSIONS).toContain(permission);
    });

    it('opens every data permission with at least one method', () => {
        const opened = new Set(Object.values(DATA_METHODS));
        for (const permission of ['cloud', 'place', 'channel', 'chat', 'user', 'chatSend', 'chatReact'] as const) {
            expect(opened.has(permission)).toBe(true);
        }
    });

    it('takes no translation key for a data method', () => {
        const keys = "'profile.settings' 'chat.setup' 'user.settings' 'place.sets'";
        expect([...keys.matchAll(DATA_METHOD_NAME)]).toEqual([]);
    });

    it('finds every typed method name by the pattern unknown names are caught with', () => {
        const names = Object.keys(DATA_METHODS)
            .map(name => `'${name}'`)
            .join(' ');
        const found = [...names.matchAll(DATA_METHOD_NAME)].map(match => match[1]);
        expect(found.sort()).toEqual(Object.keys(DATA_METHODS).sort());
    });
});
