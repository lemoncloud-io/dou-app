import type { TFunction } from 'i18next';

import { HOME_PLACE_ID, resolvePlaceDisplayName } from './resolvePlaceDisplayName';

const t = ((key: string) => key) as unknown as TFunction;

describe('resolvePlaceDisplayName', () => {
    it('brands the home place on the default cloud, ignoring the backend name', () => {
        expect(resolvePlaceDisplayName({ id: 'abc', name: '#default' }, { isDefaultCloud: true }, t)).toBe(
            'placeList.defaultPlace'
        );
    });

    it('brands a place whose id is the home sid even off the default cloud', () => {
        expect(resolvePlaceDisplayName({ id: HOME_PLACE_ID, name: 'default' }, { isDefaultCloud: false }, t)).toBe(
            'placeList.defaultPlace'
        );
    });

    it('uses the place name on a regular cloud place', () => {
        expect(resolvePlaceDisplayName({ id: 'site-1', name: '우리 팀' }, { isDefaultCloud: false }, t)).toBe(
            '우리 팀'
        );
    });

    it('returns an empty string when a regular place has no name yet', () => {
        expect(resolvePlaceDisplayName({ id: 'site-1', name: undefined }, { isDefaultCloud: false }, t)).toBe('');
        expect(resolvePlaceDisplayName({ id: 'site-1', name: '' }, { isDefaultCloud: false }, t)).toBe('');
        expect(resolvePlaceDisplayName(null, { isDefaultCloud: false }, t)).toBe('');
        expect(resolvePlaceDisplayName(undefined, { isDefaultCloud: false }, t)).toBe('');
    });

    it('brands a missing place on the default cloud — the relay always means the home place', () => {
        expect(resolvePlaceDisplayName(null, { isDefaultCloud: true }, t)).toBe('placeList.defaultPlace');
    });
});
