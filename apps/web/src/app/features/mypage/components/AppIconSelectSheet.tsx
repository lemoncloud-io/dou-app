import { Check, X, Smartphone, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';

import { cn } from '@chatic/lib/utils';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@chatic/ui-kit/components/ui/sheet';
import type { AppIconOption } from '@chatic/app-messages';

interface AppIconSelectSheetProps {
    isOpen: boolean;
    onClose: () => void;
    currentIcon: string | null;
    availableIcons: AppIconOption[];
    onSelectIcon: (iconId: string | null) => Promise<boolean>;
}

export const AppIconSelectSheet = ({
    isOpen,
    onClose,
    currentIcon,
    availableIcons,
    onSelectIcon,
}: AppIconSelectSheetProps) => {
    const { t } = useTranslation();
    const [isPending, setIsPending] = useState(false);
    const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

    const handleIconChange = async (iconId: string | null) => {
        if (isPending) return;
        setIsPending(true);
        const success = await onSelectIcon(iconId);
        setIsPending(false);
        if (success) {
            onClose();
        }
    };

    const handleImageError = (iconId: string) => {
        setImageErrors(prev => ({ ...prev, [iconId]: true }));
    };

    return (
        <Sheet open={isOpen} onOpenChange={open => !open && !isPending && onClose()}>
            <SheetContent side="bottom" className="rounded-t-2xl p-0 pb-safe-bottom" hideClose>
                <div className="flex min-h-[48px] items-center justify-between border-b border-border px-4 py-3">
                    <SheetTitle className="text-lg font-semibold text-foreground">
                        {t('mypage.appIcon.title')}
                    </SheetTitle>
                    <button onClick={onClose} disabled={isPending} className="p-1">
                        <X size={24} className="text-muted-foreground" />
                    </button>
                </div>
                <SheetDescription className="sr-only">{t('mypage.appIcon.title')}</SheetDescription>
                <div className="px-5 py-2 max-h-[300px] overflow-y-auto">
                    {availableIcons.map(icon => {
                        const isDefaultIcon = icon.id === null || icon.id === 'default';
                        const isCurrent = isDefaultIcon
                            ? currentIcon === null || currentIcon === 'default'
                            : currentIcon === icon.id;

                        const label = (() => {
                            if (isDefaultIcon) return t('mypage.appIcon.default');
                            const translationKey = `mypage.appIcon.${icon.id}`;
                            const translated = t(translationKey);
                            return translated !== translationKey ? translated : icon.label;
                        })();

                        const iconKey = icon.id ?? 'default';
                        const hasError = imageErrors[iconKey];
                        const iconSrc = isDefaultIcon
                            ? '/assets/app-icons/DefaultIcon.png'
                            : `/assets/app-icons/${icon.id}.png`;

                        return (
                            <button
                                key={iconKey}
                                onClick={() => handleIconChange(icon.id)}
                                disabled={isPending}
                                className={cn(
                                    'flex w-full items-center justify-between rounded-lg px-3 py-3 transition-colors',
                                    isCurrent ? 'bg-accent/10' : 'active:bg-muted',
                                    isPending && 'opacity-50 cursor-not-allowed'
                                )}
                            >
                                <div className="flex items-center">
                                    <div
                                        className={cn(
                                            'mr-3 flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border transition-colors',
                                            isCurrent
                                                ? 'border-primary/20 bg-primary/10 text-primary'
                                                : 'border-border bg-muted text-muted-foreground'
                                        )}
                                    >
                                        {!hasError ? (
                                            <img
                                                src={iconSrc}
                                                alt={label}
                                                onError={() => handleImageError(iconKey)}
                                                className="h-full w-full object-cover"
                                            />
                                        ) : isDefaultIcon ? (
                                            <Smartphone size={18} />
                                        ) : (
                                            <Sparkles size={18} />
                                        )}
                                    </div>
                                    <span className="text-[15px] font-medium text-foreground">{label}</span>
                                </div>
                                {isCurrent && <Check size={20} className="text-primary" />}
                            </button>
                        );
                    })}
                </div>
            </SheetContent>
        </Sheet>
    );
};
