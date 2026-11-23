export const PIN_KEYS = ['uid', 'cid', 'runId'] as const;

export type PinKey = (typeof PIN_KEYS)[number];
