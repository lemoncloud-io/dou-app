import {
    BentoSection,
    ClosingSection,
    HeroSection,
    ManifestoSection,
    PlansSection,
    PlatformsSection,
    ScenesSection,
    SiteNav,
    StepsSection,
} from '../components';

/**
 * Attention, interest, desire, action, in that order: the hero, the feature grid and statement, the
 * pinned how-it-works with the platforms and circles it serves, then the plans and the download.
 * The page scrolls the window itself (not an inner container) because every ScrollTrigger on it
 * measures against the viewport.
 */
export const HomePage = () => {
    return (
        <div className="min-h-full w-full max-w-full overflow-x-clip bg-cream font-sans text-ink">
            <SiteNav />
            <main className="w-full max-w-full overflow-x-clip">
                <HeroSection />
                <BentoSection />
                <ManifestoSection />
                <StepsSection />
                <PlatformsSection />
                <ScenesSection />
                <PlansSection />
            </main>
            <ClosingSection />
        </div>
    );
};
