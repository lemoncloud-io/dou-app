/**
 * `lib/cloud-deployments/requestError.spec.ts`
 */
import { describe, expect, it } from 'vitest';

import { asRequestError, describeRequestError } from './requestError';

describe('describeRequestError', () => {
    it('shows the response body as it came', () => {
        expect(describeRequestError({ response: { status: 400, data: 'product is busy' } }, 'x')).toBe(
            'product is busy'
        );
        expect(describeRequestError({ response: { status: 404, data: { message: 'not found' } } }, 'x')).toBe(
            'not found'
        );
        expect(describeRequestError({ response: { status: 500, data: { code: 'X' } } }, 'x')).toBe('{"code":"X"}');
    });

    it('falls back to the status when the body is empty', () => {
        expect(describeRequestError({ response: { status: 502, data: '' } }, 'x')).toBe('HTTP 502');
    });

    it('names a reply-less failure and the service it came from', () => {
        expect(describeRequestError(new Error('Network Error'), 'the relay')).toMatch(
            /^No response from the relay \(Network Error\)/
        );
    });
});

describe('asRequestError', () => {
    it('keeps the original failure as the cause', () => {
        const original = { response: { status: 403, data: 'Forbidden' } };
        expect(asRequestError(original, 'x')).toMatchObject({ message: 'Forbidden', cause: original });
    });
});
