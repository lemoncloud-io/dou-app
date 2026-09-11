/**
 * `components/memberships/MembershipDetailPanel.tsx`
 * - The right column: one membership's record, its override, its clouds, and the form that changes
 *   them.
 *
 * A layout column at `xl` and up, an overlay below it — the same switch the log console's detail
 * panel makes, and for the same reason: three columns need width, and the list matters more than
 * the rail when there is not enough.
 *
 * Escape closes it. As an overlay with no keyboard dismissal this would be a trap, since the only
 * other way out is a backdrop click, which is not focusable. `ui-kit`'s `Sheet` would bring that
 * plus a focus trap, but it is always a modal dialog and this is a column at desktop widths, so the
 * behaviour is added here instead. In column state Escape simply clears the selection.
 */
import { useEffect } from 'react';

import { formatDate } from '@chatic/shared';

import { useAdminClouds } from '../api/membershipsQuery';
import { describeGrade, describeOverrideBadge, hasDerivationMismatch } from '../lib/membershipRow';
import { CloudPanel } from './CloudPanel';
import { OverridePanel } from './OverridePanel';

import type { RelayStage } from '../lib/targetServer';

import type { MembershipView } from '@lemoncloud/chatic-backend-api';

interface MembershipDetailPanelProps {
    membership: MembershipView | null;
    onClose: () => void;
    onUpdated: (updated: MembershipView) => void;
    now: number;
    /** The relay this panel reads and writes. Switching stages must not reuse the other's rows. */
    stage: RelayStage;
}

const Field = ({ label, value }: { label: string; value: string }) => (
    <div className="flex justify-between gap-3 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="break-all text-right font-mono text-foreground">{value}</span>
    </div>
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section className="flex flex-col gap-1.5 border-t border-border px-5 py-4 first:border-t-0">
        <h3 className="text-xs font-semibold text-foreground">{title}</h3>
        {children}
    </section>
);

export const MembershipDetailPanel = ({ membership, onClose, onUpdated, now, stage }: MembershipDetailPanelProps) => {
    const userId = membership?.userId ?? '';
    const { data: clouds, isLoading: cloudsLoading } = useAdminClouds(membership ? userId : undefined, stage);

    // Declared before the empty-state return so the hook order stays stable.
    useEffect(() => {
        if (!membership) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [membership, onClose]);

    if (!membership) {
        return (
            <aside className="hidden w-[26rem] shrink-0 flex-col border-l border-border bg-card xl:flex">
                <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                    행을 선택하면 상세가 여기에 열립니다.
                </p>
            </aside>
        );
    }

    const badge = describeOverrideBadge(membership, now);

    return (
        <aside
            className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[26rem] flex-col overflow-y-auto border-l border-border bg-card shadow-2xl xl:static xl:z-auto xl:w-[26rem] xl:shrink-0 xl:shadow-none"
            aria-label="멤버십 상세"
        >
            <header className="flex items-center gap-2 border-b border-border px-5 py-3">
                <span className="font-mono text-sm text-foreground">{userId || '(userId 없음)'}</span>
                <span className="flex-1" />
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                    닫기
                </button>
            </header>

            <Section title="현재 상태">
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="rounded border border-border px-1.5 py-0.5">
                        status: {membership.status ?? '-'}
                    </span>
                    <span
                        className={`rounded border px-1.5 py-0.5 ${
                            membership.isValid
                                ? 'border-emerald-500/40 text-emerald-400'
                                : 'border-border text-muted-foreground'
                        }`}
                    >
                        isValid: {String(membership.isValid ?? '-')}
                    </span>
                    <span className="rounded border border-border px-1.5 py-0.5">오버라이드: {badge.label}</span>
                </div>
                {hasDerivationMismatch(membership) && (
                    <p className="text-[11px] leading-snug text-amber-400">
                        저장된 status 와 실시간 isValid 가 어긋납니다. 서버에는 부여 만료를 되돌리는 배치가 없어, 기간이
                        끝난 오버라이드가 이렇게 보입니다.
                    </p>
                )}
            </Section>

            <Section title="멤버십">
                <Field label="등급" value={describeGrade(membership, now)} />
                <Field label="유효기간" value={membership.validUntil ? formatDate(membership.validUntil) : '-'} />
                <Field label="플랫폼" value={membership.platform ?? '-'} />
                <Field label="자동갱신" value={String(membership.autoRenewing ?? '-')} />
                <Field label="취소일" value={membership.canceledAt ? formatDate(membership.canceledAt) : '-'} />
                <Field label="영수증" value={membership.receiptId ?? '-'} />
            </Section>

            <Section title="관리자 오버라이드">
                <Field label="상태" value={membership.adminStatus || '(없음)'} />
                <Field label="만료" value={membership.adminUntil ? formatDate(membership.adminUntil) : '무기한/없음'} />
                <Field label="등급" value={membership.adminProductId || '-'} />
                <Field label="최근 조작" value={membership.adminAt ? formatDate(membership.adminAt) : '-'} />
                <Field label="조작자" value={membership.adminBy || '-'} />
                <Field label="사유" value={membership.adminReason || '-'} />
                {/* The relay keeps only the most recent operation; everything before it went to Slack. */}
                <p className="text-[11px] text-muted-foreground">
                    서버는 최근 1건만 남깁니다. 이전 이력은 슬랙 리포트에 있습니다.
                </p>
            </Section>

            <Section title="보유 클라우드">
                <CloudPanel clouds={clouds?.list} aggr={clouds?.aggr} isLoading={cloudsLoading} />
            </Section>

            <Section title="오버라이드 변경">
                <OverridePanel key={`${userId}@${stage}`} membership={membership} onDone={onUpdated} stage={stage} />
            </Section>
        </aside>
    );
};
