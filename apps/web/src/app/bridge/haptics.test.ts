import { haptics } from './haptics';

let mockNative = true;
jest.mock('@chatic/bridges', () => ({ isNative: () => mockNative }));

const postHaptic = jest.fn();
jest.mock('./appBridge', () => ({
    appBridge: {
        postHaptic: (...args: unknown[]) => postHaptic(...args),
    },
}));

beforeEach(() => {
    jest.clearAllMocks();
    mockNative = true;
});

describe('haptics', () => {
    it('posts the kind to the shell without waiting for an answer', () => {
        haptics.play('selection');
        haptics.play('impact');

        expect(postHaptic).toHaveBeenNthCalledWith(1, 'selection');
        expect(postHaptic).toHaveBeenNthCalledWith(2, 'impact');
    });

    it('asks nothing in a browser', () => {
        mockNative = false;

        haptics.play('impact');

        expect(postHaptic).not.toHaveBeenCalled();
    });
});
