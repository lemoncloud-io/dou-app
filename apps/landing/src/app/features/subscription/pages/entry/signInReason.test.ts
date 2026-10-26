import { SubscriptionPortError } from '../../lib/port';
import { reasonOfSignInError, signInReasonOf } from './signInReason';

describe('signInReasonOf', () => {
    it.each(['canceled', 'expired-attempt', 'failed', 'session-ended'])('keeps the known reason %s', reason => {
        expect(signInReasonOf(reason)).toBe(reason);
    });

    it.each([null, '', 'unknown', '<script>'])('drops %s', value => {
        expect(signInReasonOf(value)).toBeUndefined();
    });
});

describe('reasonOfSignInError', () => {
    it('names a canceled sign-in', () => {
        expect(reasonOfSignInError(new SubscriptionPortError('signInCanceled'))).toBe('canceled');
    });

    it('names a sign-in that came back too late', () => {
        expect(reasonOfSignInError(new SubscriptionPortError('signInExpired'))).toBe('expired-attempt');
    });

    it('calls anything else a failure', () => {
        expect(reasonOfSignInError(new SubscriptionPortError('network'))).toBe('failed');
        expect(reasonOfSignInError(new Error('boom'))).toBe('failed');
    });
});
