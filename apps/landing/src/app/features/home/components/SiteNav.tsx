import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Menu, X } from 'lucide-react';

import { Logo } from '@chatic/assets';

import { SECTION_IDS, WEB_APP_URL } from '../constants';

export const SiteNav = () => {
    const { t, i18n } = useTranslation();
    const [open, setOpen] = useState(false);

    const links = [
        { id: SECTION_IDS.features, label: t('home.nav.features') },
        { id: SECTION_IDS.how, label: t('home.nav.how') },
        { id: SECTION_IDS.plans, label: t('home.nav.plans') },
    ];

    const switchLanguage = () => i18n.changeLanguage(i18n.resolvedLanguage === 'ko' ? 'en' : 'ko');

    useEffect(() => {
        if (!open) return undefined;
        const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);

    return (
        <header className="fixed inset-x-0 top-4 z-50 px-4">
            <nav className="mx-auto flex h-16 max-w-5xl items-center justify-between rounded-full border border-white/60 bg-white/70 pl-5 pr-2 shadow-[0_12px_40px_-18px_rgba(13,24,48,0.35)] backdrop-blur-xl">
                <a href="#top" aria-label={t('home.nav.home')} className="flex items-center gap-2.5">
                    <img src={Logo.logo} alt="" className="h-9 w-9 object-contain" />
                    <img src={Logo.douBk} alt="DoU" className="h-[18px]" />
                </a>

                <ul className="hidden items-center gap-1 md:flex">
                    {links.map(link => (
                        <li key={link.id}>
                            <a
                                href={`#${link.id}`}
                                className="rounded-full px-4 py-2 text-sm font-medium text-ink/70 transition-colors hover:bg-ink/5 hover:text-ink"
                            >
                                {link.label}
                            </a>
                        </li>
                    ))}
                </ul>

                <div className="flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={switchLanguage}
                        className="hidden rounded-full px-3.5 py-2 text-sm font-medium text-ink/70 transition-colors hover:bg-ink/5 hover:text-ink sm:block"
                    >
                        {t('home.nav.switchLanguage')}
                    </button>
                    <a
                        href={WEB_APP_URL}
                        className="inline-flex h-12 items-center rounded-full bg-ink px-5 text-sm font-semibold text-white transition-colors hover:bg-ink/90"
                    >
                        {t('home.nav.open')}
                    </a>
                    <button
                        type="button"
                        onClick={() => setOpen(value => !value)}
                        aria-expanded={open}
                        aria-controls="site-nav-sheet"
                        aria-label={open ? t('home.nav.close') : t('home.nav.menu')}
                        className="flex h-12 w-12 items-center justify-center rounded-full text-ink transition-colors hover:bg-ink/5 md:hidden"
                    >
                        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                    </button>
                </div>
            </nav>

            {open && (
                <div
                    id="site-nav-sheet"
                    className="mx-auto mt-2 max-w-5xl rounded-[2rem] border border-white/60 bg-white/90 p-3 shadow-[0_24px_60px_-24px_rgba(13,24,48,0.4)] backdrop-blur-xl md:hidden"
                >
                    <ul className="flex flex-col">
                        {links.map(link => (
                            <li key={link.id}>
                                <a
                                    href={`#${link.id}`}
                                    onClick={() => setOpen(false)}
                                    className="block rounded-2xl px-4 py-3.5 font-display text-lg font-medium text-ink hover:bg-ink/5"
                                >
                                    {link.label}
                                </a>
                            </li>
                        ))}
                        <li>
                            <button
                                type="button"
                                onClick={() => {
                                    switchLanguage();
                                    setOpen(false);
                                }}
                                className="block w-full rounded-2xl px-4 py-3.5 text-left text-base font-medium text-ink/60 hover:bg-ink/5"
                            >
                                {t('home.nav.switchLanguage')}
                            </button>
                        </li>
                    </ul>
                </div>
            )}
        </header>
    );
};
