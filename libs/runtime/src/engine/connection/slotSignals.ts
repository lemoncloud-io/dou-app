import { sessionSignal } from '@chatic/session';
import type { SessionSignalKind } from '@chatic/session';

const SLOT_SIGNALS: readonly SessionSignalKind[] = ['relay:token', 'cloud:token', 'selection'];

export const subscribeSlotSignals = (listener: () => void): (() => void) =>
    sessionSignal.subscribe(SLOT_SIGNALS, listener);
