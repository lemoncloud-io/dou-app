import { useTranslation } from 'react-i18next';

import { Logo } from '@chatic/assets';
import { useTheme } from '@chatic/theme';

import { storeUrls } from '../constants';

export const HeroSection = (): JSX.Element => {
    const { t } = useTranslation();
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    return (
        <section className="relative w-full min-h-[calc(100vh-64px)] flex flex-col items-center justify-center px-6 pt-20 pb-24 bg-background overflow-hidden">
            {/* Background Effects */}
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] sm:w-[800px] sm:h-[800px] bg-accent/10 rounded-full blur-3xl animate-pulse-glow" />
            <div className="absolute bottom-0 right-0 w-[400px] h-[400px] sm:w-[500px] sm:h-[500px] bg-blue-500/5 rounded-full blur-3xl" />
            <div className="absolute top-1/3 left-0 w-[300px] h-[300px] bg-purple-500/5 rounded-full blur-3xl" />

            <div className="relative z-10 text-center max-w-[800px]">
                {/* Logo */}
                <div className="mb-6 animate-fade-in">
                    <img src={Logo.logo} alt="DoU" className="h-16 sm:h-20 mx-auto" />
                </div>

                {/* Badge */}
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-full mb-8 animate-fade-in animate-delay-100 shadow-sm">
                    <span className="w-2 h-2 bg-accent rounded-full animate-pulse" />
                    <span className="text-sm text-muted-foreground">{t('hero.badge')}</span>
                </div>

                {/* Title */}
                <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-foreground mb-6 tracking-tight leading-tight animate-fade-in-up">
                    {t('hero.title1')}
                    <br />
                    <span className={isDark ? 'text-gradient' : 'text-gradient-light'}>{t('hero.title2')}</span>
                </h1>

                {/* Subtitle */}
                <p className="text-base sm:text-lg lg:text-xl text-muted-foreground mb-10 sm:mb-12 max-w-[600px] mx-auto leading-relaxed animate-fade-in-up animate-delay-100">
                    {t('hero.subtitle')}
                </p>

                {/* CTA Buttons */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-up animate-delay-200">
                    <a
                        href={storeUrls.ios}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group btn-shimmer inline-flex items-center justify-center gap-3
                                   bg-foreground text-background
                                   px-8 py-4 rounded-xl text-base font-semibold
                                   w-full sm:w-auto sm:min-w-[200px]
                                   transition-all duration-300
                                   hover:shadow-lg hover:shadow-foreground/20
                                   hover:-translate-y-0.5 active:translate-y-0"
                    >
                        <AppleIcon />
                        {t('hero.appStore')}
                        <ArrowIcon />
                    </a>

                    <a
                        href={storeUrls.android}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-3
                                   bg-transparent text-foreground
                                   border border-foreground/20 hover:border-foreground/40
                                   px-8 py-4 rounded-xl text-base font-medium
                                   w-full sm:w-auto sm:min-w-[200px]
                                   transition-all duration-300
                                   hover:bg-foreground/5"
                    >
                        <PlayStoreIcon />
                        {t('hero.googlePlay')}
                    </a>
                </div>
            </div>

            {/* Scroll indicator */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-fade-in animate-delay-500">
                <div className="w-6 h-10 border-2 border-foreground/20 rounded-full flex justify-center pt-2">
                    <div className="w-1 h-2 bg-foreground/40 rounded-full animate-bounce" />
                </div>
            </div>
        </section>
    );
};

const AppleIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
);

const PlayStoreIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 20.5v-17c0-.59.34-1.11.84-1.35L13.69 12l-9.85 9.85c-.5-.24-.84-.76-.84-1.35m13.81-5.38L6.05 21.34l8.49-8.49 2.27 2.27m3.35-4.31c.34.27.56.69.56 1.19s-.22.92-.56 1.19l-2.11 1.24-2.5-2.5 2.5-2.5 2.11 1.38M6.05 2.66l10.76 6.22-2.27 2.27-8.49-8.49z" />
    </svg>
);

const ArrowIcon = () => (
    <svg
        className="w-4 h-4 group-hover:translate-x-1 transition-transform"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
    >
        <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
);
