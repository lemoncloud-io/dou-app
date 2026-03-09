import { useTranslation } from 'react-i18next';

import { storeUrls } from '../constants';

export const DownloadSection = (): JSX.Element => {
    const { t } = useTranslation();

    return (
        <section className="relative w-full py-20 sm:py-28 px-6 bg-white overflow-hidden">
            {/* Background glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-[#c4ff00]/8 rounded-full blur-3xl" />

            <div className="relative z-10 max-w-[800px] mx-auto text-center">
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#191d31] mb-4 animate-fade-in-up">
                    {t('download.title')}
                </h2>
                <p className="text-base sm:text-lg text-[#53555b] mb-10 sm:mb-12 animate-fade-in-up animate-delay-100">
                    {t('download.subtitle')}
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-up animate-delay-200">
                    <a
                        href={storeUrls.ios}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group btn-shimmer inline-flex items-center justify-center gap-3
                                   bg-[#191d31] text-white
                                   px-8 py-4 rounded-xl text-base font-semibold
                                   w-full sm:w-auto sm:min-w-[240px]
                                   transition-all duration-300
                                   hover:shadow-lg hover:shadow-[#191d31]/20
                                   hover:-translate-y-0.5 active:translate-y-0"
                    >
                        <AppleIcon />
                        {t('download.appStore')}
                    </a>

                    <a
                        href={storeUrls.android}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group btn-shimmer inline-flex items-center justify-center gap-3
                                   bg-[#c4ff00] text-[#191d31]
                                   px-8 py-4 rounded-xl text-base font-semibold
                                   w-full sm:w-auto sm:min-w-[240px]
                                   transition-all duration-300
                                   hover:shadow-lg hover:shadow-[#c4ff00]/30
                                   hover:-translate-y-0.5 active:translate-y-0"
                    >
                        <PlayStoreIcon />
                        {t('download.googlePlay')}
                    </a>
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
