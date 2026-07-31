import type { ReactNode } from 'react';

/**
 * The invite screen's branded surface, shared by the accept screen and its loading state.
 *
 * Glassmorphism per Figma 3076-11341, built as three layers so the frosted surfaces read as glass:
 * (1) a blurred organic brand-green (#b0ea10) bloom on a light base, (2) a full-screen "freeze"
 * frost over it, then (3) whatever is passed in floats on top — its own backdrop-blur +
 * translucency frost the green behind into glass.
 */
export const InviteGlassSurface = ({ children }: { children: ReactNode }) => (
    <div className="relative flex h-full w-full max-w-[440px] flex-col overflow-hidden bg-[#eef1e8] dark:bg-[#0c0e0b]">
        <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0"
            style={{
                background:
                    'radial-gradient(115% 72% at 50% 64%, rgba(176,234,16,0.60) 0%, rgba(176,234,16,0.20) 46%, rgba(176,234,16,0) 74%), radial-gradient(78% 52% at 80% 106%, rgba(176,234,16,0.55) 0%, rgba(176,234,16,0) 58%), radial-gradient(68% 44% at 10% 4%, rgba(176,234,16,0.16) 0%, rgba(176,234,16,0) 60%)',
            }}
        />
        <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0 bg-[rgba(255,255,255,0.10)] backdrop-blur-[56px] dark:bg-[rgba(20,20,20,0.24)]"
        />
        {children}
    </div>
);
