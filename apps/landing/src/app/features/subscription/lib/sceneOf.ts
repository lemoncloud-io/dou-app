import { ddayOf } from './ddayOf';

import type { Money, PlanId, Subscription } from '../types';

/**
 * Which banner the subscription detail screen shows. Each kind carries the values its copy needs;
 * which of them a kind fills is listed beside it.
 */
export type SceneBanner =
    /** `date` trial end, `chargeAt` first charge, `amount` first charge amount. */
    | { kind: 'trial'; date?: string; chargeAt?: string; amount?: Money }
    /** `date` next charge, `amount` next charge amount. */
    | { kind: 'active'; date?: string; amount?: Money }
    /** `date` the day access is restricted, `dday` days until then. */
    | { kind: 'pastDue'; date?: string; dday?: number }
    /** `date` the day access was restricted. */
    | { kind: 'restricted'; date?: string }
    /** `date` last day of use, `dday` days until then. */
    | { kind: 'cancelScheduled'; date?: string; dday?: number }
    /** `planId` the plan it changes to, `date` when, `amount` what that day charges. */
    | { kind: 'downgradeScheduled'; planId: PlanId; date: string; amount?: Money }
    /** `date` the day it expired. */
    | { kind: 'expired'; date?: string }
    | { kind: 'restored' };

/** The buttons the detail screen offers, in the order it shows them. */
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

/**
 * The banner and buttons for a subscription in its current state — the one place that decision is
 * made, so the screens draw the result and the mock only holds state.
 *
 * A scheduled downgrade and a restore are not statuses; they sit on an `active` subscription and take
 * over its banner. A restored subscription keeps the ordinary buttons beneath its "started again"
 * banner — it is an active subscription, and the banner is news, not a different state.
 */
export const sceneOf = (sub: Subscription, now: Date): Scene => {
    switch (sub.status) {
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
            // One replaced by the next subscription is history, not a lapse: there is nothing to
            // subscribe again to while its successor runs.
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

/** Whether a subscription still entitles its owner to anything — every status but `expired`. */
export const isLive = (sub: Subscription | undefined): sub is Subscription => !!sub && sub.status !== 'expired';
