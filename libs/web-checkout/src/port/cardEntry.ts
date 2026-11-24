import type { Money, RegistrationOutcome } from '../types';

export interface CardEntryTerms {
    amount?: Money;
    firstChargeAt?: string;
    withTrial?: boolean;
}

export type CardEntryConfirmation =
    | { outcome: 'registered' }
    | { outcome: 'failed' }
    | { outcome: 'closed' }
    | { outcome: 'retry' };

export interface CardEntryRequest {
    terms: CardEntryTerms;
    mount(node: HTMLElement, language: string): Promise<void>;
    confirm(): Promise<CardEntryConfirmation>;
    unmount(): void;
}

export interface CardEntryChannel {
    open(request: CardEntryRequest): Promise<RegistrationOutcome>;
    pending(): CardEntryRequest | null;
    subscribe(listener: () => void): () => void;
    finish(outcome: RegistrationOutcome): void;
}

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
