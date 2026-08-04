import type { DomainProfile } from '@chatic/data';

import { isPlaceProfileAbsent, type MyPlaceProfileReader } from './placeProfile';

jest.mock('@chatic/bridges', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));

const reader = (result: Partial<DomainProfile> | null): MyPlaceProfileReader => ({
    getMyProfile: jest.fn().mockResolvedValue(result as DomainProfile | null),
});

describe('isPlaceProfileAbsent', () => {
    it('present: a nick means the profile exists', async () => {
        await expect(isPlaceProfileAbsent(reader({ nick: 'sunny', active: false }))).resolves.toBe(false);
    });

    it('absent: no nick AND active === false is the definite verdict', async () => {
        await expect(isPlaceProfileAbsent(reader({ active: false }))).resolves.toBe(true);
    });

    it('treats a whitespace-only nick as no nick', async () => {
        await expect(isPlaceProfileAbsent(reader({ nick: '   ', active: false }))).resolves.toBe(true);
    });

    // Fail open: the create form seeds from an empty nick, so guessing "absent" risks overwriting.
    it.each([
        ['active is true', { active: true }],
        ['active is undefined', {}],
        ['the response is null', null],
    ])('inconclusive when %s — fails open', async (_label, result) => {
        await expect(isPlaceProfileAbsent(reader(result))).resolves.toBe(false);
    });

    it('fails open when the read throws', async () => {
        const throwing: MyPlaceProfileReader = { getMyProfile: jest.fn().mockRejectedValue(new Error('offline')) };

        await expect(isPlaceProfileAbsent(throwing)).resolves.toBe(false);
    });
});
