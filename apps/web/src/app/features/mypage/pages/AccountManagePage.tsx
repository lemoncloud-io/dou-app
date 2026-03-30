import { ChevronLeft, ChevronRight, LogOut, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';
import { useWebCoreStore } from '@chatic/web-core';
import { useClouds } from '@chatic/users';

export const AccountManagePage = () => {
    const navigate = useNavigateWithTransition();
    const { t } = useTranslation();
    const profile = useWebCoreStore(s => s.profile);
    const { data } = useClouds();
    const clouds = data?.list ?? [];

    return (
        <div className="flex min-h-screen flex-col bg-background">
            {/* Header */}
            <header className="flex items-center px-[6px] pt-safe-top">
                <button onClick={() => navigate(-1)} className="rounded-full p-[9px]">
                    <ChevronLeft size={26} strokeWidth={2} />
                </button>
                <h1 className="flex-1 text-center text-[16px] font-semibold">{t('mypage.accountManage.title')}</h1>
                <div className="w-[44px]" />
            </header>

            <div className="flex flex-col gap-[18px] px-4 pt-4">
                {/* Current Account */}
                <div className="flex flex-col gap-1">
                    <span className="px-1 text-[16px] font-medium tracking-[-0.015em] text-label">
                        {t('mypage.accountManage.currentAccount')}
                    </span>
                    <div className="rounded-[18px] bg-card px-0.5 py-2 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none">
                        <div className="flex items-center gap-3 px-4 py-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted">
                                <User size={16} className="text-muted-foreground" />
                            </div>
                            <div className="flex flex-col gap-0.5">
                                <span className="text-[15px] font-medium">{profile?.$user?.name ?? '-'}</span>
                                <span className="text-[14px] text-muted-foreground">
                                    {profile?.$user?.email ?? '-'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Cloud Accounts */}
                <div className="flex flex-col gap-1">
                    <span className="px-1 text-[16px] font-medium tracking-[-0.015em] text-label">
                        {t('mypage.accountManage.cloudAccounts')}
                    </span>
                    <div className="rounded-[18px] bg-card px-0.5 py-2 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none">
                        {clouds.length === 0 ? (
                            <div className="flex items-center justify-center py-6 text-[14px] text-muted-foreground">
                                {t('mypage.accountManage.noAccounts')}
                            </div>
                        ) : (
                            clouds.map((cloud, index) => (
                                <div key={cloud.id}>
                                    <div className="flex items-center justify-between px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted">
                                                <User size={16} className="text-muted-foreground" />
                                            </div>
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-[15px] font-medium">
                                                    {cloud.name ?? cloud.email?.split('@')[0] ?? '-'}
                                                </span>
                                                <span className="text-[14px] text-muted-foreground">
                                                    {cloud.email ?? '-'}
                                                </span>
                                            </div>
                                        </div>
                                        <ChevronRight size={18} className="text-muted-foreground" />
                                    </div>
                                    {index < clouds.length - 1 && <div className="mx-4 border-t border-border" />}
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Logout */}
                <div className="rounded-[18px] bg-card px-0.5 py-2 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none">
                    <button
                        onClick={() => navigate('/mypage/withdrawal')}
                        className="flex w-full items-center gap-3 px-4 py-3"
                    >
                        <LogOut size={18} className="text-destructive" />
                        <span className="text-[15px] font-medium text-destructive">
                            {t('mypage.accountManage.deleteAccount')}
                        </span>
                    </button>
                </div>
            </div>
        </div>
    );
};
