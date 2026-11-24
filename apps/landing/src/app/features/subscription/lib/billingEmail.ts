import type { BillingEmail, BillingInfo } from '@chatic/web-checkout';

export const primaryVerifiedEmail = (info: BillingInfo | undefined): BillingEmail | undefined =>
    info?.emails.find(email => email.primary && email.status === 'verified');
