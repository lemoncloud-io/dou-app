import { useTranslation } from 'react-i18next';

import { Logo } from '@chatic/assets';

import { APP_CONFIG } from '../constants';
import type { DeepLinkState, DeviceType } from '../types';

interface DeepLinkUIProps {
    state: DeepLinkState;
    deviceType: DeviceType;
    onLaunchApp: () => void;
    webError?: string | null;
}

export const DeepLinkUI = ({ state, deviceType, onLaunchApp, webError }: DeepLinkUIProps): JSX.Element => {
    const { t } = useTranslation();

    const storeUrl = deviceType === 'ios' ? APP_CONFIG.storeUrls.ios : APP_CONFIG.storeUrls.android;
    const storeName = deviceType === 'ios' ? 'App Store' : 'Play Store';

    return (
        <div className="flex flex-col items-center justify-center min-h-screen w-full bg-[#0a0a0f] px-5 text-center">
            <div className="relative z-10 max-w-[400px] w-full flex flex-col items-center">
                {/* Logo */}
                <div className="mb-8 w-[120px] h-[120px] flex items-center justify-center flex-shrink-0">
                    <img src={Logo.logo} alt={APP_CONFIG.name} className="w-full h-full object-contain rounded-3xl" />
                </div>

                {/* Content based on state */}
                {state === 'initial' && <InitialContent t={t} onLaunchApp={onLaunchApp} />}
                {state === 'launching' && <LaunchingContent t={t} />}
                {state === 'store' && <StoreContent t={t} storeUrl={storeUrl} storeName={storeName} />}
                {state === 'desktop' && <DesktopContent t={t} webError={webError} />}
                {state === 'web-redirecting' && <WebRedirectingContent t={t} />}
            </div>
        </div>
    );
};

interface ContentProps {
    t: (key: string) => string;
}

const InitialContent = ({ t, onLaunchApp }: ContentProps & { onLaunchApp: () => void }): JSX.Element => (
    <>
        <div className="mb-12 flex-shrink-0">
            <h1 className="text-2xl font-bold text-white mb-6 leading-tight tracking-tight">
                {t('deeplink.title.openApp')}
            </h1>
            <p className="text-base text-white/60 mb-2 leading-relaxed">{t('deeplink.subtitle.checkInstall')}</p>
            <p className="text-base text-white/60 leading-relaxed">{t('deeplink.subtitle.pressButton')}</p>
        </div>
        <button
            onClick={onLaunchApp}
            className="bg-[#c4ff00] text-[#0a0a0f] text-base font-semibold py-4 px-8 rounded-xl cursor-pointer
                       min-w-[280px] shadow-lg shadow-[#c4ff00]/20 transition-all duration-200
                       hover:bg-[#b3e600] hover:-translate-y-0.5 hover:shadow-xl hover:shadow-[#c4ff00]/30
                       active:translate-y-0"
        >
            {t('deeplink.button.openInApp')}
        </button>
    </>
);

const LaunchingContent = ({ t }: ContentProps): JSX.Element => (
    <>
        <div className="mb-12 flex-shrink-0">
            <h1 className="text-2xl font-bold text-white mb-6 leading-tight tracking-tight">
                {t('deeplink.title.launching')}
            </h1>
        </div>
        <div className="w-10 h-10 border-[3px] border-white/20 border-t-[#c4ff00] rounded-full animate-spin" />
    </>
);

const StoreContent = ({
    t,
    storeUrl,
    storeName,
}: ContentProps & { storeUrl: string; storeName: string }): JSX.Element => (
    <>
        <div className="mb-12 flex-shrink-0">
            <h1 className="text-2xl font-bold text-white mb-6 leading-tight tracking-tight">
                {t('deeplink.title.download')}
            </h1>
            <p className="text-base text-white/60 mb-2 leading-relaxed">{t('deeplink.subtitle.notInstalled')}</p>
            <p className="text-base text-white/60 leading-relaxed">{t('deeplink.subtitle.downloadFromStore')}</p>
        </div>
        <a
            href={storeUrl}
            className="bg-[#c4ff00] text-[#0a0a0f] text-base font-semibold py-4 px-8 rounded-xl cursor-pointer
                       min-w-[280px] shadow-lg shadow-[#c4ff00]/20 transition-all duration-200 inline-block
                       hover:bg-[#b3e600] hover:-translate-y-0.5 hover:shadow-xl hover:shadow-[#c4ff00]/30
                       active:translate-y-0 no-underline"
        >
            {t('deeplink.button.downloadFrom', { store: storeName })}
        </a>
    </>
);

const DesktopContent = ({ t, webError }: ContentProps & { webError?: string | null }): JSX.Element => (
    <div className="text-white/60 leading-relaxed text-base">
        {webError ? (
            <>
                <p className="mb-4 text-red-400">{webError}</p>
                <p className="mb-4">{t('deeplink.desktop.fallback')}</p>
            </>
        ) : (
            <p className="mb-4">{t('deeplink.desktop.message')}</p>
        )}
        <p className="text-white">
            <strong>iOS:</strong> {t('deeplink.desktop.ios')}
        </p>
        <p className="text-white">
            <strong>Android:</strong> {t('deeplink.desktop.android')}
        </p>
    </div>
);

const WebRedirectingContent = ({ t }: ContentProps): JSX.Element => (
    <>
        <div className="mb-12 flex-shrink-0">
            <h1 className="text-2xl font-bold text-white mb-6 leading-tight tracking-tight">
                {t('deeplink.title.redirecting')}
            </h1>
            <p className="text-base text-white/60 leading-relaxed">{t('deeplink.subtitle.pleaseWait')}</p>
        </div>
        <div className="w-10 h-10 border-[3px] border-white/20 border-t-[#c4ff00] rounded-full animate-spin" />
    </>
);
