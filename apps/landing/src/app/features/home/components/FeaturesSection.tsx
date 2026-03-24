import { useTranslation } from 'react-i18next';

import { Images } from '@chatic/assets';

import { PricingSection } from './PricingSection';

const featureCards = [
    { key: 'private', color: 'bg-feature-orange', imageRight: false },
    { key: 'safe', color: 'bg-feature-blue', imageRight: true },
    { key: 'group', color: 'bg-feature-orange', imageRight: false },
    { key: 'memo', color: 'bg-feature-blue', imageRight: true },
] as const;

const delayClasses = ['animate-delay-100', 'animate-delay-200', 'animate-delay-300', 'animate-delay-400'] as const;

const featureImages = {
    en: [Images.landingEn1, Images.landingEn2, Images.landingEn3, Images.landingEn4],
    ko: [Images.landingKo1, Images.landingKo2, Images.landingKo3, Images.landingKo4],
} as const;

export const FeaturesSection = (): JSX.Element => {
    return (
        <section className="relative w-full feature-gradient-bg overflow-hidden">
            {/* Star texture overlay */}
            <div
                className="absolute inset-0 opacity-[0.28] bg-repeat"
                style={{ backgroundImage: `url(${Images.overlayBackground})` }}
            />

            <div className="relative z-10 px-4 md:px-[62px] xl:px-[240px] py-16 md:py-32 xl:py-[162px]">
                {/* Feature cards */}
                <div className="flex flex-col gap-7 md:gap-[38px] xl:gap-12">
                    {featureCards.map((card, index) => (
                        <FeatureCard
                            key={card.key}
                            featureKey={card.key}
                            color={card.color}
                            imageRight={card.imageRight}
                            delayClass={delayClasses[index]}
                            index={index}
                        />
                    ))}
                </div>

                {/* Pricing sub-section */}
                <PricingSection />
            </div>
        </section>
    );
};

const FeatureCard = ({
    featureKey,
    color,
    imageRight,
    delayClass,
    index,
}: {
    featureKey: string;
    color: string;
    imageRight: boolean;
    delayClass: string;
    index: number;
}): JSX.Element => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language === 'ko' ? 'ko' : 'en';
    const imageSrc = featureImages[lang][index];

    return (
        <div
            className={`glass-card rounded-[42px] md:rounded-[80px] xl:rounded-[112px]
                        p-4 md:p-8 xl:p-8
                        flex flex-col md:flex-row items-stretch gap-4 md:gap-8
                        animate-fade-in-up ${delayClass}`}
        >
            <div
                className={`w-full md:w-[458px] xl:w-[768px] flex-shrink-0
                             h-[311px] md:h-[458px] xl:h-[523px]
                             ${color} rounded-[44px] md:rounded-[62px] xl:rounded-[90px]
                             flex items-center justify-center overflow-hidden
                             ${imageRight ? 'md:order-2' : ''}`}
            >
                <img src={imageSrc} alt={t(`features.${featureKey}.title`)} className="h-full object-contain" />
            </div>

            <div
                className={`flex-1 flex flex-col justify-center px-0 md:px-7 py-4 md:py-0
                             ${imageRight ? 'md:order-1' : ''}`}
            >
                <h3 className="font-heading font-bold text-navy text-[28px] md:text-[38px] tracking-[-0.95px] mb-3 md:mb-4">
                    {t(`features.${featureKey}.title`)}
                </h3>
                <p className="text-desc-alt text-base md:text-lg tracking-[-0.27px] md:tracking-[-0.36px] leading-relaxed">
                    {t(`features.${featureKey}.description`)}
                </p>
            </div>
        </div>
    );
};
