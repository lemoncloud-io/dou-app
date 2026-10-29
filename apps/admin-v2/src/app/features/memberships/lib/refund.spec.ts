/**
 * `lib/memberships/refund.spec.ts`
 */
import { describe, expect, it } from 'vitest';

import {
    describeRefundFailure,
    isRefundReasonValid,
    isWebSubscription,
    refundAvailability,
    refundEndpointFor,
} from './refund';

import type { MembershipView } from '@lemoncloud/chatic-backend-api';

const DEV = 'https://api.example.com/dou-d1';
const PROD = 'https://api.example.com/dou-v1';

// `portone` and `pending` are not in the installed package's unions, hence the cast through unknown.
const membership = (over: Record<string, unknown> = {}): MembershipView =>
    ({ userId: '1000904', platform: 'portone', status: 'active', ...over }) as unknown as MembershipView;

describe('isWebSubscription', () => {
    it('is true only for the payments-side platform', () => {
        expect(isWebSubscription(membership())).toBe(true);
        expect(isWebSubscription(membership({ platform: 'apple' }))).toBe(false);
        expect(isWebSubscription(membership({ platform: 'google' }))).toBe(false);
        expect(isWebSubscription(membership({ platform: undefined }))).toBe(false);
    });
});

describe('refundEndpointFor', () => {
    it('swaps the stage segment of a conventional relay endpoint', () => {
        expect(refundEndpointFor(PROD, 'd1')).toBe(DEV);
        expect(refundEndpointFor(DEV, 'd1')).toBe(DEV);
        expect(refundEndpointFor(DEV, 'v1')).toBe(PROD);
    });

    // `relayBaseFor` would append `/dou-d1` to any host; a refund must not trust a URL made up that way.
    it('produces nothing when the configured endpoint names no stage', () => {
        expect(refundEndpointFor('https://relay.example.com', 'd1')).toBe('');
        expect(refundEndpointFor('https://api.example.com/v1', 'd1')).toBe('');
        expect(refundEndpointFor(undefined, 'd1')).toBe('');
    });
});

describe('refundAvailability', () => {
    it('is enabled for a running web subscription on Development', () => {
        expect(refundAvailability(membership(), DEV)).toEqual({ enabled: true });
    });

    it('is disabled on Production, whatever the membership', () => {
        const result = refundAvailability(membership(), PROD);
        expect(result.enabled).toBe(false);
        expect(result.reason).toMatch(/Production refunds are not open/);
    });

    // An endpoint naming no stage could be anything, production included.
    it('is disabled when the endpoint names no known stage', () => {
        expect(refundAvailability(membership(), 'https://api.example.com/v1').enabled).toBe(false);
    });

    it('says there is no relay, not "Production", when no endpoint was produced', () => {
        const result = refundAvailability(membership(), '');
        expect(result.enabled).toBe(false);
        expect(result.reason).toMatch(/No relay to refund on/);
        expect(refundAvailability(membership(), undefined).reason).toMatch(/No relay to refund on/);
    });

    it('accepts a trailing slash on the Development endpoint', () => {
        expect(refundAvailability(membership(), `${DEV}/`).enabled).toBe(true);
    });

    it('is disabled while the first charge is still pending', () => {
        const result = refundAvailability(membership({ status: 'pending' }), DEV);
        expect(result.enabled).toBe(false);
        expect(result.reason).toMatch(/still being confirmed/);
    });

    it('is disabled once the membership has expired', () => {
        const result = refundAvailability(membership({ status: 'expired' }), DEV);
        expect(result.enabled).toBe(false);
        expect(result.reason).toMatch(/Already expired/);
    });

    it('is disabled without a userId to address', () => {
        expect(refundAvailability(membership({ userId: '' }), DEV).enabled).toBe(false);
    });

    // A trial reads `status: active` in the membership view; the relay is the one that refuses it.
    it('leaves a trial (which reads as active) to the relay', () => {
        expect(refundAvailability(membership({ status: 'active', trialUsed: true }), DEV).enabled).toBe(true);
    });
});

describe('isRefundReasonValid', () => {
    it('rejects an empty or whitespace-only reason', () => {
        expect(isRefundReasonValid('')).toBe(false);
        expect(isRefundReasonValid('   ')).toBe(false);
    });

    it('accepts any non-blank reason', () => {
        expect(isRefundReasonValid('test refund')).toBe(true);
    });
});

describe('describeRefundFailure', () => {
    const httpError = (status: number, data: unknown) => ({
        message: `Request failed with status code ${status}`,
        response: { status, data },
    });

    it('explains a 409 and keeps the relay text', () => {
        const text = describeRefundFailure(httpError(409, '409 CONFLICT - nothing to refund @refund(subscription/1)'));
        expect(text).toMatch(/^No paid charge to refund/);
        expect(text).toContain('409 CONFLICT - nothing to refund @refund(subscription/1)');
    });

    it('explains a 404 and a 403', () => {
        expect(describeRefundFailure(httpError(404, '404 NOT FOUND - subscription'))).toMatch(/no web subscription/);
        expect(describeRefundFailure(httpError(403, '403 NOT ALLOWED - only for admin'))).toMatch(/not an admin/);
    });

    it('reads the status off the relay text when the error carries none', () => {
        expect(describeRefundFailure(new Error('409 CONFLICT - payment is not started'))).toMatch(
            /^No paid charge to refund/
        );
    });

    it('reads a message out of an object body', () => {
        expect(describeRefundFailure(httpError(500, { message: 'boom' }))).toBe('boom');
    });

    it('falls back to the transport message, then to a generic line', () => {
        expect(describeRefundFailure(httpError(500, ''))).toBe('Request failed with status code 500');
        expect(describeRefundFailure(undefined)).toBe('The request failed.');
    });
});
