import type { ReactNode } from 'react';

/**
 * The invite screen's branded surface, shared by the accept screen and its loading state.
 *
 * Glassmorphism per Figma 3076-11341, built as three layers: (1) an organic brand-green (#b0ea10)
 * bloom on a light base, (2) a full-screen "freeze" tint over it, then (3) whatever is passed in
 * floats on top, its translucent fill reading as glass against the green.
 *
 * Nothing the screen opens with uses `backdrop-filter` — not these layers, not the cards or the
 * footer on top of them. Each of those would only ever blur the bloom, a few wide radial gradients
 * already as soft as a blur makes them: side by side on the simulator, with and without, the two
 * screens differ by about 1% per channel. What the blur did cost was on an iOS device, where
 * opening an invite flashed black down the right of the screen. WebKit sizes a freshly mounted
 * backdrop layer on a later composite than the one that paints its box (the glass header works
 * around the same thing), and this screen mounts a full-viewport one twice in a row — the loading
 * surface, then the invitation's.
 */
export const InviteGlassSurface = ({ children }: { children: ReactNode }) => (
    <div className="relative mx-auto flex h-full w-full max-w-app flex-col overflow-hidden bg-[#eef1e8] dark:bg-[#0c0e0b]">
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
            className="pointer-events-none absolute inset-0 z-0 bg-[rgba(255,255,255,0.10)] dark:bg-[rgba(20,20,20,0.24)]"
        />
        {children}
    </div>
);
