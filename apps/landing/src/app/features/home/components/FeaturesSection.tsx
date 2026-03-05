import { useTranslation } from 'react-i18next';

import { FeatureCard } from './FeatureCard';

const featureKeys = ['private', 'safe', 'group', 'memo'] as const;

export const FeaturesSection = (): JSX.Element => {
    const { t } = useTranslation();

    return (
        <section className="w-full py-20 sm:py-28 px-6 bg-[#0a0a0f]">
            <div className="max-w-[1200px] mx-auto">
                <div className="text-center mb-12 sm:mb-16">
                    <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-4 animate-fade-in-up">
                        {t('features.title')}
                    </h2>
                    <p className="text-base sm:text-lg text-white/50 animate-fade-in-up animate-delay-100">
                        {t('features.subtitle')}
                    </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                    {featureKeys.map((key, index) => (
                        <FeatureCard key={key} featureKey={key} index={index} />
                    ))}
                </div>
            </div>
        </section>
    );
};
