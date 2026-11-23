import { changeKindOf } from '../../lib/changeKindOf';
import { ddayOf } from '../../lib/ddayOf';
import { isLive, sceneOf } from '../../lib/sceneOf';

import type { SceneBanner } from '../../lib/sceneOf';
import type { Account, PaymentMethod, Plan, Subscription } from '../../types';

export const splitSubscriptions = (subs: Subscription[]): { live?: Subscription; ended: Subscription[] } => {
    const endedOn = (sub: Subscription) => sub.expiredAt ?? sub.endsAt ?? sub.startedAt;
    return {
        live: subs.find(isLive),
        ended: subs.filter(sub => !isLive(sub)).sort((a, b) => endedOn(b).localeCompare(endedOn(a))),
    };
};

export const endedOn = (sub: Subscription): string | undefined => sub.expiredAt ?? sub.endsAt;

export const chargeCardOf = (sub: Subscription, methods: PaymentMethod[]): PaymentMethod | undefined =>
    sub.defaultPaymentMethodId ? methods.find(pm => pm.id === sub.defaultPaymentMethodId) : undefined;

export const expiryOf = (pm: PaymentMethod): string | undefined =>
    pm.expMonth && pm.expYear
        ? `${String(pm.expMonth).padStart(2, '0')}/${String(pm.expYear % 100).padStart(2, '0')}`
        : undefined;

export const listCardOf = (banner: SceneBanner): 'summary' | 'status' =>
    banner.kind === 'active' || banner.kind === 'restored' ? 'summary' : 'status';

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

export const resumeDialogOf = (sub: Subscription, methods: PaymentMethod[]): 'confirm' | 'noCard' =>
    chargeCardOf(sub, methods) ? 'confirm' : 'noCard';

export const scheduledChangeDialogOf = (sub: Subscription, now: Date): 'confirm' | 'sameDay' | undefined => {
    if (!sub.pendingChange) return undefined;
    return ddayOf(sub.pendingChange.effectiveAt, now) <= 0 ? 'sameDay' : 'confirm';
};

export const cancelSceneOf = (sub: Subscription, now: Date): 'form' | 'done' | 'unavailable' => {
    if (sub.status === 'cancelScheduled') return 'done';
    return sceneOf(sub, now).actions.includes('cancel') ? 'form' : 'unavailable';
};

export const monthDay = (iso: string): string => iso.slice(5, 10).replace('-', '.');

export const ddayParts = (dday: number): { key: 'before' | 'today' | 'after'; count: number } => {
    if (dday > 0) return { key: 'before', count: dday };
    if (dday === 0) return { key: 'today', count: 0 };
    return { key: 'after', count: -dday };
};
