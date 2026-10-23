import { resolveRedactionSalt } from './redactionSalt';

const STORAGE_KEY = '@chatic/web.log.redaction-salt';
const globals = window as unknown as { CHATIC_APP_LOG_SALT?: string };

describe('resolveRedactionSalt', () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => {
        delete globals.CHATIC_APP_LOG_SALT;
        jest.restoreAllMocks();
    });

    it("uses the app's injected salt, so both runtimes fingerprint alike", () => {
        globals.CHATIC_APP_LOG_SALT = 'native-salt-0123456789';

        expect(resolveRedactionSalt()).toBe('native-salt-0123456789');
        expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
        // Read once and removed, so no later script on the page finds it.
        expect(globals.CHATIC_APP_LOG_SALT).toBeUndefined();
    });

    it('keeps its own salt in localStorage when nothing is injected, and reuses it', () => {
        const first = resolveRedactionSalt();

        expect(first).toMatch(/^[0-9a-f]{32}$/);
        expect(localStorage.getItem(STORAGE_KEY)).toBe(first);
        expect(resolveRedactionSalt()).toBe(first);
    });

    it('ignores an empty injection, which is what a shell without a salt sends', () => {
        globals.CHATIC_APP_LOG_SALT = '';
        localStorage.setItem(STORAGE_KEY, 'stored-salt-0123456789');

        expect(resolveRedactionSalt()).toBe('stored-salt-0123456789');
    });

    it('still returns a salt when storage throws', () => {
        jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('denied');
        });

        expect(resolveRedactionSalt()).toMatch(/^[0-9a-f]{32}$/);
    });
});
