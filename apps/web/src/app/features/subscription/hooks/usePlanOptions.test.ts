import { renderHook } from '@testing-library/react';

import { useNativeCatalog } from './useNativeCatalog';
import { usePlanCatalog } from './usePlanCatalog';
import { usePlanOptions } from './usePlanOptions';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('./usePlanCatalog', () => ({ usePlanCatalog: jest.fn() }));
jest.mock('./useNativeCatalog', () => ({ useNativeCatalog: jest.fn() }));

const tier = (sort: number) => ({ id: `#pro-tier-0${sort}`, platform: 'apple', sort, maxClouds: sort });
const SELLABLE = [tier(1), tier(2), tier(3)];

const optionsFor = (catalog: { replaceablePlan?: unknown; isOtherStore?: boolean }) => {
    (usePlanCatalog as jest.Mock).mockReturnValue({
        sellablePlans: SELLABLE,
        replaceablePlan: undefined,
        resubscribePlan: undefined,
        isIOS: true,
        isLoading: false,
        isOtherStore: false,
        ...catalog,
    });
    (useNativeCatalog as jest.Mock).mockReturnValue({ nativeProducts: [], isLoading: false });
    return renderHook(() => usePlanOptions()).result.current.options;
};

describe('usePlanOptions', () => {
    it('with nothing running: the entry tier is a first purchase', () => {
        const [entry] = optionsFor({});

        expect(entry.kind).toBe('new');
        expect(entry.isSelectable).toBe(true);
    });

    it('billed elsewhere with no plan in the catalog: refuses every tier as another store’s, the entry tier too', () => {
        const options = optionsFor({ isOtherStore: true });

        expect(options.map(option => option.isSelectable)).toEqual([false, false, false]);
        expect(options.map(option => option.refusal)).toEqual(['otherStore', 'otherStore', 'otherStore']);
        expect(options[0].disabledReason).toBe('mypage.subscription.otherStoreOnly');
    });

    it('billed by the other store with its plan in the catalog: keeps judging by rank', () => {
        const options = optionsFor({
            isOtherStore: true,
            replaceablePlan: { id: '#pro-tier-02-android', platform: 'google', sort: 2, maxClouds: 2 },
        });

        expect(options[1].kind).toBe('current');
        expect(options[0].refusal).toBe('otherStore');
    });
});
