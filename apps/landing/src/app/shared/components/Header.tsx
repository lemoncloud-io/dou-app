import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Logo } from '@chatic/assets';
import { useTheme } from '@chatic/theme';

export const Header = (): JSX.Element => {
    const { i18n } = useTranslation();
    const { theme, setTheme } = useTheme();
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

    const toggleTheme = () => {
        setTheme(theme === 'light' ? 'dark' : 'light');
    };

    return (
        <header
            className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled ? 'bg-main-green/95 backdrop-blur-xl shadow-sm' : ''}`}
        >
            <div className="mx-auto flex items-center justify-between h-16 md:h-[72px] px-4 md:px-[62px] xl:px-16">
                <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                    <img src={Logo.logo} alt="DoU" className="hidden md:block h-[55px] w-[58px] object-contain" />
                    <span className="text-[22px] font-bold text-navy tracking-tight">D.U</span>
                </Link>
                <nav className="flex items-center gap-2">
                    {/* Theme Toggle - hidden for now, functionality preserved */}
                    <button
                        onClick={toggleTheme}
                        className="hidden items-center justify-center w-10 h-10 rounded-full transition-all
                                   text-subtitle hover:text-navy border border-subtitle"
                        aria-label="Toggle theme"
                    >
                        {theme === 'light' ? <MoonIcon /> : <SunIcon />}
                    </button>

                    {/* Language Toggle */}
                    <button
                        onClick={toggleLanguage}
                        className="flex items-center gap-1.5 px-[18px] py-3 text-lg font-semibold rounded-full transition-all
                                   text-navy hover:opacity-80 border border-subtitle"
                    >
                        <GlobeIcon />
                        <span className="tracking-[-0.72px]">{i18n.language === 'ko' ? 'KR' : 'EN'}</span>
                        <ChevronDownIcon />
                    </button>
                </nav>
            </div>
        </header>
    );
};

const GlobeIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
);

const ChevronDownIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6 9l6 6 6-6" />
    </svg>
);

const MoonIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
);

const SunIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
);
