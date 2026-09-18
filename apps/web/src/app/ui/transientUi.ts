import { toast } from 'sonner';

import { onTransientUiTransition } from '../navigation/stackObserver';

/**
 * Transient UI that a route transition retires — today, the in-app push banner.
 *
 * This file is the seam. The navigation module decides WHEN a transition retires transient UI and
 * knows nothing about toasts; this decides WHAT is retired and knows nothing about history. The
 * banner's id lives here rather than beside the hook that raises it because two parties now need
 * it: the one that shows it, and the one that takes it away.
 */

/** Fixed toast id so consecutive pushes replace the banner instead of stacking. */
export const IN_APP_PUSH_TOAST_ID = 'in-app-push-message';

/**
 * Dismisses the in-app push banner, and only it.
 *
 * `toast.dismiss(id)`, never a bare `toast.dismiss()`. Clearing everything would also take out the
 * confirmation and error toasts raised by whatever the reader just did — so the action that caused
 * the navigation would lose its own feedback on arrival.
 *
 * The cloud-activation banner is deliberately left alone: it has no click target and reports an
 * account event rather than something about the screen, so moving screens does not make it stale.
 */
export const dismissTransientUi = (): void => {
    // Braces, not a concise body: `toast.dismiss` returns the id it dismissed, and returning that
    // from a `void` function is a type error.
    toast.dismiss(IN_APP_PUSH_TOAST_ID);
};

/**
 * Wires transitions to the dismissal, returning the unsubscribe.
 *
 * Called from the hook that owns the banner rather than at import time: a side effect on import
 * would register in any test that touches this module, and the registration would outlive whatever
 * caused it.
 */
export const installTransientUiDismissal = (): (() => void) => onTransientUiTransition(dismissTransientUi);
