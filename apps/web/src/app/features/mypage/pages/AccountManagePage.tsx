import { ChevronLeft, Loader2, User } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useQueryClient } from '@tanstack/react-query';

import { useNavigateWithTransition } from '@chatic/shared';
import { useClouds, cloudsKeys } from '@chatic/users';
import { useMembershipInfo, useDeleteCloud } from '@chatic/subscriptions';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { cloudCore } from '@chatic/web-core';

import type { CloudView } from '@lemoncloud/chatic-backend-api';

export const AccountManagePage = () => {
    const navigate = useNavigateWithTransition();
    const { t } = useTranslation();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { data } = useClouds({ limit: -1 });
    const clouds = data?.list ?? [];
    const { data: membership } = useMembershipInfo();
    const deleteCloud = useDeleteCloud();
    const selectedCloudId = cloudCore.getSelectedCloudId();

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
            toast({ title: t('mypage.accountManage.deleteSuccess') });
            if (isDeletingSelectedCloud) {
                cloudCore.clearSession();
                window.location.href = '/auth/login';
            }
        } catch {
            toast({ title: t('mypage.accountManage.deleteFailed'), variant: 'destructive' });
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <div className="flex min-h-screen flex-col bg-background">
            <header className="flex items-center px-[6px] pt-safe-top">
                <button onClick={() => navigate(-1)} className="rounded-full p-[9px]">
                    <ChevronLeft size={26} strokeWidth={2} />
                </button>
                <h1 className="flex-1 text-center text-[16px] font-semibold">{t('mypage.accountManage.title')}</h1>
                <div className="w-[44px]" />
            </header>

            <div className="flex flex-col px-4 pt-4">
                {clouds.length === 0 ? (
                    <div className="flex items-center justify-center py-10 text-[14px] text-muted-foreground">
                        {t('mypage.accountManage.noAccounts')}
                    </div>
                ) : (
                    clouds.map((cloud, index) => (
                        <div key={cloud.id}>
                            <div className="flex flex-col gap-[10px] px-0 py-3">
                                <div className="flex items-center gap-3">
                                    {/* 프로필 이미지 */}
                                    <div className="flex h-[62px] w-[62px] flex-shrink-0 items-center justify-center rounded-full border border-[#F4F5F5] bg-[rgba(0,43,126,0.04)]">
                                        <User size={22} className="text-muted-foreground" />
                                    </div>

                                    {/* 이름 + 이메일 */}
                                    <div className="flex flex-1 flex-col gap-[2px]">
                                        <span className="text-[17px] font-semibold leading-[1.19] tracking-[-0.025em] text-[#3A3C40] dark:text-foreground">
                                            {cloud.name ?? cloud.email?.split('@')[0] ?? '-'}
                                        </span>
                                        <span className="text-[14px] leading-[1.19] tracking-[-0.01em] text-[#9FA2A7]">
                                            {cloud.email ?? '-'}
                                        </span>
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
                                                {t('mypage.accountManage.delete')}
                                            </span>
                                        )}
                                    </button>
                                </div>

                                {/* 구독 배지 */}
                                {membership?.isValid && membership.productId && (
                                    <div className="flex items-center rounded-[10px] bg-[rgba(0,43,126,0.04)] px-0 py-2">
                                        <span className="w-full text-center text-[14px] font-medium leading-[1.19] tracking-[-0.02em] text-[#84888F]">
                                            {`"${membership.productId}" ${t('mypage.accountManage.subscriptionActive')}`}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {index < clouds.length - 1 && <div className="border-t border-[#F4F5F5]" />}
                        </div>
                    ))
                )}
            </div>

            {/* 삭제 확인 다이얼로그 */}
            {confirmCloud && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="mx-6 w-full max-w-[300px] rounded-[18px] bg-card p-6">
                        <h3 className="text-center text-[17px] font-semibold">
                            {t('mypage.accountManage.deleteConfirmTitle')}
                        </h3>
                        <p className="mt-2 text-center text-[14px] text-muted-foreground">
                            {t('mypage.accountManage.deleteConfirmDesc', {
                                name: confirmCloud.name ?? confirmCloud.email,
                            })}
                        </p>
                        {confirmCloud.id === selectedCloudId && (
                            <p className="mt-2 text-center text-[13px] font-medium text-destructive">
                                {t('mypage.accountManage.deleteSelectedCloudWarning')}
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
                                {t('mypage.accountManage.delete')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
