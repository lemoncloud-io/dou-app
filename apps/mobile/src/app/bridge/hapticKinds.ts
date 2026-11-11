import type { HapticKind } from '@chatic/bridge-messages';

/**
 * Every kind this build's native `Haptic` module plays; both WebViews' handlers accept exactly these.
 * A file of its own, free of React Native, so a handler can import it without the native bridges.
 */
export const HAPTIC_KINDS: readonly HapticKind[] = ['selection', 'impact', 'success', 'warning', 'error'];
