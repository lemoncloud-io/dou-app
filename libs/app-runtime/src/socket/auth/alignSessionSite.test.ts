import { alignSessionSite, alignStoredSessionSite } from './alignSessionSite';
import { cloudSession } from '../../session/auth/cloudSession';
import { getCommittedCloudId, getGlobalSessionContext, getSelectedSiteId } from '../../session/store';
import { cloudStore } from '../../session/store/stores';
import { getSocketManager } from '../runtime';
import { isSiteSwitchInFlight } from './switchSite';

jest.mock('@chatic/bridges', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('@chatic/data', () => ({ RELAY_CLOUD_ID: 'default' }));
jest.mock('../../session/auth/cloudSession', () => ({ cloudSession: { applySelectedSite: jest.fn() } }));
jest.mock('../../session/store', () => ({
    getCommittedCloudId: jest.fn(),
    getGlobalSessionContext: jest.fn(),
    getSelectedSiteId: jest.fn(),
}));
jest.mock('../../session/store/stores', () => ({ cloudStore: { getCloudTokenOf: jest.fn() } }));
jest.mock('../runtime', () => ({ getSocketManager: jest.fn() }));
jest.mock('./switchSite', () => ({ isSiteSwitchInFlight: jest.fn() }));

const mockedApply = cloudSession.applySelectedSite as jest.Mock;
const mockedCommitted = getCommittedCloudId as jest.Mock;
const mockedSelected = getSelectedSiteId as jest.Mock;
const mockedSession = getGlobalSessionContext as jest.Mock;
const mockedManager = getSocketManager as jest.Mock;
const mockedInFlight = isSiteSwitchInFlight as jest.Mock;
const mockedTokenOf = cloudStore.getCloudTokenOf as jest.Mock;

const withSocket = (authSwitch: jest.Mock) =>
    mockedManager.mockReturnValue({
        waitUntilVerified: jest.fn().mockResolvedValue(true),
        getClient: jest.fn(() => ({ auth: { switch: authSwitch } })),
    });

describe('alignSessionSite', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        mockedCommitted.mockReturnValue('cloud-1');
        mockedSelected.mockReturnValue('site-selected');
        mockedSession.mockReturnValue({ identity: { userId: 'user-1' } });
        mockedInFlight.mockReturnValue(false);
    });

    it('switches the session back to the selected place when a token landed it elsewhere', async () => {
        const authSwitch = jest.fn().mockResolvedValue(undefined);
        withSocket(authSwitch);

        await alignSessionSite('cloud-1', 'site-default');

        expect(authSwitch).toHaveBeenCalledWith('user-1@site-selected');
        expect(mockedApply).not.toHaveBeenCalled();
    });

    it('does nothing when the token names the selected place', async () => {
        const authSwitch = jest.fn();
        withSocket(authSwitch);

        await alignSessionSite('cloud-1', 'site-selected');

        expect(authSwitch).not.toHaveBeenCalled();
    });

    it.each([
        ['the relay — its token names a personal place by design', 'default', 'P10002'],
        ['a cloud other than the committed one', 'cloud-2', 'site-default'],
        ['a token that names no place', 'cloud-1', undefined],
    ])('leaves %s alone', async (_label, cid, landed) => {
        const authSwitch = jest.fn();
        withSocket(authSwitch);

        await alignSessionSite(cid, landed);

        expect(authSwitch).not.toHaveBeenCalled();
        expect(mockedApply).not.toHaveBeenCalled();
    });

    it('leaves a session with no selected place alone (a cloud switch has just cleared it)', async () => {
        mockedSelected.mockReturnValue(null);
        const authSwitch = jest.fn();
        withSocket(authSwitch);

        await alignSessionSite('cloud-1', 'site-default');

        expect(authSwitch).not.toHaveBeenCalled();
    });

    it('does not treat a token written back during a place switch as drift', async () => {
        mockedInFlight.mockReturnValue(true);
        const authSwitch = jest.fn();
        withSocket(authSwitch);

        await alignSessionSite('cloud-1', 'site-default');

        expect(authSwitch).not.toHaveBeenCalled();
    });

    it('runs one alignment at a time — its own switch writes a token back into here', async () => {
        let release: () => void = () => undefined;
        const authSwitch = jest.fn(() => new Promise<void>(resolve => (release = resolve)));
        withSocket(authSwitch);

        const first = alignSessionSite('cloud-1', 'site-default');
        await Promise.resolve();
        await alignSessionSite('cloud-1', 'site-default');
        release();
        await first;

        expect(authSwitch).toHaveBeenCalledTimes(1);
    });

    it('follows the session instead when the switch back fails, and never throws', async () => {
        withSocket(jest.fn().mockRejectedValue(new Error('403 NOT ALLOWED')));

        await expect(alignSessionSite('cloud-1', 'site-default')).resolves.toBeUndefined();

        expect(mockedApply).toHaveBeenCalledWith('site-default');
    });

    it('keeps a selection the user moved while the failed switch was in flight', async () => {
        withSocket(
            jest.fn(async () => {
                mockedSelected.mockReturnValue('site-tapped');
                throw new Error('timeout');
            })
        );

        await alignSessionSite('cloud-1', 'site-default');

        expect(mockedApply).not.toHaveBeenCalled();
    });
});

describe('alignStoredSessionSite', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        mockedCommitted.mockReturnValue('cloud-1');
        mockedSelected.mockReturnValue('site-selected');
        mockedSession.mockReturnValue({ identity: { userId: 'user-1' } });
        mockedInFlight.mockReturnValue(false);
    });

    it('aligns against the place the stored token names — a reload registers with it and writes nothing back', async () => {
        mockedTokenOf.mockReturnValue({ $site: { id: 'site-default' } });
        const authSwitch = jest.fn().mockResolvedValue(undefined);
        withSocket(authSwitch);

        await alignStoredSessionSite('cloud-1');

        expect(mockedTokenOf).toHaveBeenCalledWith('cloud-1');
        expect(authSwitch).toHaveBeenCalledWith('user-1@site-selected');
    });

    it('does not read a cloud token for the relay slot', async () => {
        const authSwitch = jest.fn();
        withSocket(authSwitch);

        await alignStoredSessionSite('default');

        expect(mockedTokenOf).not.toHaveBeenCalled();
        expect(authSwitch).not.toHaveBeenCalled();
    });
});
