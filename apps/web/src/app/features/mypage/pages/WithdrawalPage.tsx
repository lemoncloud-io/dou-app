import { User } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useWebCoreStore } from '@chatic/web-core';
import { useLogout } from '@chatic/auth';

import { PageHeader } from '../../../shared/components';
import { KeyboardAwareLayout } from '../../../shared/layouts';
import { WithdrawalDialog } from '../components/WithdrawalDialog';

export const WithdrawalPage = () => {
    const { t } = useTranslation();
    const profile = useWebCoreStore(s => s.profile);
    const { mutate: logout } = useLogout();

    const [isDialogOpen, setIsDialogOpen] = useState(false);

    const userName = profile?.$user?.name || 'User';
    const userImageUrl = profile?.$user?.imageUrl;

    const handleConfirmClick = () => {
        setIsDialogOpen(true);
    };

    const handleWithdrawal = () => {
        // TODO: Implement actual withdrawal API call
        logout();
    };

    return (
        <KeyboardAwareLayout
            header={<PageHeader title={t('mypage.withdrawal.title')} />}
            footer={
                <div className="px-5 pt-4">
                    <button
                        onClick={handleConfirmClick}
                        className="w-full rounded-2xl bg-[#B0EA10] py-4 text-[15px] font-semibold text-foreground transition-transform active:scale-[0.98]"
                    >
                        {t('mypage.withdrawal.confirm')}
                    </button>
                </div>
            }
        >
            <div className="flex min-h-full flex-col items-center justify-center px-5">
                {/* Avatar */}
                <div className="mb-4 flex h-[82px] w-[82px] items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
                    {userImageUrl ? (
                        <img src={userImageUrl} alt="Profile" className="h-full w-full object-cover" />
                    ) : (
                        <User size={36} className="text-muted-foreground" />
                    )}
                </div>

                <p className="mb-1 text-[17px] font-semibold text-foreground">
                    {t('mypage.withdrawal.heading', { name: userName })}
                </p>

                <p className="mb-6 text-[17px] font-semibold text-foreground">{t('mypage.withdrawal.question')}</p>

                <div className="text-center">
                    <p className="text-[14px] text-muted-foreground">{t('mypage.withdrawal.warning1')}</p>
                    <p className="text-[14px] text-muted-foreground">{t('mypage.withdrawal.warning2')}</p>
                </div>
            </div>

            <WithdrawalDialog
                isOpen={isDialogOpen}
                onClose={() => setIsDialogOpen(false)}
                onConfirm={handleWithdrawal}
            />
        </KeyboardAwareLayout>
    );
};
