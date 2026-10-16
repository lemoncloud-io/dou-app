import { ShellFailure, toHostHandler } from './handlerTable';

const request = { type: 'FetchBadgeBase' as const, refId: 'r1', data: undefined } as never;

describe('toHostHandler', () => {
    it('answers with the reply type the contract pairs with the request', async () => {
        const handler = toHostHandler('FetchBadgeBase', () => ({ base: 2 }));

        await expect(handler(request)).resolves.toEqual({ type: 'OnFetchBadgeBase', success: true, data: { base: 2 } });
    });

    it('answers a ShellFailure as success: false with its code', async () => {
        const handler = toHostHandler('FetchBadgeBase', () => new ShellFailure('BUSY', 'try later'));

        await expect(handler(request)).resolves.toEqual({
            type: 'OnFetchBadgeBase',
            success: false,
            error: { code: 'BUSY', message: 'try later' },
        });
    });

    it('sends nothing when the handler returns nothing', async () => {
        const handler = toHostHandler('SendLog', () => undefined);

        await expect(handler(request)).resolves.toBeUndefined();
    });
});
