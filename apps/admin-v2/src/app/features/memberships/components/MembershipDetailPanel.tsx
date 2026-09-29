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
                    Select a row to open its detail here.
                </p>
            </aside>
        );
    }

    const badge = describeOverrideBadge(membership, now);

    return (
        <aside
            className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[26rem] flex-col overflow-y-auto border-l border-border bg-card shadow-2xl xl:static xl:z-auto xl:w-[26rem] xl:shrink-0 xl:shadow-none"
            aria-label="Membership detail"
        >
            <header className="flex items-center gap-2 border-b border-border px-5 py-3">
                <span className="font-mono text-sm text-foreground">{userId || '(no userId)'}</span>
                <span className="flex-1" />
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                    Close
                </button>
            </header>

            <Section title="Current status">
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
                    <span className="rounded border border-border px-1.5 py-0.5">Override: {badge.label}</span>
                </div>
                {hasDerivationMismatch(membership) && (
                    <p className="text-[11px] leading-snug text-amber-400">
                        The stored status and the live isValid disagree. The server has no batch that reverts an expired
                        grant, so an override past its term still shows this way.
                    </p>
                )}
            </Section>

            <Section title="Membership">
                <Field label="Grade" value={describeGrade(membership, now)} />
                <Field label="Valid until" value={membership.validUntil ? formatDate(membership.validUntil) : '-'} />
                <Field label="Platform" value={membership.platform ?? '-'} />
                <Field label="Auto-renew" value={String(membership.autoRenewing ?? '-')} />
                <Field label="Canceled at" value={membership.canceledAt ? formatDate(membership.canceledAt) : '-'} />
                <Field label="Receipt" value={membership.receiptId ?? '-'} />
            </Section>

            <Section title="Admin override">
                <Field label="Status" value={membership.adminStatus || '(none)'} />
                <Field
                    label="Expires"
                    value={membership.adminUntil ? formatDate(membership.adminUntil) : 'Indefinite/none'}
                />
                <Field label="Grade" value={membership.adminProductId || '-'} />
                <Field label="Last action" value={membership.adminAt ? formatDate(membership.adminAt) : '-'} />
                <Field label="Actor" value={membership.adminBy || '-'} />
                <Field label="Reason" value={membership.adminReason || '-'} />
                {/* The relay keeps only the most recent operation; everything before it went to Slack. */}
                <p className="text-[11px] text-muted-foreground">
                    The server keeps only the latest entry. Earlier history is in the Slack report.
                </p>
            </Section>

            <Section title="Owned clouds">
                <CloudPanel clouds={clouds?.list} aggr={clouds?.aggr} isLoading={cloudsLoading} />
            </Section>

            <Section title="Change override">
                <OverridePanel key={`${userId}@${stage}`} membership={membership} onDone={onUpdated} stage={stage} />
            </Section>
        </aside>
    );
};
