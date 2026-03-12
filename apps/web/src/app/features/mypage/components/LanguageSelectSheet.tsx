import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';

interface LanguageSelectSheetProps {
    isOpen: boolean;
    onClose: () => void;
}

const languages = [
    { code: 'ko', label: '한국어' },
    { code: 'en', label: 'English' },
] as const;

export const LanguageSelectSheet = ({ isOpen, onClose }: LanguageSelectSheetProps) => {
    const { i18n, t } = useTranslation();
    const currentLanguage = i18n.language;

    const handleLanguageChange = (langCode: string) => {
        i18n.changeLanguage(langCode);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
            {/* Sheet */}
            <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-background pb-safe-bottom">
                <div className="flex items-center justify-between border-b border-border px-5 py-4">
                    <h2 className="text-lg font-semibold text-foreground">{t('mypage.language.select')}</h2>
                    <button onClick={onClose} className="p-1">
                        <X size={24} className="text-muted-foreground" />
                    </button>
                </div>
                <div className="px-5 py-2">
                    {languages.map(lang => (
                        <button
                            key={lang.code}
                            onClick={() => handleLanguageChange(lang.code)}
                            className={cn(
                                'flex w-full items-center justify-between rounded-lg px-3 py-4 transition-colors',
                                currentLanguage === lang.code ? 'bg-accent/10' : 'active:bg-muted'
                            )}
                        >
                            <span className="text-[15px] text-foreground">{lang.label}</span>
                            {currentLanguage === lang.code && <Check size={20} className="text-primary" />}
                        </button>
                    ))}
                </div>
            </div>
        </>
    );
};
