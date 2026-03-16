import { User } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useWebCoreStore } from '@chatic/web-core';

import { PageHeader } from '../../../shared/components';
import { WithdrawalDialog } from '../components/WithdrawalDialog';

export const WithdrawalPage = () => {
    const { t } = useTranslation();
    const profile = useWebCoreStore(s => s.profile);
    const logout = useWebCoreStore(s => s.logout);

    const [isDialogOpen, setIsDialogOpen] = useState(false);

    const userName = profile?.$user?.name || 'User';
    const userImageUrl = profile?.$user?.imageUrl;

    const handleConfirmClick = () => {
        setIsDialogOpen(true);
    };

    const handleWithdrawal = () => {
        // TODO: Implement actual withdrawal API call
        logout();
        window.location.href = '/auth/login';
    };

    return (
        <div className="flex h-full flex-col bg-background">
            <PageHeader title={t('mypage.withdrawal.title')} />

            {/* Content */}
            <div className="flex flex-1 flex-col items-center justify-center px-5">
                {/* Avatar */}
                <div className="mb-4 flex h-[82px] w-[82px] items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
                    {userImageUrl ? (
                        <img src={userImageUrl} alt="Profile" className="h-full w-full object-cover" />
                    ) : (
                        <User size={36} className="text-muted-foreground" />
                    )}
                </div>

                {/* User Name */}
                <p className="mb-1 text-[17px] font-semibold text-foreground">
                    {t('mypage.withdrawal.heading', { name: userName })}
                </p>

                {/* Question */}
                <p className="mb-6 text-[17px] font-semibold text-foreground">{t('mypage.withdrawal.question')}</p>

                {/* Warning Text */}
                <div className="text-center">
                    <p className="text-[14px] text-muted-foreground">{t('mypage.withdrawal.warning1')}</p>
                    <p className="text-[14px] text-muted-foreground">{t('mypage.withdrawal.warning2')}</p>
                </div>
            </div>

            {/* Confirm Button */}
            <div className="px-5 pb-10 pt-4">
                <button
                    onClick={handleConfirmClick}
                    className="w-full rounded-2xl bg-[#B0EA10] py-4 text-[15px] font-semibold text-foreground transition-transform active:scale-[0.98]"
                >
                    {t('mypage.withdrawal.confirm')}
                </button>
            </div>

            {/* Withdrawal Dialog */}
            <WithdrawalDialog
                isOpen={isDialogOpen}
                onClose={() => setIsDialogOpen(false)}
                onConfirm={handleWithdrawal}
            />
        </div>
    );
};
