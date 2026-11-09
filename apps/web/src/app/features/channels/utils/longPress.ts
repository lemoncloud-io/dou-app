/**
 * Press-and-hold threshold for every long-press gesture on the chat surfaces.
 *
 * One value, shared: the message bubble and the reaction chips both open a sheet this way, and
 * two thresholds would make the same gesture feel like two different gestures depending on where
 * the thumb landed.
 */
export const LONG_PRESS_DELAY_MS = 450;

/**
 * How far the finger may drift and still count as a hold rather than a scroll — a fingertip's
 * wobble. A touch captures the pointer to its target, so a scroll that starts on a hold target
 * fires neither `pointerleave` nor `pointercancel` until the finger lifts; drift is the only signal.
 */
export const MOVE_CANCEL_PX = 10;
