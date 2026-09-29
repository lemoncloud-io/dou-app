import { backgroundClouds, resetBackgroundClouds } from '../../socket/backgroundClouds';
import { credentialFreshness } from '../../session/auth/credentialFreshness';
import { getCommittedCloudId } from '../../session/store';
import { cloudStore } from '../../session/store/stores';
import { getSocketManager } from '../../socket/runtime';
import { currentBackgroundSelection, readyBackgroundConfigs } from './backgroundSlots';

jest.mock('../../session/store', () => ({ getCommittedCloudId: jest.fn() }));
jest.mock('../../session/store/stores', () => ({
    cloudStore: { getRecentClouds: jest.fn(), peekCachedCloudTokens: jest.fn() },
}));
jest.mock('../../session/auth/credentialFreshness', () => ({ credentialFreshness: { timeToExpiry: jest.fn() } }));
jest.mock('../../socket/runtime', () => ({ getSocketManager: jest.fn() }));

const HOUR = 60 * 60_000;
const entries: Record<string, unknown> = {};
const remaining: Record<string, number | null> = {};
let bound: string[] = [];

const entry = (wss: string | undefined, identityToken: string | undefined) => ({
    delegationToken: { wss },
    cloudToken: { Token: { identityToken } },
});

beforeEach(() => {
    resetBackgroundClouds();
    for (const key of Object.keys(entries)) delete entries[key];
    for (const key of Object.keys(remaining)) delete remaining[key];
    bound = [];
    (getCommittedCloudId as jest.Mock).mockReturnValue(null);
    (cloudStore.getRecentClouds as jest.Mock).mockReturnValue([]);
    (cloudStore.peekCachedCloudTokens as jest.Mock).mockImplementation((cid: string) => entries[cid] ?? null);
    (credentialFreshness.timeToExpiry as jest.Mock).mockImplementation((cid: string) => remaining[cid] ?? null);
    (getSocketManager as jest.Mock).mockReturnValue({ getSlotKeys: () => bound });
});

describe('currentBackgroundSelection', () => {
    it('applies the policy to the live list, recent order and committed cloud', () => {
        backgroundClouds.setJoined(['a', 'b', 'c']);
        (cloudStore.getRecentClouds as jest.Mock).mockReturnValue(['c']);
        (getCommittedCloudId as jest.Mock).mockReturnValue('a');

        expect(currentBackgroundSelection()).toEqual(['c', 'b']);
    });

    it('keeps a held cloud the app does not list, while its slot is bound', () => {
        backgroundClouds.setJoined(['a']);
        bound = ['h'];
        const release = backgroundClouds.hold('h');

        expect(currentBackgroundSelection()).toEqual(['a', 'h']);
        release();
        expect(currentBackgroundSelection()).toEqual(['a']);
    });

    it('does not open a slot for a held cloud that has none', () => {
        backgroundClouds.setJoined(['a']);
        backgroundClouds.hold('h');

        expect(currentBackgroundSelection()).toEqual(['a']);
    });
});

describe('readyBackgroundConfigs', () => {
    it('builds a cloud config from the cached delegation wss', () => {
        backgroundClouds.setJoined(['a']);
        entries.a = entry('wss://a', 'token-a');
        remaining.a = HOUR;

        expect(readyBackgroundConfigs('device-1')).toEqual([
            { url: 'wss://a', deviceId: 'device-1', wssType: 'cloud', cid: 'a' },
        ]);
    });

    it('leaves out a cloud whose tokens are still being prepared', () => {
        backgroundClouds.setJoined(['a', 'b']);
        entries.a = entry('wss://a', 'token-a');
        remaining.a = 60_000; // inside the margin, and not bound: it is about to be re-issued
        entries.b = entry('wss://b', 'token-b');
        remaining.b = HOUR;

        expect(readyBackgroundConfigs('device-1').map(config => config.cid)).toEqual(['b']);
    });

    it('keeps a bound cloud whatever is left — its guard renews it in place', () => {
        backgroundClouds.setJoined(['a']);
        entries.a = entry('wss://a', 'token-a');
        remaining.a = 60_000;
        bound = ['a'];

        expect(readyBackgroundConfigs('device-1').map(config => config.cid)).toEqual(['a']);
    });

    it('leaves out an entry with no wss or no identity token — nothing to connect or register with', () => {
        backgroundClouds.setJoined(['a', 'b']);
        entries.a = entry(undefined, 'token-a');
        entries.b = entry('wss://b', undefined);

        expect(readyBackgroundConfigs('device-1')).toEqual([]);
    });

    it('never builds one for the committed cloud', () => {
        backgroundClouds.setJoined(['a']);
        entries.a = entry('wss://a', 'token-a');
        remaining.a = HOUR;
        (getCommittedCloudId as jest.Mock).mockReturnValue('a');

        expect(readyBackgroundConfigs('device-1')).toEqual([]);
    });
});
