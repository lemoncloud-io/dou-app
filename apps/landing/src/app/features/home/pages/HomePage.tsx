import { type JSX } from 'react';

import { CTASection, FeaturesSection, Footer, Header, HeroSection } from '../components';

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
