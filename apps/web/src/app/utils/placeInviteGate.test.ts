import { resolvePlaceInviteGate, type PlaceInviteGateInput } from './placeInviteGate';

const owned = { id: 'site-1', isOwner: true };

const gate = (overrides: Partial<PlaceInviteGateInput> = {}) =>
    resolvePlaceInviteGate({
        isDefaultCloud: false,
        isGuest: false,
        place: owned,
        sessionSiteId: 'site-1',
        ...overrides,
    });

describe('resolvePlaceInviteGate', () => {
    it('is ready for the owner while the session sits on that place', () => {
        expect(gate()).toBe('ready');
    });

    it('is hidden on the relay, whose single place has no owner', () => {
        expect(gate({ isDefaultCloud: true })).toBe('hidden');
    });

    it('is hidden for a guest', () => {
        expect(gate({ isGuest: true })).toBe('hidden');
    });

    it('is hidden for a member who does not own the place', () => {
        expect(gate({ place: { id: 'site-1', isOwner: false } })).toBe('hidden');
    });

    it('is hidden while the place row is not loaded rather than guessing ownership', () => {
        expect(gate({ place: null })).toBe('hidden');
        expect(gate({ place: { id: 'site-1' } })).toBe('hidden');
    });

    it('is disabled while a place switch is in flight', () => {
        expect(gate({ isSwitching: true })).toBe('disabled');
    });

    it('is disabled once the session is on another place, since the server stamps the session site', () => {
        expect(gate({ sessionSiteId: 'site-2' })).toBe('disabled');
        expect(gate({ sessionSiteId: null })).toBe('disabled');
    });
});
