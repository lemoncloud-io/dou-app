/**
 * `lib/report-logs/pinAxes.ts`
 * - The pinnable axes and their labels, in one place.
 *
 * `PinButton` and `TrackingPins` both name these axes for the operator, and the label had
 * already been written out twice. They must agree: the button says "유저 u1 로 추적" and
 * the chip that appears says "유저 u1", and a mismatch between them reads as two different
 * filters.
 */

/**
 * Axes that can be pinned. These three are exactly the identity axes the backend can
 * filter on — `saveLogEntry` hoists `uid`/`cid`/`runId` onto the record, and nothing else
 * about a log is queryable — which is why pinning is the console's central gesture rather
 * than a shortcut for something the search box could do.
 */
export const PIN_KEYS = ['uid', 'cid', 'runId'] as const;

export type PinKey = (typeof PIN_KEYS)[number];

export const PIN_LABEL: Record<PinKey, string> = {
    uid: '유저',
    cid: '클라우드',
    runId: '실행',
};
