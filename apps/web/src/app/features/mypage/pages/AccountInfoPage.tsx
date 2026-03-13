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

            {/* Menu Items */}
            <div className="flex flex-col">
                {/* Profile Edit */}
                <button
                    onClick={() => navigate('/mypage/edit')}
                    className="flex items-center justify-between border-b border-border px-5 py-4"
                >
                    <span className="text-[15px] text-foreground">{t('mypage.accountInfo.profileEdit')}</span>
                    <ChevronRight size={20} className="text-muted-foreground" />
                </button>

                {/* Workspace Settings */}
                <button
                    onClick={() => navigate('/workspace-list')}
                    className="flex items-center justify-between border-b border-border px-5 py-4"
                >
                    <span className="text-[15px] text-foreground">{t('mypage.workspaceSettings')}</span>
                    <ChevronRight size={20} className="text-muted-foreground" />
                </button>

                {/* Dark Mode */}
                <div className="flex items-center justify-between border-b border-border px-5 py-4">
                    <span className="text-[15px] text-foreground">{t('mypage.darkMode')}</span>
                    <Switch checked={isDarkTheme} onCheckedChange={handleThemeToggle} />
                </div>

                {/* Language Settings */}
                <button
                    onClick={() => setIsLanguageSheetOpen(true)}
                    className="flex items-center justify-between border-b border-border px-5 py-4"
                >
                    <span className="text-[15px] text-foreground">{t('mypage.languageSettings')}</span>
                    <div className="flex items-center gap-1">
                        <span className="text-sm text-muted-foreground">{currentLanguageLabel}</span>
                        <ChevronRight size={20} className="text-muted-foreground" />
                    </div>
                </button>

                {/* Withdrawal */}
                <button
                    onClick={() => navigate('/mypage/withdrawal')}
                    className="flex items-center justify-between px-5 py-4"
                >
                    <span className="text-[15px] text-foreground">{t('mypage.accountInfo.withdrawal')}</span>
                    <ChevronRight size={20} className="text-muted-foreground" />
                </button>
            </div>

            {/* Language Select Sheet */}
            <LanguageSelectSheet isOpen={isLanguageSheetOpen} onClose={() => setIsLanguageSheetOpen(false)} />
        </div>
    );
};
