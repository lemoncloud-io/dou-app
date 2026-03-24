import { Footer, Header } from '../../../shared/components';
import { CTASection, FeaturesSection, HeroSection } from '../components';

export const HomePage = (): JSX.Element => {
    return (
        <div
            className="w-full h-full flex flex-col overflow-auto overflow-x-hidden scroll-smooth"
            style={{ WebkitOverflowScrolling: 'touch' }}
        >
            <Header />

            <main className="flex-1">
                <HeroSection />
                <FeaturesSection />
                <CTASection />
            </main>

            <Footer />
        </div>
    );
};
