import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { ArrowLeft } from 'lucide-react';

import { cn } from '@chatic/ui-kit';

import douMark from '../../../../assets/dou-mark.png';
import { LANGUAGE_LABELS, SUPPORTED_LANGUAGES, setLanguage } from '../../../../i18n';
import { radioGroupOptions } from '../../../shared';
import { StepDots } from './StepDots';

interface AuthCardProps {
    title: string;
    subtitle: string;
    children: ReactNode;
    onBack?: () => void;
    live?: boolean;
    progress?: { current: number; total: number };
}

export const AuthCard = ({ title, subtitle, children, onBack, live, progress }: AuthCardProps) => {
    const { t, i18n } = useTranslation();
    const languageProps = radioGroupOptions(SUPPORTED_LANGUAGES, i18n.language, setLanguage);

    return (
        <main className="flex h-full flex-col items-center overflow-y-auto bg-background px-4 py-6">
            <div className="my-auto flex w-full max-w-sm shrink-0 flex-col gap-5 rounded-2xl border border-border bg-card p-8 shadow-raised">
                <div
                    role="radiogroup"
                    aria-label={t('settings.language')}
                    className="-mr-2 -mt-3 flex gap-1 self-end text-caption"
                >
                    {SUPPORTED_LANGUAGES.map(lng => (
                        <button
                            key={lng}
                            type="button"
                            {...languageProps(lng)}
                            className={cn(
                                'focus-ring rounded-md px-2 py-1 transition-colors',
                                i18n.language === lng
                                    ? 'font-semibold text-foreground'
                                    : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            {LANGUAGE_LABELS[lng]}
                        </button>
                    ))}
                </div>
                {onBack && (
                    <button
                        type="button"
                        onClick={onBack}
                        className="focus-ring -ml-1.5 flex items-center gap-1 self-start rounded-md px-1.5 py-1 text-callout font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                        <ArrowLeft size={16} />
                        {t('common.back')}
                    </button>
                )}
                {progress && <StepDots current={progress.current} total={progress.total} />}
                <div className="flex flex-col gap-3">
                    <img src={douMark} alt="" width={48} height={48} className="h-12 w-12 rounded-xl" />
                    <div
                        className="flex flex-col gap-1"
                        aria-live={live ? 'polite' : undefined}
                        aria-atomic={live || undefined}
                    >
                        <h1 className="text-headline font-bold tracking-tight text-foreground">{title}</h1>
                        <p className="text-callout text-muted-foreground">{subtitle}</p>
                    </div>
                </div>
                {children}
            </div>
        </main>
    );
};
