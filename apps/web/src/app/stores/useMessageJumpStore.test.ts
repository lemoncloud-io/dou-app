import { useMessageJumpStore } from './useMessageJumpStore';

beforeEach(() => {
    useMessageJumpStore.setState({ target: null });
});

describe('useMessageJumpStore', () => {
    it('starts with no pending target', () => {
        expect(useMessageJumpStore.getState().target).toBeNull();
    });

    it('request sets the target with the given channelId/chatNo', () => {
        useMessageJumpStore.getState().request('ch-1', 42);

        const { target } = useMessageJumpStore.getState();
        expect(target?.channelId).toBe('ch-1');
        expect(target?.chatNo).toBe(42);
    });

    it('clear resets the target to null', () => {
        useMessageJumpStore.getState().request('ch-1', 42);
        useMessageJumpStore.getState().clear();

        expect(useMessageJumpStore.getState().target).toBeNull();
    });

    it('bumps the nonce on every request, even across a clear() in between', () => {
        useMessageJumpStore.getState().request('ch-1', 5);
        const firstNonce = useMessageJumpStore.getState().target?.nonce;

        useMessageJumpStore.getState().clear();

        useMessageJumpStore.getState().request('ch-1', 5);
        const secondNonce = useMessageJumpStore.getState().target?.nonce;

        expect(secondNonce).not.toBe(firstNonce);
    });
});
