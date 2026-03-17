import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';

import { PageHeader } from '../../../shared/components';

export const PolicyListPage = () => {
    const navigate = useNavigateWithTransition();
    const { t } = useTranslation();

    return (
        <div className="flex h-full flex-col bg-background">
            <PageHeader title={t('mypage.policy.title')} />

            {/* Menu Cards */}
            <div className="flex flex-col gap-[18px] px-4 pt-4">
                <div className="rounded-[18px] bg-card px-0.5 py-2 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none">
                    <button
                        onClick={() => navigate('/mypage/policy/terms')}
                        className="flex w-full items-center justify-between py-3 pl-4 pr-3"
                    >
                        <span className="text-[15px] font-medium text-foreground">{t('mypage.policy.terms')}</span>
                        <ChevronRight size={18} className="text-muted-foreground" />
                    </button>
                    <button
                        onClick={() => navigate('/mypage/policy/privacy')}
                        className="flex w-full items-center justify-between py-3 pl-4 pr-3"
                    >
                        <span className="text-[15px] font-medium text-foreground">{t('mypage.policy.privacy')}</span>
                        <ChevronRight size={18} className="text-muted-foreground" />
                    </button>
                </div>
            </div>
        </div>
    );
};
