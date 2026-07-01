/**
 * Subscribes every channel id to realtime sync and returns a single disposer that tears
 * all of them down. Registering a channel is what makes the socket deliver its ChannelView
 * (which carries `$join` and `lastChat$` inline) into the local cache, so this is the step
 * that keeps the read boundary and last-chat fresh for unread computation.
 *
 * Kept as a pure function (register injected) so the reconcile/teardown contract is unit
 * testable without the socket runtime; the hook wires it to getSyncManager().registerChannel.
 */
export const registerChannels = (ids: string[], register: (id: string) => () => void): (() => void) => {
    const disposers = ids.map(id => register(id));
    return () => disposers.forEach(dispose => dispose());
};
