import type { BillingEmail, BillingInfo } from '../types';

export const primaryVerifiedEmail = (info: BillingInfo | undefined): BillingEmail | undefined =>
    info?.emails.find(email => email.primary && email.status === 'verified');
