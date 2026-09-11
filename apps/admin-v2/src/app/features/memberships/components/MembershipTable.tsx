/**
 * `components/memberships/MembershipTable.tsx`
 * - The membership list. Rows are selectable; selection opens the detail column.
 *
 * A plain table rather than the ui-kit one: this console wants dense rows, a sticky header and its
 * own hover/selection states, none of which the shared table offers.
 *
 * There is no name or email column because the relay's `MembershipView` carries neither — a
 * membership identifies its user by id alone. Finding a specific person is done with the rail's
 * `userId` filter rather than by scanning.
 */
import { formatDate } from '@chatic/shared';

import { describeGrade, describeOverrideBadge, hasDerivationMismatch } from '../lib/membershipRow';

import type { MembershipView } from '@lemoncloud/chatic-backend-api';

interface MembershipTableProps {
    rows: MembershipView[];
    selectedUserId?: string;
    onSelect: (membership: MembershipView) => void;
    /** Passed in so every row in one render judges expiry against the same instant. */
    now: number;
}

const OVERRIDE_TONE: Record<string, string> = {
    none: 'border-border text-muted-foreground',
    grant: 'border-emerald-500/40 text-emerald-400',
    block: 'border-red-500/40 bg-red-500/10 text-red-400',
};

const HEADERS = ['User ID', 'Status', 'Override', 'Grade', 'Valid Until', 'Platform', 'Last Admin Action'];

export const MembershipTable = ({ rows, selectedUserId, onSelect, now }: MembershipTableProps) => {
    if (rows.length === 0) {
        return <p className="px-4 py-12 text-center text-sm text-muted-foreground">조건에 맞는 멤버십이 없습니다</p>;
    }

    return (
        <table className="w-full border-collapse text-xs">
            <thead>
                <tr>
                    {HEADERS.map(header => (
                        <th
                            key={header}
                            className="sticky top-0 z-10 whitespace-nowrap border-b border-border bg-card px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                        >
                            {header}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {rows.map(row => {
                    const badge = describeOverrideBadge(row, now);
                    // `row.id` identifies the record (`MS<uid>`); only `userId` identifies the user.
                    const userId = row.userId ?? '';
                    const isSelected = selectedUserId === userId;

                    return (
                        <tr
                            key={row.id ?? userId}
                            onClick={() => onSelect(row)}
                            className={`cursor-pointer border-b border-border ${isSelected ? 'bg-accent' : 'hover:bg-muted'}`}
                        >
                            <td className="whitespace-nowrap px-3 py-2 font-mono text-foreground">{userId || '-'}</td>
                            <td className="whitespace-nowrap px-3 py-2">
                                <span className="inline-flex items-center gap-1.5">
                                    <span className="text-foreground">{row.status ?? '-'}</span>
                                    <span
                                        className={`rounded border px-1 py-px text-[10px] ${
                                            row.isValid
                                                ? 'border-emerald-500/40 text-emerald-400'
                                                : 'border-border text-muted-foreground'
                                        }`}
                                    >
                                        {row.isValid ? 'valid' : 'invalid'}
                                    </span>
                                    {/* The stored status and the live verdict disagree — almost always a
                                        grant whose `adminUntil` has passed, since nothing on the server
                                        rewrites `status` afterwards. */}
                                    {hasDerivationMismatch(row) && (
                                        <span
                                            className="cursor-help text-amber-400"
                                            title="저장된 status와 실시간 isValid가 어긋납니다. 부여가 만료된 상태일 수 있습니다."
                                        >
                                            ⚠
                                        </span>
                                    )}
                                </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2">
                                <span
                                    className={`rounded border px-1.5 py-px text-[10px] ${OVERRIDE_TONE[badge.kind]}`}
                                >
                                    {badge.label}
                                </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                                {describeGrade(row, now)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                                {row.validUntil ? formatDate(row.validUntil) : '-'}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{row.platform ?? '-'}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                                {row.adminAt ? `${formatDate(row.adminAt)} · ${row.adminBy || '-'}` : '-'}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
};
