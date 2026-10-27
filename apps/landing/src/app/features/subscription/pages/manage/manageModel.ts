import { changeKindOf } from '../../lib/changeKindOf';
import { ddayOf } from '../../lib/ddayOf';
import { isLive, sceneOf } from '../../lib/sceneOf';

import type { SceneBanner } from '../../lib/sceneOf';
import type { Account, PaymentMethod, Plan, Subscription } from '../../types';

/**
 * What the management screens read off the port's data before drawing it. None of this decides a
 * billing rule — `sceneOf` and `changeKindOf` do that; these only pick which of the port's values a
 * screen shows and which of its dialogs a button opens.
 */

/** The live subscription (at most one) and the ended ones, most recently ended first. */
export const splitSubscriptions = (subs: Subscription[]): { live?: Subscription; ended: Subscription[] } => {
    const endedOn = (sub: Subscription) => sub.expiredAt ?? sub.endsAt ?? sub.startedAt;
    return {
        live: subs.find(isLive),
        ended: subs.filter(sub => !isLive(sub)).sort((a, b) => endedOn(b).localeCompare(endedOn(a))),
    };
};

/** The date an ended subscription stopped, for its `from – to` line. */
export const endedOn = (sub: Subscription): string | undefined => sub.expiredAt ?? sub.endsAt;

/**
 * The card the subscription is charged to: the one it names. A subscription whose card was removed
 * names none and gets none — there is no fallback to another card, since the server would not charge one.
 */
export const chargeCardOf = (sub: Subscription, methods: PaymentMethod[]): PaymentMethod | undefined =>
    sub.defaultPaymentMethodId ? methods.find(pm => pm.id === sub.defaultPaymentMethodId) : undefined;

/** `08/28` — a card's expiry as the card itself prints it. */
export const expiryOf = (pm: PaymentMethod): string =>
    `${String(pm.expMonth).padStart(2, '0')}/${String(pm.expYear % 100).padStart(2, '0')}`;

/**
 * How the list draws the live subscription: an untroubled one as the full card with its facts, any
 * other scene as a one-line status card that sends the reader to the detail screen.
 */
export const listCardOf = (banner: SceneBanner): 'summary' | 'status' =>
    banner.kind === 'active' || banner.kind === 'restored' ? 'summary' : 'status';

/** The plans one step up and down from the current one — the only ones a change can go to. */
export const changeTargetsOf = (
    current: Plan,
    plans: Plan[],
    account: Account | null
): Array<{ plan: Plan; kind: 'upgrade' | 'downgrade' }> =>
    plans
        .map(plan => ({ plan, kind: changeKindOf(current, plan, account) }))
        .filter(
            (t): t is { plan: Plan; kind: 'upgrade' | 'downgrade' } => t.kind === 'upgrade' || t.kind === 'downgrade'
        )
        .sort((a, b) => b.plan.sort - a.plan.sort);

/**
 * Which dialog "resume" opens. Resuming renews on the subscription's card; with none left (removed
 * after cancelling), the reader is sent to add one instead of being asked to confirm.
 */
export const resumeDialogOf = (sub: Subscription, methods: PaymentMethod[]): 'confirm' | 'noCard' =>
    chargeCardOf(sub, methods) ? 'confirm' : 'noCard';

/**
 * Which dialog "cancel the scheduled downgrade" opens. On the day it applies the charge for the
 * smaller plan is already under way, so the reader is told to wait instead of being asked.
 */
export const scheduledChangeDialogOf = (sub: Subscription, now: Date): 'confirm' | 'sameDay' | undefined => {
    if (!sub.pendingChange) return undefined;
    return ddayOf(sub.pendingChange.effectiveAt, now) <= 0 ? 'sameDay' : 'confirm';
};

/**
 * What the cancel screen shows. The form appears only where `sceneOf` offers cancelling, so the
 * detail screen and this one cannot disagree; a subscription already cancelled shows the result.
 */
export const cancelSceneOf = (sub: Subscription, now: Date): 'form' | 'done' | 'unavailable' => {
    if (sub.status === 'cancelScheduled') return 'done';
    return sceneOf(sub, now).actions.includes('cancel') ? 'form' : 'unavailable';
};

/** `11.02` — a day in a short run of days, where the year is already plain from the context. */
export const monthDay = (iso: string): string => iso.slice(5, 10).replace('-', '.');

/** A D-Day label's parts: `D-5`, `D-Day` on the day, `D+2` once it has passed. */
export const ddayParts = (dday: number): { key: 'before' | 'today' | 'after'; count: number } => {
    if (dday > 0) return { key: 'before', count: dday };
    if (dday === 0) return { key: 'today', count: 0 };
    return { key: 'after', count: -dday };
};
