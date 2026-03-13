import { useTranslation } from 'react-i18next';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const PolicyListPage = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();

    return (
        <div className="flex min-h-screen flex-col bg-background pt-safe-top">
            {/* Header */}
            <header className="flex items-center justify-center px-4 py-3">
                <button onClick={() => navigate(-1)} className="absolute left-4 p-2">
                    <ChevronLeft size={24} strokeWidth={2} className="text-foreground" />
                </button>
                <h1 className="text-[17px] font-semibold text-foreground">{t('mypage.policy.title')}</h1>
            </header>

            {/* Menu Items */}
            <div className="flex flex-col">
                {/* Terms of Service */}
                <button
                    onClick={() => navigate('/mypage/policy/terms')}
                    className="flex items-center justify-between border-b border-border px-5 py-4"
                >
                    <span className="text-[15px] text-foreground">{t('mypage.policy.terms')}</span>
                    <ChevronRight size={20} className="text-muted-foreground" />
                </button>

                {/* Privacy Policy */}
                <button
                    onClick={() => navigate('/mypage/policy/privacy')}
                    className="flex items-center justify-between px-5 py-4"
                >
                    <span className="text-[15px] text-foreground">{t('mypage.policy.privacy')}</span>
                    <ChevronRight size={20} className="text-muted-foreground" />
                </button>
            </div>
        </div>
    );
};
