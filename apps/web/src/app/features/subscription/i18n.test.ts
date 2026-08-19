import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The tier screens render copy through keys, and a typo'd key renders as the key itself — visible
 * only to whoever opens that exact screen on that exact locale. This suite is what stops that
 * shipping — the i18n stub in component tests happily renders a typo'd key.
 */

// Read the shipped JSON off disk: a default JSON import resolves to undefined under this ts-jest
// config, and going through i18next would only re-test the library.
const load = (locale: string): Record<string, unknown> =>
    JSON.parse(readFileSync(join(__dirname, `../../../../public/locales/${locale}/translation.json`), 'utf-8'));

const read = (bundle: Record<string, unknown>, path: string) =>
    path.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], bundle);

const LOCALES = ['ko', 'en'];

const SUBSCRIPTION_KEYS = [
    'maxClouds',
    'trialBadge',
    'currentBadge',
    'changeTier',
    'adjacentTierOnly',
    'startAtEntryTier',
    'productNotFound',
    'offerTokenMissing',
    'trialRemaining',
    'allowance',
    'price',
    'guideTitle',
    'pickTitle',
    'later',
    'loginRequiredTitle',
    'hero.trialLead',
    'hero.trialAccent',
    'hero.trialSub',
    'hero.plain',
    'hero.plainSub',
    'benefits.title',
    'benefits.item1Title',
    'benefits.item1Description',
    'benefits.item2Title',
    'benefits.item2Description',
    'benefits.item3Title',
    'benefits.item3Description',
    'guideEntry',
    'autoRenewNotice',
    'termsOfService',
    'privacyPolicy',
    'notice.title',
    'notice.upgradeImmediate',
    'notice.downgradeNextRenewal',
    'notice.manageAt.apple',
    'notice.manageAt.google',
    'complete.title',
    'complete.trialEndsOn',
    'complete.renewsOn',
    'complete.autoChargeAfter',
    'complete.cancelAnytime',
    'complete.setUpPlace',
    'complete.cta',
    'excess.title',
    'excess.description',
    'excess.manage',
    // Pre-existing keys the reworked screens still read.
    'pricePerMonth',
    'vatIncluded',
    'purchasing',
    'subscribe',
    'noProducts',
    'pendingChange',
];

const ADD_ACCOUNT_KEYS = [
    'limitExceeded',
    'emailAlreadyUsed',
    'cancelScheduled',
    'addFailed',
    'success',
    // 개편된 인증 화면이 읽는 키
    'emailTitle',
    'emailSubtitle',
    'emailLabel',
    'emailPlaceholder',
    'emailDescription',
    'emailInvalid',
    'sendCode',
    'sendCodeFailed',
    'verificationTitle',
    'verificationDescription',
    'resend',
    'resendFailed',
    'codeError',
    'codeExpired',
    'tooltip',
    'complete',
];

describe('구독 tier 문구 — 로케일 정의', () => {
    it.each(LOCALES)('%s가 mypage.subscription 키를 모두 정의한다', locale => {
        const bundle = load(locale);
        const missing = SUBSCRIPTION_KEYS.filter(key => typeof read(bundle, `mypage.subscription.${key}`) !== 'string');

        expect(missing).toEqual([]);
    });

    it.each(LOCALES)('%s가 addAccount 키를 모두 정의한다', locale => {
        const bundle = load(locale);
        const missing = ADD_ACCOUNT_KEYS.filter(key => typeof read(bundle, `addAccount.${key}`) !== 'string');

        expect(missing).toEqual([]);
    });
});

describe('구독 tier 문구 — 치환 변수', () => {
    // A missing placeholder is worse than a missing key: the sentence still renders, just with the
    // number silently dropped ("계정은 최대 개까지").
    const INTERPOLATIONS: [string, string][] = [
        ['addAccount.limitExceeded', 'max'],
        ['mypage.subscription.maxClouds', 'count'],
        ['mypage.subscription.trialBadge', 'days'],
        ['mypage.subscription.trialRemaining', 'days'],
        ['mypage.subscription.pricePerMonth', 'price'],
        ['mypage.subscription.pendingChange', 'product'],
        ['mypage.subscription.hero.trialAccent', 'days'],
        ['mypage.subscription.complete.trialEndsOn', 'date'],
        ['mypage.subscription.complete.renewsOn', 'date'],
        ['mypage.subscription.complete.autoChargeAfter', 'price'],
    ];

    it.each(LOCALES)('%s가 단일 치환 변수를 유지한다', locale => {
        const bundle = load(locale);

        for (const [path, token] of INTERPOLATIONS) {
            expect(read(bundle, path)).toContain(`{{${token}}}`);
        }
    });

    it.each(LOCALES)('%s의 초과 안내가 개수와 한도를 모두 담는다', locale => {
        const title = read(load(locale), 'mypage.subscription.excess.title') as string;

        expect(title).toContain('{{count}}');
        expect(title).toContain('{{max}}');
    });
});
