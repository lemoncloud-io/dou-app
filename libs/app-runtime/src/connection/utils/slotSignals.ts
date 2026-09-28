import { sessionSignal } from '../../session/store';
import type { SessionSignalKind } from '../../session/store';

/**
 * The slices the socket slots are derived from — deliberately NOT `identity` (ADR-0076 E5).
 *
 * Every input moves on one of these three: relay `wss`/`identityToken` on `relay:token`,
 * `cloud.isActive`/`wss`/`identityToken` and the committed cloud id on `cloud:token`, and the
 * selected cloud on `selection`. Identity has its own signal and fires without any of them — boot
 * alone emits it twice (`setSessionIdentityState`) and every login adds one, each of which used to
 * re-render the slot derivation and hand both binders a new-but-equal slots object.
 *
 * The matching narrow snapshot (`getSocketSlotContext`) is what keeps this honest: subscribing to a
 * subset while READING the full context would render stale values silently.
 */
const SLOT_SIGNALS: readonly SessionSignalKind[] = ['relay:token', 'cloud:token', 'selection'];

/**
 * Stable reference — `useSyncExternalStore` re-subscribes whenever this identity changes. Shared by
 * the slot derivation and the background token preparer, which re-checks on the same signals.
 */
export const subscribeSlotSignals = (listener: () => void): (() => void) =>
    sessionSignal.subscribe(SLOT_SIGNALS, listener);
