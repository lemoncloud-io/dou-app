import { isAcceptedBy, withAcceptor } from './invitedCloudAcceptance';

describe('withAcceptor', () => {
    it('starts the list with the first guest to accept', () => {
        expect(withAcceptor(undefined, 'guest-1')).toEqual(['guest-1']);
    });

    it('appends a new guest and keeps the ones before it', () => {
        expect(withAcceptor(['guest-0'], 'guest-1')).toEqual(['guest-0', 'guest-1']);
    });

    it('does not record the same guest twice', () => {
        expect(withAcceptor(['guest-1'], 'guest-1')).toEqual(['guest-1']);
    });

    it('leaves the list as it was without a guest id', () => {
        expect(withAcceptor(['guest-0'], null)).toEqual(['guest-0']);
        expect(withAcceptor(undefined, undefined)).toBeUndefined();
    });
});

describe('isAcceptedBy', () => {
    it('offers a cloud to a guest that accepted it', () => {
        expect(isAcceptedBy({ acceptedBy: ['guest-0', 'guest-1'] }, 'guest-1')).toBe(true);
    });

    it('withholds a cloud another guest on the device accepted', () => {
        expect(isAcceptedBy({ acceptedBy: ['guest-0'] }, 'guest-1')).toBe(false);
    });

    it('withholds an attributed cloud while the session has no guest id', () => {
        expect(isAcceptedBy({ acceptedBy: ['guest-0'] }, null)).toBe(false);
    });

    it('keeps a row written before acceptors were recorded, for any guest', () => {
        expect(isAcceptedBy({}, 'guest-1')).toBe(true);
        expect(isAcceptedBy({ acceptedBy: [] }, null)).toBe(true);
    });
});
