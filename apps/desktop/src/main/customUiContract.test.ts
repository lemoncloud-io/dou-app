import { CUSTOM_UI_APPLY_REFUSED, customUiBoot, customUiRefusal } from './customUiContract';

describe('customUiRefusal', () => {
    it('refuses apply off the dev channel', () => {
        expect(customUiRefusal('apply', false)).toBe(CUSTOM_UI_APPLY_REFUSED);
    });

    it('lets apply through on the dev channel', () => {
        expect(customUiRefusal('apply', true)).toBeNull();
    });

    it.each(['status', 'disable'])('lets %s through on both channels', action => {
        expect(customUiRefusal(action, false)).toBeNull();
        expect(customUiRefusal(action, true)).toBeNull();
    });

    it.each([undefined, null, 42, {}, 'APPLY', 'apply '])(
        'leaves a non-apply action %p to the handler even off the dev channel',
        action => {
            expect(customUiRefusal(action, false)).toBeNull();
        }
    );
});

describe('customUiBoot', () => {
    const ROOT = '/dev/bundle';

    it('serves nothing off the dev channel, however a bundle got there', () => {
        expect(customUiBoot(false, undefined, false)).toEqual({ source: 'builtin' });
        expect(customUiBoot(false, ROOT, true)).toEqual({ source: 'builtin' });
        expect(customUiBoot(false, ROOT, false)).toEqual({ source: 'builtin' });
    });

    it('restores the recorded bundle on the dev channel when there is no override', () => {
        expect(customUiBoot(true, undefined, false)).toEqual({ source: 'restore' });
    });

    it('prefers a servable override over the record on the dev channel', () => {
        expect(customUiBoot(true, ROOT, true)).toEqual({ source: 'override', root: ROOT });
    });

    it('falls through to the record when the override cannot be served', () => {
        expect(customUiBoot(true, ROOT, false)).toEqual({ source: 'restore' });
    });

    it('treats an empty override as unset', () => {
        expect(customUiBoot(true, '', true)).toEqual({ source: 'restore' });
    });
});
