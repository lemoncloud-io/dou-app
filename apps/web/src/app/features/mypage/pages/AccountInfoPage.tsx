import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useTheme } from '@chatic/theme';
import { Switch } from '@chatic/ui-kit/components/ui/switch';

import { LanguageSelectSheet } from '../components';

export const AccountInfoPage = () => {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const { setTheme, isDarkTheme } = useTheme();
    const [isLanguageSheetOpen, setIsLanguageSheetOpen] = useState(false);

    const currentLanguageLabel = t(`mypage.language.${i18n.language}`);

    const handleThemeToggle = () => {
        setTheme(isDarkTheme ? 'light' : 'dark');
    };

    return (
        <div className="flex min-h-screen flex-col bg-background pt-safe-top">
            {/* Header */}
            <header className="flex items-center justify-center px-4 py-3">
                <button onClick={() => navigate(-1)} className="absolute left-4 p-2">
                    <ChevronLeft size={24} strokeWidth={2} className="text-foreground" />
                </button>
                <h1 className="text-[17px] font-semibold text-foreground">{t('mypage.accountInfo.title')}</h1>
            </header>

            {/* Menu Cards */}
            <div className="flex flex-col gap-[18px] px-4 pt-4">
                {/* Profile & Workspace Card */}
                <div className="rounded-[18px] bg-card px-0.5 py-2 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none">
                    <button
                        onClick={() => navigate('/mypage/edit')}
                        className="flex w-full items-center justify-between py-3 pl-4 pr-3"
                    >
                        <span className="text-[15px] font-medium text-foreground">
                            {t('mypage.accountInfo.profileEdit')}
                        </span>
                        <ChevronRight size={18} className="text-muted-foreground" />
                    </button>
                    <button
                        onClick={() => navigate('/workspace-list')}
                        className="flex w-full items-center justify-between py-3 pl-4 pr-3"
                    >
                        <span className="text-[15px] font-medium text-foreground">{t('mypage.workspaceSettings')}</span>
                        <ChevronRight size={18} className="text-muted-foreground" />
                    </button>
                </div>

                {/* Settings Card */}
                <div className="rounded-[18px] bg-card px-0.5 py-2 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none">
                    <div className="flex items-center justify-between py-3 pl-4 pr-3">
                        <span className="text-[15px] font-medium text-foreground">{t('mypage.darkMode')}</span>
                        <Switch checked={isDarkTheme} onCheckedChange={handleThemeToggle} />
                    </div>
                    <button
                        onClick={() => setIsLanguageSheetOpen(true)}
                        className="flex w-full items-center justify-between py-3 pl-4 pr-3"
                    >
                        <span className="text-[15px] font-medium text-foreground">{t('mypage.languageSettings')}</span>
                        <div className="flex items-center gap-1">
                            <span className="text-[14px] text-muted-foreground">{currentLanguageLabel}</span>
                            <ChevronRight size={18} className="text-muted-foreground" />
                        </div>
                    </button>
                </div>

                {/* Withdrawal Card */}
                <div className="rounded-[18px] bg-card px-0.5 py-1.5 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none">
                    <button
                        onClick={() => navigate('/mypage/withdrawal')}
                        className="flex w-full items-center justify-between py-3 pl-4 pr-3"
                    >
                        <span className="text-[15px] font-medium text-foreground">
                            {t('mypage.accountInfo.withdrawal')}
                        </span>
                        <ChevronRight size={18} className="text-muted-foreground" />
                    </button>
                </div>
            </div>

            {/* Language Select Sheet */}
            <LanguageSelectSheet isOpen={isLanguageSheetOpen} onClose={() => setIsLanguageSheetOpen(false)} />
        </div>
    );
};
