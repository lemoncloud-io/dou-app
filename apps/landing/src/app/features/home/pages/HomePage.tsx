import { Footer, Header } from '../../../shared/components';
import { DownloadSection, FeaturesSection, HeroSection } from '../components';

export const HomePage = (): JSX.Element => {
    return (
        <div
            className="w-full h-full flex flex-col overflow-auto overflow-x-hidden scroll-smooth"
            style={{ WebkitOverflowScrolling: 'touch' }}
        >
            <Header />

            <main className="flex-1 pt-16">
                <HeroSection />
                <FeaturesSection />
                <DownloadSection />
            </main>

            <Footer />
        </div>
    );
};
