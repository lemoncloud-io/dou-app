import type { AttemptPurpose, PlanId, RegistrationOutcome } from '../types';

export interface PaymentWindowRequest {
    purpose: AttemptPurpose;
    planId?: PlanId;
    suggested: RegistrationOutcome;
}

export type PaymentWindowPresenter = (request: PaymentWindowRequest) => Promise<RegistrationOutcome>;

export interface PaymentWindowHost {
    setPaymentWindow(presenter: PaymentWindowPresenter | null): void;
}
