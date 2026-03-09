import { useTranslation } from 'react-i18next';

import { Logo } from '@chatic/assets';

import { ChatBubbleIllustration } from './ChatBubbleIllustration';

import type { DeepLinkState } from '../types';

interface DeepLinkUIProps {
    state: DeepLinkState;
    onLaunchApp: () => void;
    onContinueBrowser: () => void;
}

/**
 * Main UI component for the deep link landing page.
 * - Desktop: Dark theme with mobile access instructions
 * - Mobile: White theme with chat illustration and buttons
 */
export const DeepLinkUI = ({ state, onLaunchApp, onContinueBrowser }: DeepLinkUIProps): JSX.Element => {
    const { t } = useTranslation();

    // Desktop UI - light theme with instructions
    if (state === 'desktop') {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen w-full bg-white px-5 text-center">
                <div className="relative z-10 max-w-[400px] w-full flex flex-col items-center">
                    {/* Logo */}
                    <div className="mb-8 w-[120px] h-[120px] flex items-center justify-center flex-shrink-0">
                        <img src={Logo.logo} alt="DoU" className="w-full h-full object-contain rounded-3xl" />
                    </div>

                    {/* Desktop instructions */}
                    <div className="text-[#53555b] leading-relaxed text-base">
                        <p className="mb-4">{t('deeplink.desktop.message')}</p>
                        <p className="text-[#191d31]">
                            <strong>iOS:</strong> {t('deeplink.desktop.ios')}
                        </p>
                        <p className="text-[#191d31]">
                            <strong>Android:</strong> {t('deeplink.desktop.android')}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    // Loading state while launching or redirecting
    if (state === 'launching' || state === 'web-redirecting') {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen w-full bg-white">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-[3px] border-gray-200 border-t-[#b0ea10] rounded-full animate-spin" />
                    <p className="text-[#53555b] text-base font-medium">
                        {state === 'launching' ? t('deeplink.title.launching') : t('deeplink.title.redirecting')}
                    </p>
                </div>
            </div>
        );
    }

    // Mobile UI - white theme with chat illustration
    return (
        <div className="flex flex-col items-center min-h-screen w-full bg-white">
            {/* Main content area - centered vertically */}
            <div className="flex-1 flex flex-col items-center justify-center w-full pt-[44px]">
                <ChatBubbleIllustration />
            </div>

            {/* Bottom button area - fixed at bottom */}
            <div className="w-full max-w-[375px] pb-[42px] pt-5 px-4 flex flex-col gap-[18px] items-center">
                {/* D.U 앱 열기 button */}
                <button
                    onClick={onLaunchApp}
                    className="w-full h-[50px] bg-[#b0ea10] rounded-[100px] flex items-end justify-center gap-1.5 pb-[14px]
                               hover:bg-[#a0d90a] active:bg-[#90c905] transition-colors"
                >
                    {/* D.U Logo */}
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path
                            d="M0.69255 15.786C0.310066 15.786 0 15.476 0 15.0935V0.692506C0 0.310045 0.310065 0 0.692549 0H11.9371C12.3195 0 12.6296 0.310046 12.6296 0.692506V2.4647C12.6296 2.84716 12.9397 3.15721 13.3222 3.15721H15.0945C15.477 3.15721 15.787 3.46725 15.787 3.84972V11.9363C15.787 12.3188 15.477 12.6288 15.0945 12.6288H13.3222C12.9397 12.6288 12.6296 12.9389 12.6296 13.3213V15.0935C12.6296 15.476 12.3195 15.786 11.9371 15.786H0.69255ZM6.31481 11.9363C6.31481 12.3188 6.62487 12.6288 7.00736 12.6288H8.65337C9.03585 12.6288 9.34591 12.3188 9.34591 11.9363V3.84972C9.34591 3.46725 9.03585 3.15721 8.65337 3.15721H7.00736C6.62487 3.15721 6.31481 3.46725 6.31481 3.84972V11.9363Z"
                            fill="#102346"
                        />
                    </svg>
                    <svg xmlns="http://www.w3.org/2000/svg" width="5" height="6" viewBox="0 0 5 6" fill="none">
                        <rect width="4.47066" height="5.36446" rx="2.23533" fill="#102346" />
                    </svg>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path
                            d="M3.84995 15.786C3.46747 15.786 3.1574 15.476 3.1574 15.0935V13.3213C3.1574 12.9389 2.84734 12.6288 2.46485 12.6288H0.692549C0.310065 12.6288 0 12.3188 0 11.9363V0.692508C0 0.310047 0.310065 0 0.692549 0H5.62226C6.00474 0 6.31481 0.310046 6.31481 0.692506V11.9363C6.31481 12.3188 6.62487 12.6288 7.00736 12.6288H8.77966C9.16214 12.6288 9.47221 12.3188 9.47221 11.9363V0.692508C9.47221 0.310047 9.78227 0 10.1648 0H15.0945C15.477 0 15.787 0.310046 15.787 0.692506V11.9363C15.787 12.3188 15.477 12.6288 15.0945 12.6288H13.3222C12.9397 12.6288 12.6296 12.9389 12.6296 13.3213V15.0935C12.6296 15.476 12.3195 15.786 11.9371 15.786H3.84995Z"
                            fill="#102346"
                        />
                    </svg>
                    <span className="text-[#222325] text-lg font-semibold tracking-[0.09px] leading-none">
                        {t('deeplink.button.openApp')}
                    </span>
                </button>

                {/* 웹으로 보기 link */}
                <button
                    onClick={onContinueBrowser}
                    className="text-[#53555b] text-lg font-medium tracking-[0.09px] hover:text-[#222325] transition-colors"
                >
                    {t('deeplink.button.viewInWeb')}
                </button>
            </div>
        </div>
    );
};
