import '@testing-library/jest-dom';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fireEvent, render, screen } from '@testing-library/react';

import { CloudGuidePage } from './CloudGuidePage';
import { usePlanCatalog } from '../hooks';
import { ROUTES } from '../../../routes/paths';

jest.mock('../hooks', () => ({ usePlanCatalog: jest.fn() }));

const navigateMock = jest.fn();
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigateMock }));

// i18n stub: echo the key so assertions target keys, and surface the interpolated day count.
// A separate suite below checks those keys actually exist in the locale files, since this stub
// would happily render a typo'd key.
jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, arg?: unknown) =>
            arg && typeof arg === 'object' && 'days' in (arg as Record<string, unknown>)
                ? `${key}:${(arg as { days: number }).days}`
                : key,
    }),
}));

const K = 'mypage.subscription.cloudGuide';

/** `sellablePlans` is empty off-native — no store applies there. See usePlanCatalog. */
const setProduct = (product: { trialDays?: number } | undefined) =>
    (usePlanCatalog as jest.Mock).mockReturnValue({
        isOnMobileApp: !!product,
        isIOS: false,
        platform: product ? 'google' : undefined,
        sellablePlans: product ? [product] : [],
        currentPlan: undefined,
        summary: { state: 'none', isEntitled: false },
        isLoading: false,
    });

beforeEach(() => jest.clearAllMocks());

describe('CloudGuidePage — CTA label', () => {
    it('advertises the trial length when the store product carries one', () => {
        setProduct({ trialDays: 7 });

        render(<CloudGuidePage />);

        expect(screen.getByText(`${K}.ctaWithTrial:7`)).toBeInTheDocument();
    });

    it('omits any trial claim when trialDays is 0', () => {
        setProduct({ trialDays: 0 });

        render(<CloudGuidePage />);

        expect(screen.getByText(`${K}.ctaPlain`)).toBeInTheDocument();
    });

    it('omits any trial claim off-native, where no store product resolves', () => {
        // The usual web case. Promising a trial we cannot confirm would be a false claim, so the
        // no-trial label is the default rather than an error path.
        setProduct(undefined);

        render(<CloudGuidePage />);

        expect(screen.getByText(`${K}.ctaPlain`)).toBeInTheDocument();
    });

    it('sends the CTA to the plan picker rather than purchasing here', () => {
        setProduct({ trialDays: 7 });

        render(<CloudGuidePage />);
        fireEvent.click(screen.getByRole('button', { name: `${K}.ctaWithTrial:7` }));

        expect(navigateMock).toHaveBeenCalledWith(ROUTES.subscription.plans);
    });
});

describe('CloudGuidePage — locale keys', () => {
    // The i18n mock above echoes keys, so a typo'd or deleted key still renders a passing
    // assertion. This suite is what actually stops the page shipping raw key strings.
    const KEYS = [
        'heroAccent',
        'heroRest',
        'ctaCaption',
        'ctaWithTrial',
        'ctaPlain',
        // The MyPage entry-row label is NOT here: it lives at `mypage.subscription.guideEntry`, one
        // level up, because the row belongs to the MyPage menu rather than to this screen's copy.
        'free.name',
        'free.badge',
        'free.headline',
        'free.limit1',
        'free.limit2',
        'free.limit3',
        'pro.name',
        'pro.badge',
        'pro.headline',
        'pro.benefit1Title',
        'pro.benefit1Description',
        'pro.benefit2Title',
        'pro.benefit2Description',
        'pro.benefit3Title',
        'pro.benefit3Description',
    ];

    // Read the shipped JSON off disk: a default JSON import resolves to undefined under this
    // ts-jest config, and going through i18next would only re-test the library.
    const load = (locale: string): Record<string, unknown> =>
        JSON.parse(readFileSync(join(__dirname, `../../../../../public/locales/${locale}/translation.json`), 'utf-8'));

    const read = (bundle: Record<string, unknown>, path: string) =>
        path.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], bundle);

    it.each(['ko', 'en'])('%s defines every cloudGuide key the page reads', locale => {
        const bundle = load(locale);
        const missing = KEYS.filter(key => typeof read(bundle, `${K}.${key}`) !== 'string');

        expect(missing).toEqual([]);
    });

    it('keeps the {{days}} interpolation in the trial label in both locales', () => {
        for (const locale of ['ko', 'en']) {
            expect(read(load(locale), `${K}.ctaWithTrial`)).toContain('{{days}}');
        }
    });

    it('defines the back-button label used by the top bar', () => {
        for (const locale of ['ko', 'en']) {
            expect(typeof read(load(locale), 'common.back')).toBe('string');
        }
    });
});
