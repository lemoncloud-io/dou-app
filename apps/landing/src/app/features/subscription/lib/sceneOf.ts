import { ddayOf } from './ddayOf';

import type { Money, PlanId, Subscription } from '../types';

export type SceneBanner =
    | { kind: 'pending' }
    | { kind: 'trial'; date?: string; chargeAt?: string; amount?: Money }
    | { kind: 'active'; date?: string; amount?: Money }
    | { kind: 'pastDue'; date?: string; dday?: number }
    | { kind: 'restricted'; date?: string }
    | { kind: 'cancelScheduled'; date?: string; dday?: number }
    | { kind: 'downgradeScheduled'; planId: PlanId; date: string; amount?: Money }
    | { kind: 'expired'; date?: string }
    | { kind: 'restored' };

export type SceneAction =
    | 'changePlan'
    | 'paymentMethods'
    | 'invoices'
    | 'cancel'
    | 'updatePaymentMethod'
    | 'resume'
    | 'cancelScheduledChange'
    | 'chooseClouds'
    | 'resubscribe';

export interface Scene {
    banner: SceneBanner;
    actions: SceneAction[];
}

const ACTIVE_ACTIONS: SceneAction[] = ['changePlan', 'paymentMethods', 'invoices', 'cancel'];

export const sceneOf = (sub: Subscription, now: Date): Scene => {
    switch (sub.status) {
        case 'pending':
            return { banner: { kind: 'pending' }, actions: [] };
        case 'trial':
            return {
                banner: { kind: 'trial', date: sub.trialEndsAt, chargeAt: sub.nextBillingAt, amount: sub.nextAmount },
                actions: ['changePlan', 'cancel'],
            };
        case 'pastDue':
            return {
                banner: {
                    kind: 'pastDue',
                    date: sub.restrictAt,
                    dday: sub.restrictAt ? ddayOf(sub.restrictAt, now) : undefined,
                },
                actions: ['updatePaymentMethod'],
            };
        case 'restricted':
            return { banner: { kind: 'restricted', date: sub.restrictAt }, actions: ['updatePaymentMethod'] };
        case 'cancelScheduled':
            return {
                banner: {
                    kind: 'cancelScheduled',
                    date: sub.endsAt,
                    dday: sub.endsAt ? ddayOf(sub.endsAt, now) : undefined,
                },
                actions: ['resume'],
            };
        case 'expired':
            return {
                banner: { kind: 'expired', date: sub.expiredAt },
                actions: sub.endedReason === 'replaced' ? [] : ['resubscribe'],
            };
        case 'active':
            if (sub.pendingChange) {
                return {
                    banner: {
                        kind: 'downgradeScheduled',
                        planId: sub.pendingChange.planId,
                        date: sub.pendingChange.effectiveAt,
                        amount: sub.nextAmount,
                    },
                    actions: ['cancelScheduledChange', 'chooseClouds'],
                };
            }
            if (sub.restored) return { banner: { kind: 'restored' }, actions: ACTIVE_ACTIONS };
            return {
                banner: { kind: 'active', date: sub.nextBillingAt, amount: sub.nextAmount },
                actions: ACTIVE_ACTIONS,
            };
    }
};

export const isLive = (sub: Subscription | undefined): sub is Subscription => !!sub && sub.status !== 'expired';
