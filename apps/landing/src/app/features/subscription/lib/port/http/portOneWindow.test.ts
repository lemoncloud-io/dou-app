import { windowResultOf } from './portOneWindow';

vi.mock('@portone/browser-sdk/v2', () => ({ requestIssueBillingKey: vi.fn() }));

describe('windowResultOf', () => {
    it('takes a billing key as the registered card', () => {
        expect(windowResultOf({ billingKey: 'bk-1' })).toEqual({ outcome: 'registered', billingKey: 'bk-1' });
    });

    it('reads a code as a failure and no answer as a closed window', () => {
        expect(windowResultOf({ code: 'FAILURE_TYPE_PG', billingKey: '' })).toEqual({ outcome: 'failed' });
        expect(windowResultOf(undefined)).toEqual({ outcome: 'closed' });
    });

    it('reads the reader cancelling in the window as closed, by what the answer says', () => {
        // As measured on the test channel when the window was closed and the cancel question confirmed.
        expect(
            windowResultOf({
                code: 'FAILURE_TYPE_PG',
                message: '사용자가 빌링키 발급을 취소하였습니다',
                billingKey: 'ignored',
            })
        ).toEqual({ outcome: 'closed' });
        expect(windowResultOf({ code: 'FAILURE_TYPE_PG', pgMessage: '고객 취소' })).toEqual({ outcome: 'closed' });
    });

    it('keeps a refusal that is not a cancel a failure', () => {
        expect(windowResultOf({ code: 'FAILURE_TYPE_PG', message: '카드 정보가 올바르지 않습니다' })).toEqual({
            outcome: 'failed',
        });
    });
});
