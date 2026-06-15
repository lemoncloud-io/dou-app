import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { useWebCoreStore } from '@chatic/web-core';
import { useWebSocketV2Store } from '@chatic/socket';
import { Button } from '@chatic/ui-kit/components/ui/button';

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
    const { t } = useTranslation();
    const navigate = useNavigate();

    const profile = useWebCoreStore(s => s.profile);
    const isAuthenticated = useWebCoreStore(s => s.isAuthenticated);
    const { cloudId, selectedPlaceId, isConnected, isVerified, connectionStatus } = useWebSocketV2Store();
    const { clouds, activeCloudId } = useClouds();
    const { places } = usePlaces();
    const storePlaceId = useSelectedPlaceStore(s => s.selectedPlaceId);
    const selectedChannelId = useSelectedChannelStore(s => s.selectedChannelId);
    const { channels } = useChannels(storePlaceId ?? undefined);

    return (
        <div className="flex h-screen flex-col bg-background">
            <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-6">
                <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
                    {t('settings.back')}
                </Button>
                <h1 className="text-base font-semibold text-foreground">{t('debug.title')}</h1>
            </header>

            <div className="scrollbar-thin mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 overflow-y-auto p-8">
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

                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => navigate('/debug/chat')}>
                        {t('debug.cacheStream')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => navigate('/debug/badge')}>
                        {t('debug.badge')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => navigate('/debug/sync')}>
                        Sync Verify
                    </Button>
                </div>
            </div>
        </div>
    );
};
