import { ChevronDown, ExternalLink, Github, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getMobileAppInfo, postMessage } from '@chatic/app-messages';

import { PageHeader } from '../../../shared/components';

const GITHUB_URL = 'https://github.com/lemoncloud-io/dou-app';

interface LicenseEntry {
    name: string;
    version: string;
    identifier: string;
    text: string;
}

const OpenSourceHero = () => {
    const { t } = useTranslation();

    const handleGithubClick = () => {
        const { isOnMobileApp } = getMobileAppInfo();
        if (isOnMobileApp) {
            postMessage({ type: 'OpenURL', data: { url: GITHUB_URL } });
        } else {
            window.open(GITHUB_URL, '_blank');
        }
    };

    return (
        <div className="mx-4 rounded-[18px] bg-card px-5 py-6 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none">
            <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground/10">
                    <Github size={20} className="text-foreground" />
                </div>
                <div className="flex flex-col gap-0.5">
                    <h2 className="text-[16px] font-semibold text-foreground">{t('mypage.policy.openSourceHero')}</h2>
                    <p className="text-[13px] text-muted-foreground">{t('mypage.policy.openSourceDescription')}</p>
                </div>
            </div>
            <button
                onClick={handleGithubClick}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-foreground/5 py-2.5 text-[14px] font-medium text-foreground transition-colors active:bg-foreground/10"
            >
                {t('mypage.policy.viewOnGithub')}
                <ExternalLink size={14} />
            </button>
        </div>
    );
};

const LicenseItem = ({ entry }: { entry: LicenseEntry }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="border-b border-border last:border-b-0">
            <button
                onClick={() => setIsOpen(prev => !prev)}
                className="flex w-full items-center justify-between px-4 py-3"
            >
                <div className="flex items-baseline gap-2 text-left">
                    <span className="text-[14px] font-medium text-foreground">{entry.name}</span>
                    <span className="text-[12px] text-muted-foreground">{entry.identifier}</span>
                </div>
                <ChevronDown
                    size={16}
                    className={`shrink-0 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
            </button>
            {isOpen && (
                <div className="px-4 pb-3">
                    <pre className="max-h-[200px] overflow-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-[11px] leading-relaxed text-muted-foreground">
                        {entry.text}
                    </pre>
                </div>
            )}
        </div>
    );
};

export const LicensesPage = () => {
    const { t } = useTranslation();
    const [licenses, setLicenses] = useState<LicenseEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchLicenses = async () => {
            try {
                const res = await fetch('/licenses.json');
                if (!res.ok) return;
                const data: LicenseEntry[] = await res.json();
                setLicenses(data);
            } catch {
                // dev 환경에서 빌드 산출물이 없을 수 있음
            } finally {
                setIsLoading(false);
            }
        };
        fetchLicenses();
    }, []);

    return (
        <div className="flex h-full flex-col bg-background pt-safe-top">
            <PageHeader title={t('mypage.policy.licenses')} />

            <div className="flex-1 overflow-y-auto pb-8">
                {/* Open Source Hero */}
                <div className="pt-4">
                    <OpenSourceHero />
                </div>

                {/* License List */}
                <div className="px-4 pt-6">
                    <p className="mb-3 px-1 text-[13px] text-muted-foreground">
                        {t('mypage.policy.licensesDescription')}
                    </p>
                    <div className="rounded-[18px] bg-card shadow-[0px_2px_12px_0px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 size={20} className="animate-spin text-muted-foreground" />
                            </div>
                        ) : licenses.length === 0 ? (
                            <p className="py-12 text-center text-[13px] text-muted-foreground">
                                {t('mypage.policy.licensesEmpty')}
                            </p>
                        ) : (
                            licenses.map(entry => <LicenseItem key={`${entry.name}@${entry.version}`} entry={entry} />)
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
