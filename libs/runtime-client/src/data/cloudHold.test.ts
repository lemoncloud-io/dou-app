import { coreEngine } from '@chatic/runtime-core/engine';

import { initAppRuntime, resetRuntimeEngine } from '../init';
import { withCloudHold } from './cloudHold';

const releaseHold = jest.fn();
const chat = { createPendingImageChat: jest.fn() };
const data = {
    holdCloud: jest.fn((_cid: string) => releaseHold),
    cloudRepositories: jest.fn((_cid: string) => ({ chat })),
};

beforeEach(() => {
    jest.clearAllMocks();
    initAppRuntime({ ...coreEngine, data: data as never });
});

afterEach(() => resetRuntimeEngine());

describe('withCloudHold', () => {
    it("runs the work against that cloud's chat while holding its socket, then releases", async () => {
        const result = await withCloudHold('c-1', async given => {
            expect(given).toBe(chat);
            expect(releaseHold).not.toHaveBeenCalled();
            return 'sent';
        });

        expect(result).toBe('sent');
        expect(data.holdCloud).toHaveBeenCalledWith('c-1');
        expect(data.cloudRepositories).toHaveBeenCalledWith('c-1');
        expect(releaseHold).toHaveBeenCalledTimes(1);
    });

    it('releases the hold when the work rejects, and passes the rejection on', async () => {
        await expect(
            withCloudHold('c-1', async () => {
                throw new Error('upload failed');
            })
        ).rejects.toThrow('upload failed');

        expect(releaseHold).toHaveBeenCalledTimes(1);
    });

    it("releases the hold when the cloud's graph cannot be read", async () => {
        data.cloudRepositories.mockImplementationOnce(() => {
            throw new Error('no graph');
        });

        await expect(withCloudHold('c-1', async () => 'never')).rejects.toThrow('no graph');
        expect(releaseHold).toHaveBeenCalledTimes(1);
    });
});
