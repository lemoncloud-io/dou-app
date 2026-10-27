import type { BillingEmail, BillingInfo } from '../types';

/**
 * The verified primary billing address, or `undefined`. A checkout needs one — the payment notices go
 * there — so the payment details screen sends a reader without one back to the email step first.
 */
export const primaryVerifiedEmail = (info: BillingInfo | undefined): BillingEmail | undefined =>
    info?.emails.find(email => email.primary && email.status === 'verified');
