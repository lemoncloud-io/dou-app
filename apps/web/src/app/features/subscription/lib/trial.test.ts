import { isTrialEligible } from './trial';

describe('isTrialEligible', () => {
    it('trusts the server verdict over trialUsed', () => {
        expect(isTrialEligible({ trialEligible: false, trialUsed: false })).toBe(false);
        expect(isTrialEligible({ trialEligible: true, trialUsed: true })).toBe(true);
    });

    it('falls back to trialUsed when the server omits trialEligible', () => {
        expect(isTrialEligible({ trialUsed: true })).toBe(false);
        expect(isTrialEligible({ trialUsed: false })).toBe(true);
        expect(isTrialEligible({ trialEligible: null, trialUsed: true })).toBe(false);
    });

    it('is eligible with no membership at all', () => {
        expect(isTrialEligible(undefined)).toBe(true);
        expect(isTrialEligible({})).toBe(true);
    });
});
