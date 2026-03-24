import { useTranslation } from 'react-i18next';

import { AppleIcon, PlayStoreIcon, StoreButton, Toast } from '../../../shared/components';
import { useToast } from '../../../shared/hooks';
import { storeUrls } from '../constants';
import { ChatBubbleIllustration } from './ChatBubbleIllustration';

export const HeroSection = (): JSX.Element => {
    const { t } = useTranslation();
    const toast = useToast();

    return (
        <section className="relative w-full min-h-screen bg-main-green overflow-hidden">
            <div
                className="mx-auto flex flex-col md:flex-row items-center justify-center
                           gap-[58px] md:gap-12 xl:gap-12
                           px-4 md:px-[62px] xl:px-[240px]
                           pt-16 md:pt-0 pb-0 md:pb-0 min-h-screen"
            >
                {/* Text content */}
                <div className="flex-1 text-center md:text-left pb-[66px] md:pb-0 animate-fade-in-up">
                    <div className="flex flex-col gap-[45px] md:gap-12 items-center md:items-start">
                        <div className="flex flex-col gap-2 md:gap-[14px] w-full">
                            <h1
                                className="font-heading font-bold text-navy tracking-[-0.8px] md:tracking-[-1.3px] xl:tracking-[-1.6px]
                                           text-[32px] md:text-[52px] xl:text-[64px] leading-[1.1]"
                            >
                                {t('hero.title')}
                            </h1>
                            <p
                                className="text-subtitle tracking-[-0.27px] md:tracking-[-0.36px]
                                          text-lg md:text-2xl leading-[1.23]"
                            >
                                {t('hero.subtitle')}
                            </p>
                        </div>

                        {/* Desktop illustration (inside text flow on mobile) */}
                        <div className="md:hidden w-full">
                            <ChatBubbleIllustration />
                        </div>

                        {/* Desktop store buttons */}
                        <div className="hidden md:flex flex-wrap items-center gap-3 justify-start animate-fade-in-up animate-delay-200">
                            <StoreButton onClick={toast.show} icon={<AppleIcon />} label={t('hero.appStore')} />
                            <StoreButton
                                href={storeUrls.android}
                                icon={<PlayStoreIcon />}
                                label={t('hero.googlePlay')}
                            />
                        </div>
                    </div>
                </div>

                {/* Desktop/Tablet illustration */}
                <div className="hidden md:block md:w-[426px] xl:w-[696px] flex-shrink-0 animate-fade-in-up animate-delay-100">
                    <ChatBubbleIllustration />
                </div>
            </div>

            {/* Mobile bottom buttons - absolute within hero, not fixed */}
            <div className="md:hidden absolute bottom-0 left-0 right-0 z-40 px-4 pb-[44px]">
                <div className="flex gap-[10px]">
                    <StoreButton onClick={toast.show} icon={<AppleIcon />} label={t('hero.appStore')} fullWidth />
                    <StoreButton
                        href={storeUrls.android}
                        icon={<PlayStoreIcon />}
                        label={t('hero.googlePlay')}
                        fullWidth
                    />
                </div>
            </div>

            <Toast key={toast.toastKey} message={t('common.comingSoon')} visible={toast.visible} onClose={toast.hide} />
        </section>
    );
};
