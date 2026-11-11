import { windowResultOf, windowResultOfQuery } from './windowReturn';

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

describe('windowResultOfQuery', () => {
    it('reads the card from a return that carries a billing key', () => {
        expect(
            windowResultOfQuery(
                new URLSearchParams('plan=pro-tier-01&billingKey=bk-1&transactionType=ISSUE_BILLING_KEY')
            )
        ).toEqual({
            outcome: 'registered',
            billingKey: 'bk-1',
        });
    });

    it('reads a return with a code as the failure it says, a cancel included', () => {
        expect(
            windowResultOfQuery(
                new URLSearchParams(
                    'plan=pro-tier-01&code=FAILURE_TYPE_PG&message=%EC%82%AC%EC%9A%A9%EC%9E%90%EA%B0%80+%EC%B7%A8%EC%86%8C'
                )
            )
        ).toEqual({ outcome: 'closed' });
        expect(windowResultOfQuery(new URLSearchParams('code=FAILURE_TYPE_PG&message=declined'))).toEqual({
            outcome: 'failed',
        });
    });

    it('says nothing for a return with no result, instead of taking it for a closed window', () => {
        expect(windowResultOfQuery(new URLSearchParams('plan=pro-tier-01'))).toBeUndefined();
    });
});
