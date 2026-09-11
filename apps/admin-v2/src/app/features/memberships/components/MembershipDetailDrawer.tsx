/**
 * `components/memberships/MembershipDetailDrawer.tsx`
 * - Right-side drawer for one membership: the record as stored, the override in force, that user's
 *   clouds, and the form that changes any of it.
 */
import { formatDate } from '@chatic/shared';
import { Badge } from '@chatic/ui-kit/components/ui/badge';
import { Separator } from '@chatic/ui-kit/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@chatic/ui-kit/components/ui/sheet';

import { useAdminClouds } from '../api/membershipsQuery';
import { describeGrade, describeOverrideBadge, hasDerivationMismatch } from '../lib/membershipRow';
import { CloudPanel } from './CloudPanel';
import { OverridePanel } from './OverridePanel';

import type { MembershipView } from '@lemoncloud/chatic-backend-api';
import type { JSX } from 'react';

interface MembershipDetailDrawerProps {
    membership: MembershipView | null;
    onClose: () => void;
    onUpdated: (updated: MembershipView) => void;
    now: number;
}

const Field = ({ label, value }: { label: string; value: string }): JSX.Element => (
    <div className="flex justify-between gap-3 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-right font-mono break-all">{value}</span>
    </div>
);

export const MembershipDetailDrawer = ({
    membership,
    onClose,
    onUpdated,
    now,
}: MembershipDetailDrawerProps): JSX.Element => {
    // `id` is `MS<uid>`, not the user id — a record without `userId` has no usable target.
    const userId = membership?.userId ?? '';
    const { data: clouds, isLoading: cloudsLoading } = useAdminClouds(membership ? userId : undefined);
    const badge = membership ? describeOverrideBadge(membership, now) : null;

    return (
        <Sheet open={!!membership} onOpenChange={open => !open && onClose()}>
            <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
                {membership && (
                    <>
                        <SheetHeader>
                            <SheetTitle className="font-mono">{userId || '(userId 없음)'}</SheetTitle>
                            <SheetDescription>
                                멤버십 응답에는 이름·이메일이 없습니다. 아래 클라우드 목록에는 인증된 이메일이 있습니다.
                            </SheetDescription>
                        </SheetHeader>

                        <div className="mt-5 space-y-5">
                            <section className="space-y-1.5">
                                <h3 className="text-sm font-semibold">현재 상태</h3>
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <Badge variant="outline">status: {membership.status ?? '-'}</Badge>
                                    <Badge variant={membership.isValid ? 'default' : 'destructive'}>
                                        isValid: {String(membership.isValid ?? '-')}
                                    </Badge>
                                    {badge && <Badge variant="secondary">오버라이드: {badge.label}</Badge>}
                                </div>
                                {hasDerivationMismatch(membership) && (
                                    <p className="text-destructive text-xs">
                                        저장된 status와 실시간 isValid가 어긋납니다. 서버에는 부여 만료를 되돌리는
                                        배치가 없어, 기간이 끝난 오버라이드가 이렇게 보입니다.
                                    </p>
                                )}
                            </section>

                            <Separator />

                            <section className="space-y-1.5">
                                <h3 className="text-sm font-semibold">멤버십</h3>
                                <Field label="등급" value={describeGrade(membership, now)} />
                                <Field
                                    label="유효기간"
                                    value={membership.validUntil ? formatDate(membership.validUntil) : '-'}
                                />
                                <Field label="플랫폼" value={membership.platform ?? '-'} />
                                <Field label="자동갱신" value={String(membership.autoRenewing ?? '-')} />
                                <Field
                                    label="취소일"
                                    value={membership.canceledAt ? formatDate(membership.canceledAt) : '-'}
                                />
                                <Field label="영수증" value={membership.receiptId ?? '-'} />
                            </section>

                            <Separator />

                            <section className="space-y-1.5">
                                <h3 className="text-sm font-semibold">관리자 오버라이드</h3>
                                <Field label="상태" value={membership.adminStatus || '(없음)'} />
                                <Field
                                    label="만료"
                                    value={membership.adminUntil ? formatDate(membership.adminUntil) : '무기한/없음'}
                                />
                                <Field label="등급" value={membership.adminProductId || '-'} />
                                <Field
                                    label="최근 조작"
                                    value={membership.adminAt ? formatDate(membership.adminAt) : '-'}
                                />
                                <Field label="조작자" value={membership.adminBy || '-'} />
                                <Field label="사유" value={membership.adminReason || '-'} />
                                {/* The relay keeps only the most recent operation on the record;
                                    everything before it went to Slack. */}
                                <p className="text-muted-foreground text-xs">
                                    서버는 최근 1건만 남깁니다. 이전 이력은 슬랙 리포트에 있습니다.
                                </p>
                            </section>

                            <Separator />

                            <section className="space-y-2">
                                <h3 className="text-sm font-semibold">보유 클라우드</h3>
                                <CloudPanel clouds={clouds?.list} aggr={clouds?.aggr} isLoading={cloudsLoading} />
                            </section>

                            <Separator />

                            <section className="space-y-2">
                                <h3 className="text-sm font-semibold">오버라이드 변경</h3>
                                {/* Keyed so switching rows without closing the drawer does not carry the previous
                                    user's half-filled form — including a selected 차단 mode — onto the next one. */}
                                <OverridePanel key={userId} membership={membership} onDone={onUpdated} />
                            </section>
                        </div>
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
};
