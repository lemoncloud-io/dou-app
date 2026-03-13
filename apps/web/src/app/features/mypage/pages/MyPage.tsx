import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useWebCoreStore } from '@chatic/web-core';

import { BottomNavigation } from '../../../shared/components/BottomNavigation';
import { LogoutDialog } from '../components';

const APP_VERSION = '00.00.0';

export const MyPage = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const isGuest = useWebCoreStore(s => s.isGuest);
    const profile = useWebCoreStore(s => s.profile);
    const logout = useWebCoreStore(s => s.logout);
    const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);

    const handleLogout = () => {
        logout();
        window.location.href = '/auth/login';
    };

    const handleProfileClick = () => {
        // Profile dropdown - for now, just navigate to edit
        navigate('/mypage/edit');
    };

    return (
        <div className="flex min-h-screen flex-col bg-background pt-safe-top pb-32">
            {/* Profile Section */}
            <div className="px-[18px] py-3">
                {isGuest ? (
                    <button onClick={() => navigate('/mypage/login')} className="flex flex-col gap-1.5 text-left">
                        <div className="flex items-center gap-1">
                            <span className="text-[22px] font-semibold text-foreground">{t('mypage.loginPrompt')}</span>
                            <ChevronRight size={18} className="text-foreground" />
                        </div>
                        <p className="text-[14px] font-medium text-muted-foreground">{t('mypage.loginDescription')}</p>
                    </button>
                ) : (
                    <button onClick={handleProfileClick} className="flex items-center gap-3">
                        <div className="flex h-[62px] w-[62px] items-center justify-center overflow-hidden rounded-full border border-[#f4f5f5] bg-[rgba(0,43,126,0.04)]">
                            {profile?.$user?.imageUrl ? (
                                <img
                                    src={profile.$user.imageUrl}
                                    alt="Profile"
                                    className="h-full w-full object-cover"
                                />
                            ) : (
                                <span role="img" aria-label="user" className="text-2xl text-muted-foreground">
                                    👤
                                </span>
                            )}
                        </div>
                        <div className="flex flex-col items-start gap-0.5">
                            <div className="flex items-center gap-1">
                                <h2 className="text-[18px] font-semibold text-[#3a3c40]">{profile?.$user?.name}</h2>
                                <ChevronDown size={18} className="text-[#3a3c40]" />
                            </div>
                            <p className="text-[14px] text-[#9fa2a7]">{profile?.$user?.email}</p>
                        </div>
                    </button>
                )}
            </div>

            {/* Menu Cards Container */}
            <div className="flex flex-col gap-[18px] px-4 pt-4">
                {/* My Info Card - Logged in only */}
                {!isGuest && (
                    <div className="rounded-[18px] bg-white px-0.5 py-2 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.08)]">
                        <button
                            onClick={() => navigate('/mypage/account')}
                            className="flex w-full items-center justify-between py-3 pl-4 pr-3"
                        >
                            <span className="text-[17px] font-medium text-[#222325]">
                                {t('mypage.accountInfo.title')}
                            </span>
                            <ChevronRight size={18} className="text-[#84888f]" />
                        </button>
                    </div>
                )}

                {/* Policy and Version Card */}
                <div className="rounded-[18px] bg-white px-0.5 py-2 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.08)]">
                    <button
                        onClick={() => navigate('/mypage/policy')}
                        className="flex w-full items-center justify-between py-3 pl-4 pr-3"
                    >
                        <span className="text-[17px] font-medium text-[#222325]">{t('mypage.policy.title')}</span>
                        <ChevronRight size={18} className="text-[#84888f]" />
                    </button>
                    <div className="flex items-center justify-between py-3 pl-4 pr-3">
                        <div className="flex items-center gap-[3px]">
                            <span className="text-[17px] font-medium text-[#222325]">{t('mypage.appVersion')}</span>
                            <span className="text-[17px] font-medium text-[#222325]">{APP_VERSION}</span>
                        </div>
                        <div className="flex items-center">
                            <span className="text-[16px] text-[#9fa2a7]">{t('mypage.updateRequired')}</span>
                            <ChevronRight size={18} className="text-[#84888f]" />
                        </div>
                    </div>
                </div>

                {/* Logout Card - Logged in only */}
                {!isGuest && (
                    <div className="rounded-[18px] bg-white px-0.5 py-1.5 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.08)]">
                        <button
                            onClick={() => setIsLogoutDialogOpen(true)}
                            className="flex w-full items-center justify-between py-3 pl-4 pr-3"
                        >
                            <span className="text-[17px] font-medium text-[#222325]">{t('mypage.logout')}</span>
                            <ChevronRight size={18} className="text-[#84888f]" />
                        </button>
                    </div>
                )}
            </div>

            <BottomNavigation />

            {/* Logout Dialog */}
            <LogoutDialog
                isOpen={isLogoutDialogOpen}
                onClose={() => setIsLogoutDialogOpen(false)}
                onConfirm={handleLogout}
            />
        </div>
    );
};
