import { haptics } from './haptics';

let mockNative = true;
jest.mock('@chatic/bridges', () => ({ isNative: () => mockNative }));

const triggerHaptic = jest.fn();
const postHaptic = jest.fn();
jest.mock('./appBridge', () => ({
    appBridge: {
        triggerHaptic: (...args: unknown[]) => triggerHaptic(...args),
        postHaptic: (...args: unknown[]) => postHaptic(...args),
    },
}));

const notFound = Object.assign(new Error('no handler'), { code: 'NOT_FOUND' });
const timeout = Object.assign(new Error('slow'), { code: 'TIMEOUT' });

/** Lets a rejected request's catch run. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
    jest.clearAllMocks();
    mockNative = true;
    haptics.reset();
    triggerHaptic.mockResolvedValue({ data: {} });
});

describe('haptics', () => {
    it('asks the shell for the kind', () => {
        haptics.play('selection');

        expect(triggerHaptic).toHaveBeenCalledWith('selection');
    });

    it('asks nothing in a browser', () => {
        mockNative = false;

        haptics.play('impact');

        expect(triggerHaptic).not.toHaveBeenCalled();
    });

    // An app built before the message has no handler. One NOT_FOUND settles it for the session.
    it('stops asking after the shell answers NOT_FOUND', async () => {
        triggerHaptic.mockRejectedValueOnce(notFound);

        haptics.play('impact');
        await settle();
        haptics.play('impact');

        expect(triggerHaptic).toHaveBeenCalledTimes(1);
    });

    it('posts without waiting for an answer once the shell has answered one request', async () => {
        haptics.play('selection');
        await settle();
        haptics.play('impact');

        expect(triggerHaptic).toHaveBeenCalledTimes(1);
        expect(postHaptic).toHaveBeenCalledWith('impact');
    });

    it('keeps asking after a transient failure', async () => {
        triggerHaptic.mockRejectedValueOnce(timeout);

        haptics.play('impact');
        await settle();
        haptics.play('impact');

        expect(triggerHaptic).toHaveBeenCalledTimes(2);
        expect(postHaptic).not.toHaveBeenCalled();
    });
});
