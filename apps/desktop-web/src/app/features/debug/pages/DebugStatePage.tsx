import type { ReactNode } from 'react';

import { getActiveSessionUser, useSessionAuth, useSessionIdentity, useSessionSelection } from '@chatic/app-runtime';
import { useRuntimeProfile, useRuntimeSocketState } from '@chatic/app-runtime';

import { useChannels, useClouds, usePlaces, useSelectedChannelStore } from '../../../shared';

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
    const { userId } = useSessionIdentity();
    const { userName } = useRuntimeProfile();
    const accountUser = getActiveSessionUser() as { email?: string } | null;
    const { isAuthenticated } = useSessionAuth();
    const { isConnected, isVerified, state } = useRuntimeSocketState();
    const { selectedCloudId, selectedSiteId } = useSessionSelection();
    const { clouds, activeCloudId } = useClouds();
    const { places } = usePlaces();
    const selectedChannelId = useSelectedChannelStore(s => s.selectedChannelId);
    const { channels } = useChannels(selectedSiteId ?? undefined);

    return (
        <div className="mx-auto w-full max-w-4xl p-6">
            <h1 className="mb-4 text-base font-semibold text-foreground">State</h1>
            <div className="grid gap-4">
                <Section title="Session">
                    <Row label="Authenticated" value={isAuthenticated} />
                    <Row label="UID" value={userId} />
                    <Row label="Name" value={userName} />
                    <Row label="Email" value={accountUser?.email} />
                </Section>

                <Section title="Socket">
                    <Row label="Verified" value={isVerified} />
                    <Row label="Connected" value={isConnected} />
                    <Row label="Status" value={state} />
                    <Row label="Session cloudId" value={selectedCloudId} />
                    <Row label="Session siteId" value={selectedSiteId} />
                </Section>

                <Section title="Selection">
                    <Row label="Active cloudId" value={activeCloudId} />
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
