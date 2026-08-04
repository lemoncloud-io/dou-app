import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';

import { PageHeader } from '../../../ui/components';
import { ROUTES } from '../../../routes/paths';
import { useUserPermissions } from '../../../hooks';
import { AccountLinkSection } from '../components';

export const AccountInfoPage = () => {
    const navigate = useNavigateWithTransition();
    const { t } = useTranslation();
    const permissions = useUserPermissions();

    return (
        <div className="flex h-full flex-col bg-background pt-safe-top">
            <PageHeader title={t('mypage.accountInfo.title')} />

            {/* Menu Cards */}
            <div className="flex flex-col gap-[18px] px-4 pt-4">
                {/* Profile Card */}
                <div className="rounded-[18px] bg-card px-0.5 py-2 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none">
                    <button
                        onClick={() => navigate(ROUTES.mypage.account.edit)}
                        className="flex w-full items-center justify-between py-3 pl-4 pr-3"
                    >
                        <span className="text-[15px] font-medium text-foreground">
                            {t('mypage.accountInfo.profileEdit')}
                        </span>
                        <ChevronRight size={18} className="text-muted-foreground" />
                    </button>
                    {permissions.useCloudProfile && (
                        <button
                            onClick={() => navigate(ROUTES.mypage.account.cloudProfile)}
                            className="flex w-full items-center justify-between py-3 pl-4 pr-3"
                        >
                            <span className="text-[15px] font-medium text-foreground">
                                {t('mypage.accountInfo.cloudProfileEdit')}
                            </span>
                            <ChevronRight size={18} className="text-muted-foreground" />
                        </button>
                    )}
                </div>

                <AccountLinkSection />

                {/* Temporarily hidden — TODO: re-enable withdrawal entry
                <div className="rounded-[18px] bg-card px-0.5 py-1.5 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none">
                    <button
                        onClick={() => navigate(ROUTES.mypage.account.withdrawal)}
                        className="flex w-full items-center justify-between py-3 pl-4 pr-3"
                    >
                        <span className="text-[15px] font-medium text-foreground">
                            {t('mypage.accountInfo.withdrawal')}
                        </span>
                        <ChevronRight size={18} className="text-muted-foreground" />
                    </button>
                </div>
                */}
            </div>
        </div>
    );
};
