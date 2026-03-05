import { FeatureCard } from './FeatureCard';
import { features } from '../constants';

export const FeaturesSection = (): JSX.Element => (
    <section className="w-full py-16 sm:py-24 px-6 bg-white">
        <div className="max-w-[1200px] mx-auto">
            <h2 className="text-[28px] sm:text-[36px] xl:text-[40px] font-bold text-[#222325] text-center mb-4">
                DoU의 특별한 기능
            </h2>
            <p className="text-[16px] sm:text-[18px] text-[#53555b] text-center mb-12 sm:mb-16">
                프라이버시를 지키며 안전하게 소통하세요
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
                {features.map(feature => (
                    <FeatureCard key={feature.id} feature={feature} />
                ))}
            </div>
        </div>
    </section>
);
