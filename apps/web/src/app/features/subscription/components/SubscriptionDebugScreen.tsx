import { CreditCard } from 'lucide-react';

import type { MembershipView, ProductView } from '@lemoncloud/chatic-backend-api';

import { useAddCloudRequest } from '../../../stores/useAddCloudRequest';
import { useCloudQuota, useExcessClouds, usePlanCatalog } from '../hooks';
import {
    evaluateCloudQuota,
    getTierChangeKind,
    summarizeMembership,
    type CloudQuotaReason,
    type SubscriptionState,
} from '../lib';

/**
 * Subscription diagnostics for the debug overlay.
 *
 * Two halves, deliberately kept apart:
 *  - **Live** reads the same hooks the screens read, so it answers "what is the app deciding right
 *    now, and from what". Nothing is faked — if this disagrees with a screen, the screen is wrong.
 *  - **Matrices** call the pure judgements directly over every input combination. No server state is
 *    needed to see the whole rule, which is the part that is otherwise only reachable by owning
 *    five accounts in five different billing states.
 *
 * Owned by this feature (it reaches into subscription internals); the debug registry composes it
 * lazily, the way the private router composes `AddCloudFlowHost`.
 */

const DAY = 24 * 60 * 60 * 1000;
const STATES: SubscriptionState[] = ['none', 'active', 'cancelScheduled', 'expired'];
const TIERS = [1, 2, 3, 4, 5];

const plan = (tier: number): ProductView => ({ id: `#pro-tier-0${tier}`, sort: tier }) as ProductView;

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex items-start justify-between gap-3 py-1">
        <span className="shrink-0 text-[12px] text-muted-foreground">{label}</span>
        <span className="break-all text-right text-[12px] font-medium text-foreground">{value}</span>
    </div>
);

const Card = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
    <div className="mb-4 rounded-lg border border-border bg-card p-4">
        <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
        {hint && <p className="mb-2 mt-1 text-[12px] text-muted-foreground">{hint}</p>}
        <div className="mt-2">{children}</div>
    </div>
);

/** `-` rather than `undefined`, so an absent value does not read as a bug. */
const show = (v: unknown): string => (v === undefined || v === null || v === '' ? '-' : String(v));

export const SubscriptionDebugScreen = () => {
    const catalog = usePlanCatalog();
    const quota = useCloudQuota();
    const excess = useExcessClouds();
    const requestAddCloud = useAddCloudRequest(s => s.requestAddCloud);

    const now = Date.now();

    /** Every membership shape that maps to a distinct state, built off `now`. */
    const statusCases: { label: string; membership: MembershipView }[] = [
        { label: '없음', membership: {} as MembershipView },
        {
            label: '활성',
            membership: { productId: '#pro-tier-01', status: 'active', validUntil: now + 20 * DAY } as MembershipView,
        },
        {
            label: '해지 예약 (canceled)',
            membership: {
                productId: '#pro-tier-01',
                status: 'canceled',
                canceledAt: now - DAY,
                validUntil: now + 20 * DAY,
            } as MembershipView,
        },
        {
            label: '해지 예약 (autoRenewing=0)',
            membership: {
                productId: '#pro-tier-01',
                status: 'active',
                autoRenewing: false,
                validUntil: now + 20 * DAY,
            } as MembershipView,
        },
        {
            label: '결제 실패 유예',
            membership: { productId: '#pro-tier-01', status: 'active', validUntil: now + 2 * DAY } as MembershipView,
        },
        {
            label: '만료',
            membership: { productId: '#pro-tier-01', status: 'expired', validUntil: now - DAY } as MembershipView,
        },
        { label: '슈퍼', membership: { isSuper: true } as MembershipView },
        {
            label: '체험 중 (3일 경과)',
            membership: {
                productId: '#pro-tier-01',
                status: 'active',
                trialUsed: true,
                validFrom: now - 3 * DAY,
                validUntil: now + 4 * DAY,
            } as MembershipView,
        },
    ];

    const trialPlan = { id: '#pro-tier-01', sort: 1, trialDays: 7 } as ProductView;
    const reasonText = (r?: CloudQuotaReason) => (r ? r : '—');

    return (
        <div className="flex h-full flex-col bg-background">
            <div className="flex-1 overflow-y-auto px-4 pb-10">
                <div className="mb-6 mt-6">
                    <div className="flex items-center gap-2">
                        <CreditCard size={20} className="text-foreground" />
                        <h1 className="text-[20px] font-semibold leading-[1.35]">Subscription</h1>
                    </div>
                    <p className="mt-1 text-[13px] text-muted-foreground">
                        Live judgement + the full rule matrices. Read-only; nothing here writes to the server.
                    </p>
                </div>

                <Card title="Live — 카탈로그" hint="usePlanCatalog()">
                    <Row label="isOnMobileApp" value={String(catalog.isOnMobileApp)} />
                    <Row label="platform" value={show(catalog.platform)} />
                    <Row label="isLoading" value={String(catalog.isLoading)} />
                    <Row label="sellablePlans" value={`${catalog.sellablePlans.length}개`} />
                    <Row
                        label="currentPlan"
                        value={
                            catalog.currentPlan
                                ? `${catalog.currentPlan.id} · max ${show(catalog.currentPlan.maxClouds)} · sort ${show(catalog.currentPlan.sort)}`
                                : '-'
                        }
                    />
                    <Row label="replaceablePlan" value={show(catalog.replaceablePlan?.id)} />
                    <Row label="pendingPlan" value={show(catalog.pendingPlan?.id)} />
                </Card>

                <Card title="Live — 구독 상태" hint="summarizeMembership()의 결과">
                    <Row label="state" value={catalog.summary.state} />
                    <Row label="isEntitled" value={String(catalog.summary.isEntitled)} />
                    <Row label="productId" value={show(catalog.summary.productId)} />
                    <Row
                        label="validUntil"
                        value={catalog.summary.validUntil ? new Date(catalog.summary.validUntil).toLocaleString() : '-'}
                    />
                    <Row label="pendingProductId" value={show(catalog.summary.pendingProductId)} />
                    <Row label="trialDaysLeft" value={show(catalog.summary.trialDaysLeft)} />
                </Card>

                <Card title="Live — 클라우드 한도" hint="useCloudQuota() · useExcessClouds()">
                    <Row label="used" value={quota.used} />
                    <Row label="limit" value={quota.limit === null ? 'null (모름)' : quota.limit} />
                    <Row label="canAdd" value={String(quota.canAdd)} />
                    <Row label="reason" value={reasonText(quota.reason)} />
                    <Row
                        label="excess"
                        value={excess.excess.length ? excess.excess.map(c => c.id).join(', ') : '없음'}
                    />
                    <button
                        type="button"
                        onClick={requestAddCloud}
                        className="mt-3 w-full rounded-md bg-foreground py-2 text-[13px] font-semibold text-background"
                    >
                        requestAddCloud() 실행
                    </button>
                </Card>

                <Card title="Matrix — 상태 판정" hint="입력 멤버십 → summarizeMembership (서버 불필요)">
                    <table className="w-full text-[12px]">
                        <thead>
                            <tr className="text-left text-muted-foreground">
                                <th className="py-1 font-normal">입력</th>
                                <th className="py-1 font-normal">state</th>
                                <th className="py-1 text-right font-normal">자격</th>
                                <th className="py-1 text-right font-normal">체험</th>
                            </tr>
                        </thead>
                        <tbody>
                            {statusCases.map(({ label, membership }) => {
                                const s = summarizeMembership(membership, trialPlan, now);
                                return (
                                    <tr key={label} className="border-t border-border/50">
                                        <td className="py-1 pr-2">{label}</td>
                                        <td className="py-1 font-medium">{s.state}</td>
                                        <td className="py-1 text-right">{s.isEntitled ? '✓' : '✗'}</td>
                                        <td className="py-1 text-right">{show(s.trialDaysLeft)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </Card>

                <Card title="Matrix — 추가 가능 여부" hint="상태 × 한도 → evaluateCloudQuota">
                    <table className="w-full text-[12px]">
                        <thead>
                            <tr className="text-left text-muted-foreground">
                                <th className="py-1 font-normal">state</th>
                                <th className="py-1 font-normal">여유 (1/3)</th>
                                <th className="py-1 font-normal">도달 (3/3)</th>
                                <th className="py-1 font-normal">모름 (null)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {STATES.map(state => {
                                const cell = (used: number, limit: number | null) => {
                                    const v = evaluateCloudQuota({ used, limit, state });
                                    return v.canAdd ? '✓ 가능' : `✗ ${v.reason}`;
                                };
                                return (
                                    <tr key={state} className="border-t border-border/50">
                                        <td className="py-1 pr-2 font-medium">{state}</td>
                                        <td className="py-1">{cell(1, 3)}</td>
                                        <td className="py-1">{cell(3, 3)}</td>
                                        <td className="py-1">{cell(9, null)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </Card>

                <Card title="Matrix — tier 이동" hint="현재(행) → 대상(열) · getTierChangeKind. 인접 1칸만 열린다">
                    <table className="w-full text-[11px]">
                        <thead>
                            <tr className="text-left text-muted-foreground">
                                <th className="py-1 font-normal">현재\대상</th>
                                {TIERS.map(t => (
                                    <th key={t} className="py-1 text-center font-normal">
                                        {t}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            <tr className="border-t border-border/50">
                                <td className="py-1 pr-2 font-medium">미구독</td>
                                {TIERS.map(t => (
                                    <td key={t} className="py-1 text-center">
                                        {getTierChangeKind(undefined, plan(t)) === 'new' ? '신규' : '?'}
                                    </td>
                                ))}
                            </tr>
                            {TIERS.map(from => (
                                <tr key={from} className="border-t border-border/50">
                                    <td className="py-1 pr-2 font-medium">tier{from}</td>
                                    {TIERS.map(to => {
                                        const kind = getTierChangeKind(plan(from), plan(to));
                                        const mark = {
                                            current: '이용중',
                                            upgrade: '↑',
                                            downgrade: '↓',
                                            blocked: '✗',
                                            new: '신규',
                                        }[kind];
                                        return (
                                            <td
                                                key={to}
                                                className={`py-1 text-center ${kind === 'blocked' ? 'text-muted-foreground' : 'font-medium'}`}
                                            >
                                                {mark}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Card>
            </div>
        </div>
    );
};
