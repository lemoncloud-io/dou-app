import type { ReactNode } from 'react';

import { useWebCoreStore } from '@chatic/web-core';
import { useWebSocketV2Store } from '@chatic/socket';

import { useChannels, useClouds, usePlaces, useSelectedChannelStore, useSelectedPlaceStore } from '../../../shared';

const Row = ({ label, value }: { label: string; value: string | number | boolean | null | undefined }) => (
    <div className="flex flex-col gap-0.5 py-1.5">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="break-all font-mono text-xs text-foreground">{String(value ?? '—')}</span>
    </div>
);

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
        <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-primary">{title}</p>
        <div className="divide-y divide-border">{children}</div>
    </div>
);

/** Dev-only session/state inspector (desktop equivalent of apps/web DebugStatePage). */
export const DebugStatePage = () => {
    const profile = useWebCoreStore(s => s.profile);
    const isAuthenticated = useWebCoreStore(s => s.isAuthenticated);
    const { cloudId, selectedPlaceId, isConnected, isVerified, connectionStatus } = useWebSocketV2Store();
    const { clouds, activeCloudId } = useClouds();
    const { places } = usePlaces();
    const storePlaceId = useSelectedPlaceStore(s => s.selectedPlaceId);
    const selectedChannelId = useSelectedChannelStore(s => s.selectedChannelId);
    const { channels } = useChannels(storePlaceId ?? undefined);

    return (
        <div className="mx-auto w-full max-w-4xl p-6">
            <h1 className="mb-4 text-base font-semibold text-foreground">State</h1>
            <div className="grid gap-4">
                <Section title="Session">
                    <Row label="Authenticated" value={isAuthenticated} />
                    <Row label="UID" value={profile?.uid} />
                    <Row label="Name" value={profile?.$user?.name} />
                    <Row label="Email" value={profile?.$user?.email} />
                </Section>

                <Section title="Socket">
                    <Row label="Verified" value={isVerified} />
                    <Row label="Connected" value={isConnected} />
                    <Row label="Status" value={connectionStatus} />
                    <Row label="Socket cloudId" value={cloudId} />
                    <Row label="Socket placeId" value={selectedPlaceId} />
                </Section>

                <Section title="Selection">
                    <Row label="Active cloudId" value={activeCloudId} />
                    <Row label="Selected placeId" value={storePlaceId} />
                    <Row label="Selected channelId" value={selectedChannelId} />
                </Section>

                <Section title="Counts">
                    <Row label="Clouds" value={clouds.length} />
                    <Row label="Places" value={places.length} />
                    <Row label="Channels (place)" value={channels.length} />
                </Section>
            </div>
        </div>
    );
};
