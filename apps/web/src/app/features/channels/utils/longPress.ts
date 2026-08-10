/**
 * Press-and-hold threshold for every long-press gesture on the chat surfaces.
 *
 * One value, shared: the message bubble and the reaction chips both open a sheet this way, and
 * two thresholds would make the same gesture feel like two different gestures depending on where
 * the thumb landed.
 */
export const LONG_PRESS_DELAY_MS = 450;
