import { tabStore } from '../../../storage';

import type { Payer, PlanId } from '@chatic/web-checkout';

export interface PendingDetails {
    country: string;
    emailId?: string;
    payer?: Payer;
}

const KEY = 'subscription.pendingCheckout';
const MAX_AGE_MS = 15 * 60_000;

interface Saved {
    planId: PlanId;
    details: PendingDetails;
    savedAt: number;
}

export interface PendingCheckout {
    planId: PlanId;
    details: PendingDetails;
}

export const savePendingCheckout = (pending: PendingCheckout, now: number = Date.now()): void => {
    try {
        tabStore.set(KEY, JSON.stringify({ ...pending, savedAt: now } satisfies Saved));
    } catch {
        // Without storage a phone's checkout cannot come back; a desktop window never needed it.
    }
};

export const peekPendingCheckout = (planId: string | null, now: number = Date.now()): PendingCheckout | undefined => {
    try {
        const raw = tabStore.get(KEY);
        if (!raw) return undefined;
        const saved = JSON.parse(raw) as Partial<Saved>;
        const fresh = typeof saved.savedAt === 'number' && now - saved.savedAt <= MAX_AGE_MS;
        return fresh && saved.planId === planId && saved.details && saved.planId
            ? { planId: saved.planId, details: saved.details }
            : undefined;
    } catch {
        return undefined;
    }
};

export const clearPendingCheckout = (): void => {
    try {
        tabStore.remove(KEY);
    } catch {
        // Nothing to clear.
    }
};

const CARD_KEY = 'subscription.pendingCardChange';

export const savePendingCardChange = (payer: Payer, now: number = Date.now()): void => {
    try {
        tabStore.set(CARD_KEY, JSON.stringify({ payer, savedAt: now }));
    } catch {
        // Without storage a phone's card change cannot come back; a desktop window never needed it.
    }
};

export const takePendingCardChange = (now: number = Date.now()): Payer | undefined => {
    try {
        const raw = tabStore.get(CARD_KEY);
        tabStore.remove(CARD_KEY);
        if (!raw) return undefined;
        const saved = JSON.parse(raw) as { payer?: Payer; savedAt?: unknown };
        const fresh = typeof saved.savedAt === 'number' && now - saved.savedAt <= MAX_AGE_MS;
        return fresh ? saved.payer : undefined;
    } catch {
        return undefined;
    }
};
