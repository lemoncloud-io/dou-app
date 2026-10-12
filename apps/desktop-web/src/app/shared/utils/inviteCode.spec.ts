import { describe, expect, it, vi } from 'vitest';

import { composeInviteCode, resolveInviteCode } from './inviteCode';

describe('composeInviteCode', () => {
    it('assembles the full code the cancel/reject calls take', () => {
        expect(composeInviteCode({ id: 'abc', code: 'zz99' })).toBe('invt:abc:zz99');
    });

    it('yields nothing when the row carries no code', () => {
        expect(composeInviteCode({ id: 'abc', code: '' })).toBeUndefined();
        expect(composeInviteCode({ id: '', code: 'zz99' })).toBeUndefined();
    });
});

describe('resolveInviteCode', () => {
    it('uses the current list first without refetching', async () => {
        const refetch = vi.fn(async () => ({ data: [] }));

        const code = await resolveInviteCode([{ id: 'a', code: 'k1' }], refetch, 'a');

        expect(code).toBe('invt:a:k1');
        expect(refetch).not.toHaveBeenCalled();
    });

    it('re-asks the server once on a cache-first miss', async () => {
        const refetch = vi.fn(async () => ({ data: [{ id: 'b', code: 'k2' }] }));

        const code = await resolveInviteCode([{ id: 'b', code: '' }], refetch, 'b');

        expect(code).toBe('invt:b:k2');
        expect(refetch).toHaveBeenCalledTimes(1);
    });

    it('yields nothing when the invite is genuinely gone', async () => {
        const refetch = vi.fn(async () => ({ data: [] }));

        await expect(resolveInviteCode([], refetch, 'ghost')).resolves.toBeUndefined();
    });
});
