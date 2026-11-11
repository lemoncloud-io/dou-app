import { relayCredentialProbe } from './relayCredentialProbe';

const mockRelayToken = { value: null as unknown };
const mockTimeToExpiry = jest.fn<number | null, [string, number?]>();

jest.mock('@chatic/session', () => ({
    relayStore: { getRelayToken: () => mockRelayToken.value },
    credentialFreshness: { timeToExpiry: (cid: string, now?: number) => mockTimeToExpiry(cid, now) },
}));

describe('relayCredentialProbe', () => {
    it('has a session only when a relay token is stored', () => {
        mockRelayToken.value = null;
        expect(relayCredentialProbe.hasSession()).toBe(false);
        mockRelayToken.value = { Token: { identityToken: 'i' } };
        expect(relayCredentialProbe.hasSession()).toBe(true);
    });

    it('reads the relay credential clock, and counts nothing to measure as expired', () => {
        mockTimeToExpiry.mockReturnValueOnce(60_000);
        expect(relayCredentialProbe.isCredentialExpired(0)).toBe(false);
        mockTimeToExpiry.mockReturnValueOnce(0);
        expect(relayCredentialProbe.isCredentialExpired(0)).toBe(true);
        mockTimeToExpiry.mockReturnValueOnce(null);
        expect(relayCredentialProbe.isCredentialExpired(0)).toBe(true);
        expect(mockTimeToExpiry).toHaveBeenCalledWith('default', 0);
    });
});
