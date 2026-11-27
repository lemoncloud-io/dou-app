import { isWebhookExpired, toDomainIssuedWebhook, toDomainWebhook } from './webhook';

describe('webhook domain', () => {
    it('maps a wire view and never carries the token', () => {
        const row = toDomainWebhook({
            id: 'C-1-2',
            channelId: 'C-1',
            name: 'ci',
            disabled: true,
            expiresAt: 5,
            lastUsedAt: 3,
            createdAt: 1,
            Token: 'wh:secret',
        });
        expect(row).toEqual({
            id: 'C-1-2',
            channelId: 'C-1',
            name: 'ci',
            desc: '',
            paused: true,
            expiresAt: 5,
            lastUsedAt: 3,
            createdAt: 1,
        });
        expect(JSON.stringify(row)).not.toContain('secret');
    });

    it('defaults missing fields', () => {
        expect(toDomainWebhook({})).toMatchObject({ id: '', paused: false, expiresAt: 0, lastUsedAt: 0 });
    });

    it('maps an issue response with its token and location', () => {
        const issued = toDomainIssuedWebhook({ id: 'x', Token: 'wh:x:y', Location: 'https://h/hello/webhook' });
        expect(issued?.token).toBe('wh:x:y');
        expect(issued?.location).toBe('https://h/hello/webhook');
        expect(JSON.stringify(issued?.webhook)).not.toContain('wh:x:y');
    });

    it('rejects an issue response without a token and drops an empty location', () => {
        expect(toDomainIssuedWebhook({ id: 'x' })).toBeUndefined();
        expect(toDomainIssuedWebhook({ id: 'x', Token: 't', Location: '' })?.location).toBeUndefined();
    });

    it('treats 0 as never expiring and a past time as expired', () => {
        expect(isWebhookExpired({ expiresAt: 0 }, 10)).toBe(false);
        expect(isWebhookExpired({ expiresAt: 11 }, 10)).toBe(false);
        expect(isWebhookExpired({ expiresAt: 10 }, 10)).toBe(true);
    });
});
