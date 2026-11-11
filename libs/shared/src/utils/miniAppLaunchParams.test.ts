import { buildMiniAppLaunchParams, MINI_APP_NAME_LIMIT } from './miniAppLaunchParams';
import { MINI_APP_LINK_LIMIT, MINI_APP_LINK_NAME_MAX } from './miniAppLinks';
import type { MiniAppLaunchInput } from './miniAppLaunchParams';

const input = (overrides: Partial<MiniAppLaunchInput> = {}): MiniAppLaunchInput => ({
    cloud: { id: 'cloud-1', name: 'Lemon' },
    place: { id: 'place-1', name: 'Design' },
    user: { id: 'uid-1', placeNick: 'Louis', profileName: 'Louis Kim' },
    isOwner: true,
    ...overrides,
});

describe('buildMiniAppLaunchParams', () => {
    it('carries the cloud, the place and the user, with isOwner for a first-party page', () => {
        expect(buildMiniAppLaunchParams(input(), 'firstParty')).toEqual({
            cloud: { id: 'cloud-1', name: 'Lemon' },
            place: { id: 'place-1', name: 'Design' },
            user: { id: 'uid-1', name: 'Louis', isOwner: true },
            miniApps: [],
        });
    });

    it("lists the cloud's mini apps to a first-party page by name and host, never the address", () => {
        const miniApps = [
            { id: 'a', name: 'Carrot', url: 'https://carrot.example/#download?ref=secret' },
            { id: 'b', name: 'Shop', url: 'https://shop.example/app' },
        ];
        expect(buildMiniAppLaunchParams(input({ miniApps }), 'firstParty').miniApps).toEqual([
            { id: 'a', name: 'Carrot', host: 'carrot.example' },
            { id: 'b', name: 'Shop', host: 'shop.example' },
        ]);
    });

    it.each(['reviewed', 'external'] as const)("tells a %s page nothing of the cloud's other mini apps", trust => {
        const miniApps = [{ id: 'a', name: 'Carrot', url: 'https://carrot.example/' }];
        expect('miniApps' in buildMiniAppLaunchParams(input({ miniApps }), trust)).toBe(false);
    });

    it('says isOwner false to a first-party page for a member', () => {
        expect(buildMiniAppLaunchParams(input({ isOwner: false }), 'firstParty').user.isOwner).toBe(false);
    });

    it.each(['reviewed', 'external'] as const)('leaves isOwner out for a %s page', trust => {
        const params = buildMiniAppLaunchParams(input(), trust);
        expect(params.user).toEqual({ id: 'uid-1', name: 'Louis' });
        expect('isOwner' in params.user).toBe(false);
    });

    it('falls back to the cloud profile name when the place has no nick', () => {
        expect(
            buildMiniAppLaunchParams(
                input({ user: { id: 'uid-1', placeNick: '  ', profileName: 'Louis Kim' } }),
                'reviewed'
            ).user.name
        ).toBe('Louis Kim');
        expect(
            buildMiniAppLaunchParams(
                input({ user: { id: 'uid-1', placeNick: null, profileName: 'Louis Kim' } }),
                'reviewed'
            ).user.name
        ).toBe('Louis Kim');
    });

    it('sends an empty name when the user has neither', () => {
        expect(buildMiniAppLaunchParams(input({ user: { id: 'uid-1' } }), 'reviewed').user.name).toBe('');
    });

    it('sends a null place when no place is open', () => {
        expect(buildMiniAppLaunchParams(input({ place: null }), 'external').place).toBeNull();
    });

    it('never carries a token key, at any depth', () => {
        for (const trust of ['firstParty', 'reviewed', 'external'] as const) {
            expect(JSON.stringify(buildMiniAppLaunchParams(input(), trust))).not.toMatch(/token/i);
        }
    });

    it('stays within 16 KiB serialized however long the names are', () => {
        const long = '\u0001'.repeat(50_000);
        const params = buildMiniAppLaunchParams(
            {
                cloud: { id: 'cloud-1', name: long },
                place: { id: 'place-1', name: long },
                user: { id: 'uid-1', placeNick: long },
                isOwner: true,
                miniApps: Array.from({ length: MINI_APP_LINK_LIMIT }, (_, i) => ({
                    id: `00000000-0000-4000-8000-00000000000${i}`,
                    name: '\u0001'.repeat(MINI_APP_LINK_NAME_MAX),
                    url: `https://${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(57)}/`,
                })),
            },
            'firstParty'
        );
        expect(JSON.stringify(params).length).toBeLessThanOrEqual(16 * 1024);
        expect(params.cloud.name).toHaveLength(MINI_APP_NAME_LIMIT);
    });

    it('cuts a long name on a character, not inside a surrogate pair', () => {
        const name = '😀'.repeat(MINI_APP_NAME_LIMIT + 5);
        const cut = buildMiniAppLaunchParams(input({ cloud: { id: 'c', name } }), 'reviewed').cloud.name;
        expect(Array.from(cut)).toHaveLength(MINI_APP_NAME_LIMIT);
        expect(cut.endsWith('😀')).toBe(true);
    });
});
