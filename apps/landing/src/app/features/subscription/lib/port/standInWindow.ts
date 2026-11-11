import type { AttemptPurpose, PlanId, RegistrationOutcome } from '../../types';

/**
 * The stand-in card window (`MockPaymentWindow`): a dialog that asks how a card window ends —
 * registered, failed or closed — in place of a payment provider's window. Sandbox payments use it,
 * since the payment server's mock provider gives no real window to open, and so do the tests' fake
 * server. Whatever opens it is a host: the window hands the host a presenter, and the host calls the
 * presenter with each request.
 */

/** One request to the stand-in window, and the outcome it suggests. */
export interface PaymentWindowRequest {
    purpose: AttemptPurpose;
    planId?: PlanId;
    /** The outcome the window offers first. */
    suggested: RegistrationOutcome;
}

export type PaymentWindowPresenter = (request: PaymentWindowRequest) => Promise<RegistrationOutcome>;

export interface PaymentWindowHost {
    setPaymentWindow(presenter: PaymentWindowPresenter | null): void;
}
