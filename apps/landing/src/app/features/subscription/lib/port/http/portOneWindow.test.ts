import { windowResultOf } from './portOneWindow';

vi.mock('@portone/browser-sdk/v2', () => ({ requestIssueBillingKey: vi.fn() }));

describe('windowResultOf', () => {
    it('takes a billing key as the registered card', () => {
        expect(windowResultOf({ billingKey: 'bk-1' })).toEqual({ outcome: 'registered', billingKey: 'bk-1' });
    });

    it('reads any code as a failure and no answer as a closed window', () => {
        expect(windowResultOf({ code: 'FAILURE_TYPE_PG', billingKey: '' })).toEqual({ outcome: 'failed' });
        expect(windowResultOf(undefined)).toEqual({ outcome: 'closed' });
    });
});
