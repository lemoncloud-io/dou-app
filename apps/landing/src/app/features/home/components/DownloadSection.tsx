import { storeUrls } from '../constants';

export const DownloadSection = (): JSX.Element => (
    <section className="w-full py-16 sm:py-24 px-6 bg-[#222325]">
        <div className="max-w-[800px] mx-auto text-center">
            <h2 className="text-[28px] sm:text-[36px] xl:text-[40px] font-bold text-white mb-4">지금 시작하세요</h2>
            <p className="text-[16px] sm:text-[18px] text-[#babcc0] mb-10 sm:mb-12">
                DoU와 함께 안전한 대화를 경험해보세요
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <a
                    href={storeUrls.ios}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-3 bg-white text-[#222325] px-8 py-4 rounded-xl text-[16px] font-medium hover:bg-[#f4f5f5] transition-colors min-w-[200px]"
                >
                    <AppleIcon />
                    App Store
                </a>
                <a
                    href={storeUrls.android}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-3 bg-[#c4ff00] text-[#222325] px-8 py-4 rounded-xl text-[16px] font-medium hover:bg-[#b3e600] transition-colors min-w-[200px]"
                >
                    <PlayStoreIcon />
                    Google Play
                </a>
            </div>
        </div>
    </section>
);

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
