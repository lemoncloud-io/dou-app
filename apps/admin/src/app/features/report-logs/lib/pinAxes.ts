/**
 * `lib/report-logs/pinAxes.ts`
 * - The pinnable axes, in one place.
 *
 * `PinButton` and `TrackingPins` both name these axes for the operator, and both read the name
 * from the same `allLogs` key (`pins.axis.<key>`). They must agree: the button says "Track user
 * u1" and the chip that appears says "user u1", and a mismatch between them reads as two
 * different filters.
 */

/**
 * Axes that can be pinned. These three are exactly the identity axes the backend can
 * filter on — `saveLogEntry` hoists `uid`/`cid`/`runId` onto the record, and nothing else
 * about a log is queryable — which is why pinning is the console's central gesture rather
 * than a shortcut for something the search box could do.
 */
export const PIN_KEYS = ['uid', 'cid', 'runId'] as const;

export type PinKey = (typeof PIN_KEYS)[number];
