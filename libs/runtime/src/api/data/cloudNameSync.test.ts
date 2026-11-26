import { coreEngine } from '../../engine/engine';

import { initAppRuntime, resetRuntimeEngine } from '../init';
import { createInvitedCloudNameSync, createPairedCloudNameSync } from './cloudNameSync';

const data = {
    syncInvitedCloudName: jest.fn(async () => undefined),
    syncPairedCloudName: jest.fn(async () => undefined),
};

beforeEach(() => {
    jest.clearAllMocks();
    initAppRuntime({ ...coreEngine, data: data as never });
});

afterEach(() => resetRuntimeEngine());

describe('createInvitedCloudNameSync', () => {
    it('reads the cloud name once the read can run, and only once per cloud', () => {
        const sync = createInvitedCloudNameSync();

        sync({ cloudId: 'cloud-b', ready: false });
        expect(data.syncInvitedCloudName).not.toHaveBeenCalled();

        sync({ cloudId: 'cloud-b', ready: true });
        sync({ cloudId: 'cloud-b', ready: true });
        expect(data.syncInvitedCloudName).toHaveBeenCalledTimes(1);
        expect(data.syncInvitedCloudName).toHaveBeenCalledWith('cloud-b');
    });

    it('does nothing without a selected cloud, and reads the next cloud it is moved to', () => {
        const sync = createInvitedCloudNameSync();

        sync({ cloudId: null, ready: true });
        expect(data.syncInvitedCloudName).not.toHaveBeenCalled();

        sync({ cloudId: 'cloud-a', ready: true });
        sync({ cloudId: 'cloud-b', ready: true });
        expect(data.syncInvitedCloudName.mock.calls).toEqual([['cloud-a'], ['cloud-b']]);
    });

    it('keeps its own memory — a second gate reads again', () => {
        createInvitedCloudNameSync()({ cloudId: 'cloud-b', ready: true });
        createInvitedCloudNameSync()({ cloudId: 'cloud-b', ready: true });

        expect(data.syncInvitedCloudName).toHaveBeenCalledTimes(2);
    });
});

describe('createPairedCloudNameSync', () => {
    it('reads a paired cloud once per entry, after the read can run', () => {
        const sync = createPairedCloudNameSync();

        sync({ cloudId: 'cloud-p', isPaired: true, ready: false });
        expect(data.syncPairedCloudName).not.toHaveBeenCalled();

        sync({ cloudId: 'cloud-p', isPaired: true, ready: true });
        sync({ cloudId: 'cloud-p', isPaired: true, ready: true });
        expect(data.syncPairedCloudName).toHaveBeenCalledTimes(1);
        expect(data.syncPairedCloudName).toHaveBeenCalledWith('cloud-p');
    });

    it('leaves a cloud that is not paired alone', () => {
        createPairedCloudNameSync()({ cloudId: 'cloud-x', isPaired: false, ready: true });

        expect(data.syncPairedCloudName).not.toHaveBeenCalled();
    });

    it('reads again on the next entry once the pairing ended or the cloud was left', () => {
        const sync = createPairedCloudNameSync();

        sync({ cloudId: 'cloud-p', isPaired: true, ready: true });
        sync({ cloudId: 'cloud-p', isPaired: false, ready: true });
        sync({ cloudId: 'cloud-p', isPaired: true, ready: true });
        sync({ cloudId: null, isPaired: false, ready: true });
        sync({ cloudId: 'cloud-p', isPaired: true, ready: true });

        expect(data.syncPairedCloudName).toHaveBeenCalledTimes(3);
    });
});
