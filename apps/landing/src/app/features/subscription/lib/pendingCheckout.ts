import type { Payer, PlanId } from '../types';

/** What W-08 settled and W-05 needs: the same shape as the navigation state it hands over. */
export interface PendingDetails {
    country: string;
    emailId?: string;
    payer?: Payer;
}

/**
 * What a checkout has to remember across the trip to the payment provider's page. On a phone the
 * provider's window is its own page: the browser leaves for it and comes back to W-05 with the result,
 * and the navigation state W-08 handed over — the country, the billing email, the payer — does not
 * survive that. So it is kept here, in session storage (this tab, gone with it), from the moment the
 * window opens to the moment the return is read.
 *
 * It holds the payer's name, number and address, so it is short-lived: taken away as soon as it is used,
 * and not trusted past a quarter of an hour.
 */
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

const storageOf = (): Storage | undefined => {
    try {
        return window.sessionStorage;
    } catch {
        return undefined;
    }
};

export const savePendingCheckout = (pending: PendingCheckout, now: number = Date.now()): void => {
    try {
        storageOf()?.setItem(KEY, JSON.stringify({ ...pending, savedAt: now } satisfies Saved));
    } catch {
        // Without storage a phone's checkout cannot come back; a desktop window never needed it.
    }
};

/** The saved checkout for this plan, if there is a fresh one. Reads only — see `clearPendingCheckout`. */
export const peekPendingCheckout = (planId: string | null, now: number = Date.now()): PendingCheckout | undefined => {
    try {
        const raw = storageOf()?.getItem(KEY);
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
        storageOf()?.removeItem(KEY);
    } catch {
        // Nothing to clear.
    }
};

const CARD_KEY = 'subscription.pendingCardChange';

/**
 * A card change has less to remember than a checkout — only the payer, which the port needs to put the
 * new card on the subscription once the provider's page sends the reader back. Kept and taken away on
 * the same terms as a checkout.
 */
export const savePendingCardChange = (payer: Payer, now: number = Date.now()): void => {
    try {
        storageOf()?.setItem(CARD_KEY, JSON.stringify({ payer, savedAt: now }));
    } catch {
        // Without storage a phone's card change cannot come back; a desktop window never needed it.
    }
};

/** The payer of a card change that left the page, if a fresh one is waiting. Taken away when read. */
export const takePendingCardChange = (now: number = Date.now()): Payer | undefined => {
    try {
        const raw = storageOf()?.getItem(CARD_KEY);
        storageOf()?.removeItem(CARD_KEY);
        if (!raw) return undefined;
        const saved = JSON.parse(raw) as { payer?: Payer; savedAt?: unknown };
        const fresh = typeof saved.savedAt === 'number' && now - saved.savedAt <= MAX_AGE_MS;
        return fresh ? saved.payer : undefined;
    } catch {
        return undefined;
    }
};
