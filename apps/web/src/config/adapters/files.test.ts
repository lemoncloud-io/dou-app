import type { WebHostFacts } from '@chatic/runtime-hybrid-web';

import { createNativeTransfers, syncFileTransfers } from '../../app/runtime/upload';
import { resetNativeTransfersForTest, webFiles } from './files';

jest.mock('@chatic/bridges', () => ({
    logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
    webClient: { post: jest.fn(), request: jest.fn(), onEvent: jest.fn(() => () => undefined) },
}));
jest.mock('../../app/runtime/upload', () => ({
    createNativeTransfers: jest.fn(),
    syncFileTransfers: jest.fn(),
}));

const facts = {} as WebHostFacts;
const shell = () => webFiles.shell({ kind: 'shell' }, facts);

const create = createNativeTransfers as jest.Mock;
const sync = syncFileTransfers as jest.Mock;
const dispose = jest.fn();

beforeEach(() => {
    resetNativeTransfersForTest();
    jest.clearAllMocks();
    create.mockImplementation(() => ({ put: jest.fn(), putShellFile: jest.fn(), dispose }));
    sync.mockResolvedValue(undefined);
});

describe('webFiles — the phone app moves the files', () => {
    it('makes no transfer module until first use, then one for the page', async () => {
        const port = shell();
        expect(create).not.toHaveBeenCalled();

        await port.transfers?.syncUploads();
        await shell().transfers?.syncUploads();

        expect(create).toHaveBeenCalledTimes(1);
        expect(sync).toHaveBeenCalledTimes(2);
        expect(sync.mock.calls[1][1]).toBe(sync.mock.calls[0][1]);
    });

    it('disposes the transfer module on reset and makes a new one on the next use', async () => {
        await shell().transfers?.syncUploads();
        resetNativeTransfersForTest();

        expect(dispose).toHaveBeenCalledTimes(1);

        await shell().transfers?.syncUploads();
        expect(create).toHaveBeenCalledTimes(2);
    });
});
