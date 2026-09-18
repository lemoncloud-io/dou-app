import { createUploadsHttpGateway } from './uploads';

import type { HttpGatewayExecutor } from './types';

const executeSignedRelayRequest = jest.fn();
const executeRelayRequest = jest.fn();

const exec: HttpGatewayExecutor = {
    executeRelayRequest,
    executeSignedRelayRequest,
    resolveEndpoint: () => 'https://relay.test',
};

const gateway = () => createUploadsHttpGateway(exec, () => 'https://uploads.test/uploads');

beforeEach(() => {
    jest.clearAllMocks();
    executeSignedRelayRequest.mockResolvedValue({ list: [] });
});

describe('createUploadsHttpGateway', () => {
    it('start — POST {base}/start', async () => {
        await gateway().start({ list: [], transfers: ['presigned-put', 'inline'] });

        expect(executeSignedRelayRequest).toHaveBeenCalledWith({
            method: 'POST',
            baseURL: 'https://uploads.test/uploads/start',
            body: { list: [], transfers: ['presigned-put', 'inline'] },
        });
    });

    it('send — POST {base}/{id}/send, id encoded', async () => {
        await gateway().send('a/b', { content: 'AAA=' });

        expect(executeSignedRelayRequest).toHaveBeenCalledWith({
            method: 'POST',
            baseURL: 'https://uploads.test/uploads/a%2Fb/send',
            body: { content: 'AAA=' },
        });
    });

    it('complete — POST {base}/complete', async () => {
        await gateway().complete({ list: [{ id: '1' }] });

        expect(executeSignedRelayRequest).toHaveBeenCalledWith({
            method: 'POST',
            baseURL: 'https://uploads.test/uploads/complete',
            body: { list: [{ id: '1' }] },
        });
    });

    it('read — GET {base}/{id}', async () => {
        await gateway().read('1');

        expect(executeSignedRelayRequest).toHaveBeenCalledWith({
            method: 'GET',
            baseURL: 'https://uploads.test/uploads/1',
        });
    });

    // The deployed routes sit behind `authorizer: aws_iam`, so an unsigned call is a 403 and the
    // signature is computed per request over the body — there is no header map to hand elsewhere.
    it('never uses the unsigned executor', async () => {
        const uploads = gateway();

        await uploads.start({ list: [] });
        await uploads.complete({ list: [] });
        await uploads.read('1');

        expect(executeRelayRequest).not.toHaveBeenCalled();
    });

    // The endpoint is read per call, not captured: a QA override that lands after boot must take.
    it('resolves the endpoint at call time', async () => {
        let host = 'https://one.test/uploads';
        const uploads = createUploadsHttpGateway(exec, () => host);

        await uploads.read('1');
        host = 'https://two.test/uploads';
        await uploads.read('2');

        expect(executeSignedRelayRequest.mock.calls.map(([req]) => req.baseURL)).toEqual([
            'https://one.test/uploads/1',
            'https://two.test/uploads/2',
        ]);
    });
});
