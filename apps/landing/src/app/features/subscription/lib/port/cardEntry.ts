import type { Money, RegistrationOutcome } from '../../types';

/**
 * Where a card is typed into our own page rather than into a payment provider's window.
 *
 * The won provider opens a window of its own; the dollar provider instead hands over a card field that
 * goes inside a dialog of ours, under our consent line. The port knows the provider and the screens do
 * not, so the port asks through this channel and a dialog mounted at the route root (`CardEntryWindow`)
 * answers. Nothing here names a provider: the request carries what the dialog draws and two callbacks
 * the provider's code fills in.
 */

/** What the consent line under the card field states: what is charged, when and how often. */
export interface CardEntryTerms {
    /** The monthly charge. */
    amount?: Money;
    /** The first charge — the end of a trial, or today. */
    firstChargeAt?: string;
    withTrial?: boolean;
}

/** How one press of the dialog's button ended. */
export type CardEntryConfirmation =
    /** The card is registered: the dialog closes. */
    | { outcome: 'registered' }
    /** The card company refused it, or the provider failed: the dialog closes as a failed window. */
    | { outcome: 'failed' }
    /** The reader backed out of the card's authentication: the dialog closes as a closed window. */
    | { outcome: 'closed' }
    /** Something to fix in the field itself, which the field shows: the dialog stays open. */
    | { outcome: 'retry' };

export interface CardEntryRequest {
    terms: CardEntryTerms;
    /**
     * Puts the provider's card field into `node`, in the page's language, resolving once the reader can
     * type into it.
     */
    mount(node: HTMLElement, language: string): Promise<void>;
    /** Registers the card typed in. Never rejects: every way it can end is a confirmation. */
    confirm(): Promise<CardEntryConfirmation>;
    /** Takes the field away again. */
    unmount(): void;
}

export interface CardEntryChannel {
    /** Shows the dialog for `request` and resolves with how it ended. */
    open(request: CardEntryRequest): Promise<RegistrationOutcome>;
    /** The request the dialog should show, or `null`. */
    pending(): CardEntryRequest | null;
    subscribe(listener: () => void): () => void;
    /** Called by the dialog: ends the request in hand. */
    finish(outcome: RegistrationOutcome): void;
}

/**
 * One dialog at a time: a request still open when another arrives is ended as closed, so its caller is
 * not left waiting on a promise nothing will settle.
 */
export const createCardEntryChannel = (): CardEntryChannel => {
    let request: CardEntryRequest | null = null;
    let settle: ((outcome: RegistrationOutcome) => void) | null = null;
    const listeners = new Set<() => void>();
    const notify = () => listeners.forEach(listener => listener());

    const finish = (outcome: RegistrationOutcome) => {
        const done = settle;
        request = null;
        settle = null;
        notify();
        done?.(outcome);
    };

    return {
        open: next =>
            new Promise<RegistrationOutcome>(resolve => {
                if (settle) finish('closed');
                request = next;
                settle = resolve;
                notify();
            }),
        pending: () => request,
        subscribe: listener => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        finish,
    };
};
