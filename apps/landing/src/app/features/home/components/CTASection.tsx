import { useTranslation } from 'react-i18next';

import { AppleIcon, PlayStoreIcon, StoreButton } from '../../../shared/components';
import { storeUrls } from '../constants';

export const CTASection = (): JSX.Element => {
    const { t } = useTranslation();
    return (
        <section className="w-full bg-main-green">
            <div
                className="max-w-[1440px] mx-auto px-6 md:px-10
                            pt-11 md:pt-[68px] pb-6 md:pb-14 text-center"
            >
                <div>
                    <h2
                        className="font-heading font-bold text-navy
                                   text-2xl md:text-[52px] xl:text-[64px]
                                   tracking-[-0.6px] md:tracking-[-1.3px] xl:tracking-[-1.6px]
                                   leading-[1.1] mb-2.5 md:mb-2.5
                                   animate-fade-in-up"
                    >
                        {t('cta.title1')}
                        <br />
                        {t('cta.title2')}
                    </h2>
                    <p
                        className="text-subtitle text-base md:text-[22px] tracking-[-0.4px] md:tracking-[-0.55px]
                                  mb-6 md:mb-[42px] animate-fade-in-up animate-delay-100"
                    >
                        {t('cta.subtitle')}
                    </p>

                    <div className="flex flex-col md:flex-row items-center justify-center gap-[10px] animate-fade-in-up animate-delay-200">
                        <StoreButton
                            href={storeUrls.ios}
                            icon={<AppleIcon />}
                            label={t('cta.appStore')}
                            width="w-full md:w-[315px]"
                        />
                        <StoreButton
                            href={storeUrls.android}
                            icon={<PlayStoreIcon />}
                            label={t('cta.googlePlay')}
                            width="w-full md:w-[315px]"
                        />
                    </div>
                </div>
            </div>
        </section>
    );
};
