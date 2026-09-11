/**
 * `components/memberships/MembershipTable.tsx`
 * - The membership list. Rows are selectable; selection opens the detail drawer.
 *
 * There is no name or email column because the relay's `MembershipView` carries neither — a
 * membership identifies its user by id alone. Finding a specific person is done with the `userId`
 * filter above the table rather than by scanning.
 */
import { formatDate } from '@chatic/shared';
import { Badge } from '@chatic/ui-kit/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@chatic/ui-kit/components/ui/table';

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

const OVERRIDE_VARIANT = {
    none: 'outline',
    grant: 'default',
    block: 'destructive',
} as const;

export const MembershipTable = ({ rows, selectedUserId, onSelect, now }: MembershipTableProps): JSX.Element => (
    <div className="rounded-lg border">
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>User ID</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>오버라이드</TableHead>
                    <TableHead>등급</TableHead>
                    <TableHead>유효기간</TableHead>
                    <TableHead>플랫폼</TableHead>
                    <TableHead>최근 조작</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {rows.length === 0 ? (
                    <TableRow>
                        <TableCell colSpan={7} className="text-muted-foreground h-24 text-center">
                            멤버십이 없습니다
                        </TableCell>
                    </TableRow>
                ) : (
                    rows.map(row => {
                        const badge = describeOverrideBadge(row, now);
                        const mismatch = hasDerivationMismatch(row);
                        // `row.id` identifies the record (`MS<uid>`); only `userId` identifies the user.
                        const userId = row.userId ?? '';

                        return (
                            <TableRow
                                key={row.id ?? userId}
                                onClick={() => onSelect(row)}
                                className={`cursor-pointer ${selectedUserId === userId ? 'bg-muted' : ''}`}
                            >
                                <TableCell className="font-mono text-xs">{userId || '-'}</TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-1.5">
                                        <span>{row.status ?? '-'}</span>
                                        <Badge variant={row.isValid ? 'default' : 'outline'}>
                                            {row.isValid ? 'valid' : 'invalid'}
                                        </Badge>
                                        {/* The stored status and the live verdict disagree — almost
                                            always a grant whose `adminUntil` has passed, since
                                            nothing on the server rewrites `status` afterwards. */}
                                        {mismatch && (
                                            <span
                                                className="text-destructive text-xs"
                                                title="저장된 status와 실시간 isValid가 어긋납니다. 부여가 만료된 상태일 수 있습니다."
                                            >
                                                ⚠︎
                                            </span>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Badge variant={OVERRIDE_VARIANT[badge.kind]}>{badge.label}</Badge>
                                </TableCell>
                                <TableCell className="text-xs">{describeGrade(row, now)}</TableCell>
                                <TableCell className="text-xs">
                                    {row.validUntil ? formatDate(row.validUntil) : '-'}
                                </TableCell>
                                <TableCell className="text-xs">{row.platform ?? '-'}</TableCell>
                                <TableCell className="text-xs">
                                    {row.adminAt ? `${formatDate(row.adminAt)} · ${row.adminBy || '-'}` : '-'}
                                </TableCell>
                            </TableRow>
                        );
                    })
                )}
            </TableBody>
        </Table>
    </div>
);
