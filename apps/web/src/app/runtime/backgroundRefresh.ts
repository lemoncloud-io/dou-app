type RefreshHandler = () => Promise<void>;

let handler: RefreshHandler | null = null;

/**
 * Hands the background sync's "refresh now" to whoever asks for it by gesture — home's
 * pull-to-refresh — without that surface mounting a second copy of the sync. `useBackgroundSync`
 * lives once under `AppRuntime`, and a screen cannot reach into a hook mounted elsewhere, so the
 * runner registers here and the screen calls {@link requestBackgroundRefresh}.
 *
 * Returns the unregister. It only clears the slot it filled, so a remount that registered a newer
 * handler first is not wiped by the older one's cleanup.
 */
export const registerBackgroundRefresh = (next: RefreshHandler): (() => void) => {
    handler = next;
    return () => {
        if (handler === next) handler = null;
    };
};

/**
 * Runs the background sync once, now, and settles when it has. With no runner mounted — signed
 * out, or a test that renders a screen alone — there is nothing to refresh, and it resolves at once
 * rather than leaving a caller's indicator up.
 */
export const requestBackgroundRefresh = (): Promise<void> => (handler ? handler() : Promise.resolve());
