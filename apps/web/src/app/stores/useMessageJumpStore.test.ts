import { isJumpTargetFor, useMessageJumpStore } from './useMessageJumpStore';

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

    it('carries the thread root when the target is a reply', () => {
        useMessageJumpStore.getState().request('ch-1', 42, { threadRootNo: '7' });

        expect(useMessageJumpStore.getState().target?.threadRootNo).toBe('7');
    });
});

describe('isJumpTargetFor', () => {
    it('gives a room target to the room and to no thread', () => {
        useMessageJumpStore.getState().request('ch-1', 42);
        const { target } = useMessageJumpStore.getState();

        expect(isJumpTargetFor(target, 'ch-1')).toBe(true);
        expect(isJumpTargetFor(target, 'ch-1', '7')).toBe(false);
    });

    it('gives a reply target to its own thread only, never to the room', () => {
        useMessageJumpStore.getState().request('ch-1', 42, { threadRootNo: '7' });
        const { target } = useMessageJumpStore.getState();

        expect(isJumpTargetFor(target, 'ch-1', '7')).toBe(true);
        expect(isJumpTargetFor(target, 'ch-1')).toBe(false);
        expect(isJumpTargetFor(target, 'ch-1', '8')).toBe(false);
        expect(isJumpTargetFor(target, 'ch-2', '7')).toBe(false);
    });

    it('is false with no target', () => {
        expect(isJumpTargetFor(null, 'ch-1')).toBe(false);
    });
});
