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
    'adjacentTierOnly',
    'startAtEntryTier',
    'otherStoreOnly',
    'productNotFound',
    'offerTokenMissing',
    'trialRemaining',
    'price',
    'guideTitle',
    'loginRequiredTitle',
    'autoRenewNotice',
    'termsOfService',
    'privacyPolicy',
    'notice.title',
    'notice.upgradeImmediate',
    'notice.downgradeNextRenewal',
    'notice.manageAt.apple',
    'notice.manageAt.google',
    'complete.autoChargeAfter',
    'state.active',
    'state.ending',
    'state.expired',
    'state.blocked',
    'state.scheduled',
    'info.status',
    'info.price',
    'info.period',
    'info.nextPayment',
    'info.endsOn',
    'info.expiredOn',
    'info.scheduledPrice',
    'info.platform',
    'info.adminGrant',
    'info.current',
    'info.next',
    'info.applyOn',
    'info.chargeOn',
    'info.paidOn',
    'info.trialEndsOn',
    'banner.autoRenew.title',
    'banner.autoRenew.description',
    'banner.ending.title',
    'banner.ending.description',
    'banner.ending.chip',
    'banner.expired.title',
    'banner.expired.description',
    'banner.expired.descriptionPastHold',
    'banner.restored.title',
    'banner.restored.description',
    'banner.blocked.title',
    'list.emptyTitle',
    'list.emptyDescription',
    'list.changeLine',
    'list.endsLine',
    'list.expiredLine',
    'list.heldTitle',
    'list.heldDescription',
    'detail.title',
    'detail.infoTitle',
    'detail.changePlan',
    'detail.resubscribe',
    'detail.manageInStore',
    'detail.otherStore',
    'detail.pendingTitle',
    'detail.pendingHeader',
    'detail.pendingDescription',
    'detail.keepPick',
    'detail.keepReview',
    'picker.productsTitle',
    'picker.intro',
    'picker.next',
    'confirm.selected',
    'confirm.reserve',
    'confirm.processing',
    'confirm.downgradeHeadline',
    'confirm.downgradeDescription',
    'confirm.upgradeApple1',
    'confirm.upgradeApple2',
    'confirm.upgradeGoogle1',
    'confirm.upgradeGoogle2',
    'confirm.unavailable',
    'done.newTitle',
    'done.changedTitle',
    'done.scheduledDescription',
    'done.addCloud',
    'keep.title',
    'keep.headline',
    'keep.description',
    'keep.section',
    'keep.selected',
    'keep.notice',
    'keep.confirm',
    'keep.change',
    'keep.keepTitle',
    'keep.changeTitle',
    'keep.dialogDescription',
    'keep.saved',
    'keep.failed',
    'complete.cancelAnytime',
    'excess.manage',
    'emailRequired.title',
    'emailRequired.description',
    'emailRequired.action',
    'refusal.current.title',
    'refusal.current.description',
    'refusal.tierJump.title',
    'refusal.tierJump.description',
    'refusal.entryTier.title',
    'refusal.entryTier.description',
    'refusal.otherStore.title',
    'refusal.otherStore.description',
    'refusal.pickInstead',
    'refusal.selectInstead',
    'inUse',
    'summaryLine',
    'summaryLineWithQuota',
    // Pre-existing keys the reworked screens still read.
    'pricePerMonth',
    'vatIncluded',
    'subscribe',
    'noProducts',
];

const ADD_ACCOUNT_KEYS = [
    'limitExceeded',
    'emailAlreadyUsed',
    'cancelScheduled',
    'addFailed',
    'success',
    'emailSkip',
    // Keys read by the redesigned verification screen
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
        ['mypage.subscription.complete.autoChargeAfter', 'price'],
        ['mypage.subscription.banner.autoRenew.description', 'price'],
        ['mypage.subscription.banner.autoRenew.description', 'date'],
        ['mypage.subscription.banner.ending.description', 'date'],
        ['mypage.subscription.banner.ending.chip', 'days'],
        ['mypage.subscription.list.changeLine', 'product'],
        ['mypage.subscription.list.changeLine', 'date'],
        ['mypage.subscription.list.heldTitle', 'count'],
        ['mypage.subscription.detail.pendingDescription', 'product'],
        ['mypage.subscription.detail.otherStore', 'store'],
        ['mypage.subscription.refusal.otherStore.description', 'store'],
        ['mypage.subscription.detail.pendingDescription', 'date'],
        ['mypage.subscription.confirm.downgradeDescription', 'date'],
        ['mypage.subscription.confirm.upgradeApple1', 'product'],
        ['mypage.subscription.confirm.upgradeApple1', 'current'],
        ['mypage.subscription.confirm.upgradeGoogle1', 'product'],
        ['mypage.subscription.confirm.upgradeGoogle1', 'current'],
        ['mypage.subscription.done.changedTitle', 'product'],
        ['mypage.subscription.done.scheduledDescription', 'date'],
        ['mypage.subscription.keep.headline', 'count'],
        ['mypage.subscription.keep.description', 'date'],
        ['mypage.subscription.keep.dialogDescription', 'date'],
    ];

    it.each(LOCALES)('%s가 단일 치환 변수를 유지한다', locale => {
        const bundle = load(locale);

        for (const [path, token] of INTERPOLATIONS) {
            expect(read(bundle, path)).toContain(`{{${token}}}`);
        }
    });
});
