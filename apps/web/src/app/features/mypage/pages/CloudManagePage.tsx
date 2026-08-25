import { ChevronLeft, Loader2, Pencil, User } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useQueryClient } from '@tanstack/react-query';

import { logger } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';
import { cloudsKeys, useClouds, useDeleteCloud, useSessionSelection } from '@chatic/web-core';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import type { CloudView } from '@lemoncloud/chatic-backend-api';

import { useEmailBindRequest } from '../../../stores/useEmailBindRequest';
import { CloudMembershipSummary } from '../../subscription';
import { useLogoutCloudSession } from '../../../runtime/useLogoutCloudSession';
import { ROUTES } from '../../../routes/paths';

/**
 * "클라우드 관리" — the owned clouds, with release and the recovery-email gap.
 *
 * Named for what it manages. It used to be `AccountManagePage` at `/mypage/account-manage`, which
 * read as the login-credentials screen (`/mypage/account`) and needed a doc section explaining that
 * it is not (`docs/feature/account/social-links.md`).
 */
export const CloudManagePage = () => {
    const navigate = useNavigateWithTransition();
    const { t } = useTranslation();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { data } = useClouds({ limit: -1 });
    const clouds = data?.list ?? [];
    const deleteCloud = useDeleteCloud();
    const { logoutCloudSession } = useLogoutCloudSession();
    const { selectedCloudId } = useSessionSelection();
    // Raises the request the private router's `EmailBindRequestHost` answers — one dialog instance,
    // shared with the cloud switcher and 구독 관리. This screen owns no verification flow of its own.
    const requestEmailBind = useEmailBindRequest(s => s.requestEmailBind);

    const [confirmCloud, setConfirmCloud] = useState<CloudView | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const handleDeleteConfirm = async () => {
        if (!confirmCloud?.id) return;
        const isDeletingSelectedCloud = confirmCloud.id === selectedCloudId;
        setDeletingId(confirmCloud.id);
        setConfirmCloud(null);
        try {
            await deleteCloud.mutateAsync({ id: confirmCloud.id, params: { cascade: 1 } });
            queryClient.setQueryData(cloudsKeys.list({ limit: -1 }), (old: any) => ({
                ...old,
                list: old?.list?.filter((c: any) => c.id !== confirmCloud.id) ?? [],
                total: (old?.total ?? 1) - 1,
            }));
            logger.info('CLOUD', 'cloud released', { cloudId: confirmCloud.id, wasActive: isDeletingSelectedCloud });
            toast({ title: t('mypage.cloudManage.deleteSuccess') });
            if (isDeletingSelectedCloud) {
                await logoutCloudSession();
                window.location.href = '/auth/login';
            }
        } catch (error) {
            // The error was not even bound to a variable before this: releasing a cloud is
            // irreversible and cascades, and a failure left nothing behind to explain it.
            logger.error('CLOUD', 'cloud release failed', { error, data: { cloudId: confirmCloud.id } });
            toast({ title: t('mypage.cloudManage.deleteFailed'), variant: 'destructive' });
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <div className="flex min-h-screen flex-col bg-background">
            <header className="relative flex min-h-[48px] items-center justify-center px-4 py-3 pt-safe-top">
                <button onClick={() => navigate(-1)} className="absolute left-4 p-2" aria-label="Back">
                    <ChevronLeft size={24} strokeWidth={2} className="text-foreground" />
                </button>
                <h1 className="text-[17px] font-semibold text-foreground">{t('mypage.cloudManage.title')}</h1>
            </header>

            <div className="flex flex-col px-4 pt-4">
                {/* The membership is held per account, so it is stated once — above the list, not
                    repeated on every row. Owned by `features/subscription`. */}
                <CloudMembershipSummary />

                {clouds.length === 0 ? (
                    <div className="flex items-center justify-center py-10 text-[14px] text-muted-foreground">
                        {t('mypage.cloudManage.noAccounts')}
                    </div>
                ) : (
                    clouds.map((cloud, index) => {
                        // A cloud whose provisioning failed has no email either, but binding one
                        // fixes nothing — the switcher sends the user here to release it, so the row
                        // says that instead of offering the email CTA.
                        const setupFailed = cloud.status === 'error';
                        // Same rule as `isUnboundCloud` in features/subscription: a cloud reaches
                        // `active` with no email at all, and a released one is past caring.
                        const needsEmail = !setupFailed && cloud.status !== 'expired' && !cloud.email;

                        return (
                            <div key={cloud.id}>
                                <div className="flex flex-col gap-[10px] px-0 py-3">
                                    <div className="flex items-center gap-3">
                                        {/* 프로필 이미지 */}
                                        <div className="flex h-[62px] w-[62px] flex-shrink-0 items-center justify-center rounded-full border border-[#F4F5F5] bg-[rgba(0,43,126,0.04)]">
                                            <User size={22} className="text-muted-foreground" />
                                        </div>

                                        {/* 이름 + 이메일 (없으면 등록 버튼) */}
                                        <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
                                            <div className="flex min-w-0 items-center gap-1">
                                                <span className="truncate text-[17px] font-semibold leading-[1.19] tracking-[-0.025em] text-[#3A3C40] dark:text-foreground">
                                                    {cloud.name ?? cloud.email?.split('@')[0] ?? '-'}
                                                </span>
                                                {/* Rename has a single path (ADR-0034): CloudProfileEditPage
                                                    edits only the active cloud, so the pencil only appears
                                                    on that row — other owned clouds are not renameable here. */}
                                                {cloud.id === selectedCloudId && (
                                                    <button
                                                        type="button"
                                                        onClick={() => navigate(ROUTES.mypage.account.cloudProfile)}
                                                        aria-label={t('mypage.cloudManage.editName')}
                                                        className="flex-shrink-0 p-1 text-muted-foreground"
                                                    >
                                                        <Pencil size={14} />
                                                    </button>
                                                )}
                                            </div>
                                            {setupFailed ? (
                                                <span className="text-[14px] leading-[1.19] tracking-[-0.01em] text-destructive">
                                                    {t('mypage.cloudManage.setupFailed')}
                                                </span>
                                            ) : needsEmail ? (
                                                <>
                                                    <span className="text-[14px] leading-[1.19] tracking-[-0.01em] text-[#9FA2A7]">
                                                        {t('mypage.cloudManage.emailMissing')}
                                                    </span>
                                                    {/* Deliberately here and not next to 삭제: the two
                                                        actions must not sit side by side. */}
                                                    <button
                                                        type="button"
                                                        onClick={() => cloud.id && requestEmailBind(cloud.id)}
                                                        className="self-start text-[14px] font-semibold leading-[1.19] text-point-blue underline underline-offset-2"
                                                    >
                                                        {t('mypage.cloudManage.registerEmail')}
                                                    </button>
                                                </>
                                            ) : (
                                                <span className="truncate text-[14px] leading-[1.19] tracking-[-0.01em] text-[#9FA2A7]">
                                                    {cloud.email}
                                                </span>
                                            )}
                                        </div>

                                        {/* 계정 삭제 */}
                                        <button
                                            onClick={() => setConfirmCloud(cloud)}
                                            disabled={cloud.id === deletingId}
                                            className="flex-shrink-0 disabled:opacity-30"
                                        >
                                            {deletingId === cloud.id ? (
                                                <Loader2 size={16} className="animate-spin text-muted-foreground" />
                                            ) : (
                                                <span className="text-[15px] font-medium leading-[1.19] tracking-[-0.01em] text-[#3A3C40] dark:text-foreground">
                                                    {t('mypage.cloudManage.delete')}
                                                </span>
                                            )}
                                        </button>
                                    </div>
                                </div>

                                {index < clouds.length - 1 && <div className="border-t border-[#F4F5F5]" />}
                            </div>
                        );
                    })
                )}
            </div>

            {/* 삭제 확인 다이얼로그 */}
            {confirmCloud && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="mx-6 w-full max-w-[300px] rounded-[18px] bg-card p-6">
                        <h3 className="text-center text-[17px] font-semibold">
                            {t('mypage.cloudManage.deleteConfirmTitle')}
                        </h3>
                        <p className="mt-2 text-center text-[14px] text-muted-foreground">
                            {t('mypage.cloudManage.deleteConfirmDesc', {
                                name: confirmCloud.name ?? confirmCloud.email,
                            })}
                        </p>
                        {confirmCloud.id === selectedCloudId && (
                            <p className="mt-2 text-center text-[13px] font-medium text-destructive">
                                {t('mypage.cloudManage.deleteSelectedCloudWarning')}
                            </p>
                        )}
                        <div className="mt-5 flex gap-3">
                            <button
                                onClick={() => setConfirmCloud(null)}
                                className="flex-1 rounded-full border border-border py-2.5 text-[15px] font-medium"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                onClick={handleDeleteConfirm}
                                disabled={deleteCloud.isPending}
                                className="flex-1 rounded-full bg-destructive py-2.5 text-[15px] font-medium text-white disabled:opacity-50"
                            >
                                {t('mypage.cloudManage.delete')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
