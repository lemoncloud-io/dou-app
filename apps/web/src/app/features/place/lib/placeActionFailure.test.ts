import { placeActionFailure } from './placeActionFailure';

describe('placeActionFailure', () => {
    it('reads a 403 refusal as denied, whatever the wording', () => {
        expect(placeActionFailure(new Error('403 FORBIDDEN - owner cannot leave'))).toBe('denied');
        expect(placeActionFailure(Object.assign(new Error('nope'), { errorCode: 403 }))).toBe('denied');
    });

    it("reads the socket client's own no-answer codes as network", () => {
        expect(placeActionFailure(new Error('408 REQUEST TIMEOUT - place.leave'))).toBe('network');
        expect(placeActionFailure(new Error('503 SOCKET NOT CONNECTED'))).toBe('network');
    });

    it('reads everything else as other — including a half-finished leave and an error with no status', () => {
        expect(placeActionFailure(new Error('500 INTERNAL - channel clean-up failed'))).toBe('other');
        expect(placeActionFailure(new Error('something broke'))).toBe('other');
        expect(placeActionFailure(undefined)).toBe('other');
    });
});
