import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@chatic/ui-kit/components/ui/sheet';

import type { LanguagePreference } from '../../../../i18n/languagePreference';
import { useLanguagePreference } from '../hooks/useLanguagePreference';

interface LanguageSelectSheetProps {
    isOpen: boolean;
    onClose: () => void;
}

// A language names itself in its own script, so it can be found whatever the screen is showing now.
// `system` is the one row that has to be translated.
const LANGUAGE_LABELS: Record<Exclude<LanguagePreference, 'system'>, string> = {
    ko: '한국어',
    en: 'English',
};

const OPTIONS: readonly LanguagePreference[] = ['system', 'ko', 'en'];

export const LanguageSelectSheet = ({ isOpen, onClose }: LanguageSelectSheetProps) => {
    const { t } = useTranslation();
    const { preference, setPreference } = useLanguagePreference();

    const handleLanguageChange = (next: LanguagePreference) => {
        setPreference(next);
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
                    {OPTIONS.map(option => (
                        <button
                            key={option}
                            onClick={() => handleLanguageChange(option)}
                            className={cn(
                                'flex w-full items-center justify-between rounded-lg px-3 py-4 transition-colors',
                                preference === option ? 'bg-accent/10' : 'active:bg-muted'
                            )}
                        >
                            <span className="text-[15px] text-foreground">
                                {option === 'system' ? t('mypage.language.system') : LANGUAGE_LABELS[option]}
                            </span>
                            {preference === option && <Check size={20} className="text-primary" />}
                        </button>
                    ))}
                </div>
            </SheetContent>
        </Sheet>
    );
};
