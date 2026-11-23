import type { ReactNode } from 'react';

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
