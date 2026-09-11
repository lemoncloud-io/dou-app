/**
 * `components/memberships/MembershipTable.tsx`
 * - The membership list. Rows are selectable; selection opens the detail drawer.
 *
 * A plain table on the monitoring scale rather than the ui-kit one: this screen wants dense rows,
 * a sticky header and its own hover/selection states, none of which the shared table offers.
 *
 * There is no name or email column because the relay's `MembershipView` carries neither — a
 * membership identifies its user by id alone. Finding a specific person is done with the `userId`
 * filter above the table rather than by scanning.
 */
import { formatDate } from '@chatic/shared';

import { describeGrade, describeOverrideBadge, hasDerivationMismatch } from '../lib/membershipRow';

import type { MembershipView } from '@lemoncloud/chatic-backend-api';
import type { JSX } from 'react';

interface MembershipTableProps {
    rows: MembershipView[];
    selectedUserId?: string;
    onSelect: (membership: MembershipView) => void;
    /** Passed in so every row in one render judges expiry against the same instant. */
    now: number;
}

const OVERRIDE_TAG: Record<string, string> = {
    none: 'mb-tag',
    grant: 'mb-tag mb-tag-ok',
    block: 'mb-tag mb-tag-danger',
};

export const MembershipTable = ({ rows, selectedUserId, onSelect, now }: MembershipTableProps): JSX.Element => {
    if (rows.length === 0) {
        return <div className="mb-empty">조건에 맞는 멤버십이 없습니다</div>;
    }

    return (
        <table className="mb-table">
            <thead>
                <tr>
                    <th>User ID</th>
                    <th>Status</th>
                    <th>Override</th>
                    <th>Grade</th>
                    <th>Valid Until</th>
                    <th>Platform</th>
                    <th>Last Admin Action</th>
                </tr>
            </thead>
            <tbody>
                {rows.map(row => {
                    const badge = describeOverrideBadge(row, now);
                    const mismatch = hasDerivationMismatch(row);
                    // `row.id` identifies the record (`MS<uid>`); only `userId` identifies the user.
                    const userId = row.userId ?? '';

                    return (
                        <tr
                            key={row.id ?? userId}
                            onClick={() => onSelect(row)}
                            className={`mb-row ${selectedUserId === userId ? 'mb-row-selected' : ''}`}
                        >
                            <td className="mb-mono">{userId || '-'}</td>
                            <td>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                    <span>{row.status ?? '-'}</span>
                                    <span className={`mb-tag ${row.isValid ? 'mb-tag-ok' : ''}`}>
                                        {row.isValid ? 'valid' : 'invalid'}
                                    </span>
                                    {/* The stored status and the live verdict disagree — almost
                                        always a grant whose `adminUntil` has passed, since nothing
                                        on the server rewrites `status` afterwards. */}
                                    {mismatch && (
                                        <span
                                            className="mb-warnmark"
                                            title="저장된 status와 실시간 isValid가 어긋납니다. 부여가 만료된 상태일 수 있습니다."
                                        >
                                            ⚠
                                        </span>
                                    )}
                                </span>
                            </td>
                            <td>
                                <span className={OVERRIDE_TAG[badge.kind]}>{badge.label}</span>
                            </td>
                            <td>{describeGrade(row, now)}</td>
                            <td>{row.validUntil ? formatDate(row.validUntil) : '-'}</td>
                            <td>{row.platform ?? '-'}</td>
                            <td>{row.adminAt ? `${formatDate(row.adminAt)} · ${row.adminBy || '-'}` : '-'}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
};
