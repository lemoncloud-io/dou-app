import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';

import { PageHeader } from '../../../ui/components';
import { ROUTES } from '../../../routes/paths';
import { AccountLinkSection } from '../components';

/**
 * 계정 정보 — the account-level screen. Everything here is scoped to the RELAY account, never the
 * connected cloud: profile edit writes the relay record (`useUpdateProfile`) and the linked
 * credentials come from the relay token's `link$`.
 *
 * The cloud-entity name editor (`/mypage/cloud-profile`) used to hang off this screen behind an
 * owner gate. It is gone from here because the MY tree is relay-only now — a cloud's own name is not
 * an account attribute. The page and route still exist and still work; they just need a cloud-shaped
 * entry point (the switcher, or 계정 관리) instead of an account-shaped one.
 */
export const AccountInfoPage = () => {
    const navigate = useNavigateWithTransition();
    const { t } = useTranslation();

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
