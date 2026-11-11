import { SubscriptionPortError } from '../errors';
import { isDeclinedPayment, portErrorOf } from './errors';

const httpError = (status: number, data: unknown = '') =>
    Object.assign(new Error(`status ${status}`), { response: { status, data } });

describe('portErrorOf', () => {
    it.each([
        [401, 'unauthenticated'],
        [403, 'unauthenticated'],
        [404, 'notFound'],
        [400, 'conflict'],
        [409, 'conflict'],
        [502, 'network'],
    ])('reads %i as %s', (status, code) => {
        expect(portErrorOf(httpError(status)).code).toBe(code);
    });

    it('reads a request that never got an answer as the network, and keeps the server message', () => {
        expect(portErrorOf(new Error('Network Error')).code).toBe('network');
        expect(portErrorOf(httpError(409, '409 CONFLICT - in use')).message).toBe('409 CONFLICT - in use');
    });

    it('tells a declined charge from any other 403 by the server message', () => {
        expect(isDeclinedPayment(httpError(403, '403 INVALID PAYMENT - card declined @start'))).toBe(true);
        expect(isDeclinedPayment(httpError(403, '403 NOT ALLOWED - main user only @start'))).toBe(false);
        expect(isDeclinedPayment(httpError(403, { message: 'Missing Authentication Token' }))).toBe(false);
    });

    it('passes a port error through', () => {
        const error = new SubscriptionPortError('limit');
        expect(portErrorOf(error)).toBe(error);
    });
});
