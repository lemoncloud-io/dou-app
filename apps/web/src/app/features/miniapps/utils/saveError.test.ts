import { saveErrorOf } from './saveError';

const bridged = (code: string) => Object.assign(new Error('save refused'), { name: 'MiniAppSaveRefused', code });

describe('saveErrorOf', () => {
    it("shows a refusal to change someone else's mini app under the address", () => {
        expect(saveErrorOf(bridged('notAllowed'))).toEqual({
            field: 'url',
            key: 'miniApps.error.notAllowed',
            values: expect.any(Object),
        });
    });

    it('keeps the name reasons under the name', () => {
        expect(saveErrorOf(bridged('nameTooLong'))).toMatchObject({ field: 'name', key: 'miniApps.error.nameTooLong' });
    });

    it('falls back to the generic failure for any other error', () => {
        expect(saveErrorOf(new Error('403 NOT ALLOWED - denied by policy - miniapp.update:error'))).toEqual({
            field: 'url',
            key: 'miniApps.error.failed',
            values: {},
        });
    });
});
