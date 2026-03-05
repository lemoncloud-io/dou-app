import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Logo } from '@chatic/assets';

export const Header = (): JSX.Element => {
    const { t, i18n } = useTranslation();
    const [isScrolled, setIsScrolled] = useState(false);

    useEffect(() => {
        const scrollContainer = document.querySelector('.overflow-auto');
        if (!scrollContainer) return;

        const handleScroll = () => {
            setIsScrolled(scrollContainer.scrollTop > 50);
        };

        scrollContainer.addEventListener('scroll', handleScroll);
        return () => scrollContainer.removeEventListener('scroll', handleScroll);
    }, []);

    const toggleLanguage = () => {
        const newLang = i18n.language === 'ko' ? 'en' : 'ko';
        i18n.changeLanguage(newLang);
    };

    return (
        <header
            className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
                isScrolled ? 'bg-[#0a0a0f]/95 backdrop-blur-xl border-b border-white/5 shadow-lg' : ''
            }`}
        >
            <div className="max-w-[1440px] mx-auto flex items-center justify-between h-16 px-6 md:px-10">
                <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                    <img src={Logo.logo} alt="DoU" className="h-7 w-7" />
                    <span className="text-[22px] font-bold text-white tracking-tight">DoU</span>
                </Link>
                <nav className="flex items-center gap-4 sm:gap-6">
                    <Link
                        to="/policy/terms"
                        className="hidden sm:block text-[14px] text-white/70 hover:text-white transition-colors"
                    >
                        {t('header.terms')}
                    </Link>
                    <Link
                        to="/policy/privacy"
                        className="hidden sm:block text-[14px] text-white/70 hover:text-white transition-colors"
                    >
                        {t('header.privacy')}
                    </Link>
                    <button
                        onClick={toggleLanguage}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-full transition-all
                                   text-white/80 hover:text-white bg-white/10 hover:bg-white/20 border border-white/10"
                    >
                        <GlobeIcon />
                        {i18n.language === 'ko' ? 'EN' : '한국어'}
                    </button>
                </nav>
            </div>
        </header>
    );
};

const GlobeIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
);
