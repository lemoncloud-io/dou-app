import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@chatic/ui-kit/components/ui/sheet';

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

    return (
        <Sheet open={isOpen} onOpenChange={open => !open && onClose()}>
            <SheetContent side="bottom" className="rounded-t-2xl p-0 pb-safe-bottom" hideClose>
                <div className="flex min-h-[48px] items-center justify-between border-b border-border px-4 py-3">
                    <SheetTitle className="text-lg font-semibold text-foreground">
                        {t('mypage.language.select')}
                    </SheetTitle>
                    <button onClick={onClose} className="p-1">
                        <X size={24} className="text-muted-foreground" />
                    </button>
                </div>
                <SheetDescription className="sr-only">{t('mypage.language.select')}</SheetDescription>
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
            </SheetContent>
        </Sheet>
    );
};
