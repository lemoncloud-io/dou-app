import { ChevronLeft } from 'lucide-react';

import { useNavigateWithTransition } from '@chatic/shared';
import { useDeviceInfo } from '@chatic/device-utils';
import { useDynamicProfile, useWebCoreStore, useUserContext, cloudCore } from '@chatic/web-core';
import { useWebSocketV2Store } from '@chatic/socket';
import { useClouds } from '@chatic/users';
import { useChannels, usePlaces } from '@chatic/data';

const Row = ({ label, value }: { label: string; value: string | number | boolean | null | undefined }) => (
    <div className="flex flex-col gap-0.5 py-1.5">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="break-all font-mono text-[12px] text-foreground">{String(value ?? '—')}</span>
    </div>
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="rounded-[18px] bg-card px-4 py-3 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-primary">{title}</p>
        <div className="divide-y divide-border">{children}</div>
    </div>
);

const SubSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="py-2">
        <p className="mb-1 text-[11px] font-semibold text-muted-foreground">{title}</p>
        <div className="divide-y divide-border pl-2">{children}</div>
    </div>
);

export const DebugStatePage = () => {
    const navigate = useNavigateWithTransition();
    const { versionInfo, deviceInfo } = useDeviceInfo();

    const profile = useDynamicProfile();
    const { userType, isGuest, isInvited, isCloudUser } = useUserContext();
    const { isAuthenticated, isInitialized, isOnMobileApp } = useWebCoreStore();
    const selectedCloudId = cloudCore.getSelectedCloudId() ?? 'default';
    const cloudToken = cloudCore.getCloudToken();

    const { cloudId, wssType, isConnected, connectionStatus } = useWebSocketV2Store();

    const { data: cloudsData } = useClouds();
    const { places } = usePlaces();
    const { channels } = useChannels({ placeId: selectedCloudId, detail: true });

    const clouds = cloudsData?.list ?? [];
    const selectedCloud = clouds.find(c => c.id === selectedCloudId);

    return (
        <div className="flex h-full flex-col bg-background pt-safe-top">
            <header className="flex items-center px-[6px]">
                <button onClick={() => navigate(-1)} className="rounded-full p-[9px]">
                    <ChevronLeft size={26} strokeWidth={2} />
                </button>
                <span className="ml-2 text-[14px] font-medium text-muted-foreground">State Info</span>
            </header>

            <div className="flex-1 overflow-y-auto overscroll-none pb-safe-bottom">
                <div className="flex flex-col gap-3 p-4 pb-10">
                    {/* Device */}
                    <Section title="Device">
                        <Row label="Device ID" value={deviceInfo?.deviceId} />
                        <Row label="Platform" value={deviceInfo?.platform} />
                        <Row label="App Version" value={versionInfo?.appVersion} />
                        <Row label="Web Version" value={versionInfo?.webVersion} />
                        <Row label="Build Number" value={deviceInfo?.buildNumber} />
                        <Row label="App Language" value={deviceInfo?.appLanguage} />
                        <Row label="Device Model" value={deviceInfo?.deviceModel} />
                        <Row label="Should Update" value={versionInfo?.shouldUpdate} />
                        <Row label="Latest Version" value={versionInfo?.latestVersion} />
                        <Row label="Is On Mobile App" value={isOnMobileApp} />
                    </Section>

                    {/* WebCore State */}
                    <Section title="WebCore State">
                        <Row label="isInitialized" value={isInitialized} />
                        <Row label="isAuthenticated" value={isAuthenticated} />
                        <Row label="isOnMobileApp" value={isOnMobileApp} />
                        <Row label="isGuest" value={isGuest} />
                        <Row label="isInvited" value={isInvited} />
                        <Row label="isCloudUser" value={isCloudUser} />
                        <Row label="userType" value={userType} />
                    </Section>

                    {/* Profile */}
                    <Section title="Profile">
                        <Row label="uid" value={profile?.uid} />
                        <Row label="sid" value={profile?.sid} />
                        <Row label="gid" value={profile?.gid} />
                        <Row label="identityId" value={profile?.identityId} />
                        <Row label="roles" value={profile?.roles?.join(', ')} />
                        <SubSection title="$user">
                            <Row label="id" value={profile?.$user?.id} />
                            <Row label="name" value={profile?.$user?.name} />
                            <Row label="nick" value={profile?.$user?.nick} />
                            <Row label="email" value={profile?.$user?.email} />
                            <Row label="phone" value={profile?.$user?.phone} />
                            <Row label="photo" value={profile?.$user?.photo} />
                            <Row label="stereo" value={profile?.$user?.stereo} />
                            <Row label="loginId" value={profile?.$user?.loginId} />
                            <Row label="loginType" value={profile?.$user?.loginType} />
                            <Row label="siteId" value={profile?.$user?.siteId} />
                            <Row label="identityId" value={profile?.$user?.identityId} />
                            <Row label="createdAt" value={profile?.$user?.createdAt} />
                            <Row label="updatedAt" value={profile?.$user?.updatedAt} />
                        </SubSection>
                        <SubSection title="$site">
                            <Row label="id" value={profile?.$site?.id} />
                            <Row label="name" value={profile?.$site?.name} />
                            <Row label="stereo" value={profile?.$site?.stereo} />
                            <Row label="ownerId" value={profile?.$site?.ownerId} />
                        </SubSection>
                        <SubSection title="$role">
                            <Row label="id" value={profile?.$role?.id} />
                            <Row label="stereo" value={profile?.$role?.stereo} />
                            <Row label="createdAt" value={profile?.$role?.createdAt} />
                        </SubSection>
                        <SubSection title="$auth">
                            <Row label="id" value={profile?.$auth?.id} />
                            <Row label="createdAt" value={profile?.$auth?.createdAt} />
                        </SubSection>
                        <SubSection title="$membership">
                            <Row label="id" value={profile?.$membership?.id} />
                            <Row label="stereo" value={profile?.$membership?.stereo} />
                            <Row label="createdAt" value={profile?.$membership?.createdAt} />
                        </SubSection>
                    </Section>

                    {/* Cloud Token */}
                    <Section title="Cloud Token">
                        <Row label="id" value={cloudToken?.id} />
                        <Row label="name" value={cloudToken?.name} />
                        <Row label="stereo" value={cloudToken?.stereo} />
                        <Row label="cloudId" value={cloudToken?.cloudId} />
                        <Row label="identityToken" value={cloudToken?.Token?.identityToken} />
                        <Row label="accessToken (first 40)" value={cloudToken?.Token?.accessToken?.slice(0, 40)} />
                    </Section>

                    {/* WebSocket */}
                    <Section title="WebSocket">
                        <Row label="cloudId" value={cloudId} />
                        <Row label="wssType" value={wssType} />
                        <Row label="isConnected" value={isConnected} />
                        <Row label="connectionStatus" value={connectionStatus} />
                    </Section>

                    {/* Selected Cloud */}
                    <Section title={`Selected Cloud`}>
                        <Row label="selectedCloudId" value={selectedCloudId} />
                        <Row label="id" value={selectedCloud?.id} />
                        <Row label="name" value={selectedCloud?.name} />
                        <Row label="nick" value={selectedCloud?.nick} />
                        <Row label="stereo" value={selectedCloud?.stereo} />
                        <Row label="ownerId" value={selectedCloud?.ownerId} />
                        <Row label="createdAt" value={selectedCloud?.createdAt} />
                        <Row label="updatedAt" value={selectedCloud?.updatedAt} />
                    </Section>

                    {/* Clouds */}
                    <Section title={`Clouds (${clouds.length})`}>
                        {clouds.length === 0 ? (
                            <Row label="—" value="No clouds" />
                        ) : (
                            clouds.map(c => (
                                <SubSection key={c.id} title={c.name ?? c.id ?? '-'}>
                                    <Row label="id" value={c.id} />
                                    <Row label="stereo" value={c.stereo} />
                                    <Row label="ownerId" value={c.ownerId} />
                                    <Row label="createdAt" value={c.createdAt} />
                                    <Row label="updatedAt" value={c.updatedAt} />
                                </SubSection>
                            ))
                        )}
                    </Section>

                    {/* Places */}
                    <Section title={`Places (${places.length})`}>
                        {places.length === 0 ? (
                            <Row label="—" value="No places" />
                        ) : (
                            places.map(p => (
                                <SubSection key={p.id} title={p.name ?? p.id ?? '-'}>
                                    <Row label="id" value={p.id} />
                                    <Row label="stereo" value={p.stereo} />
                                    <Row label="ownerId" value={p.ownerId} />
                                    <Row label="createdAt" value={p.createdAt} />
                                    <Row label="updatedAt" value={p.updatedAt} />
                                </SubSection>
                            ))
                        )}
                    </Section>

                    {/* Channels */}
                    <Section title={`Channels (${channels.length}) — placeId: ${selectedCloudId}`}>
                        {channels.length === 0 ? (
                            <Row label="—" value="No channels" />
                        ) : (
                            channels.map(c => (
                                <SubSection key={c.id} title={c.name ?? c.id ?? '-'}>
                                    <Row label="id" value={c.id} />
                                    <Row label="stereo" value={c.stereo} />
                                    <Row label="ownerId" value={c.ownerId} />
                                    <Row label="memberCount" value={c.memberCount} />
                                    <Row label="chatNo" value={c.chatNo} />
                                    <Row label="unreadCount" value={c.unreadCount} />
                                    <Row label="isOwner" value={c.isOwner} />
                                    <Row label="isSelfChat" value={c.isSelfChat} />
                                    <Row label="lastChat content" value={c.lastChat$?.content} />
                                    <Row label="lastChat createdAt" value={c.lastChat$?.createdAt} />
                                    <Row label="createdAt" value={c.createdAt} />
                                    <Row label="updatedAt" value={c.updatedAt} />
                                </SubSection>
                            ))
                        )}
                    </Section>
                </div>
            </div>
        </div>
    );
};
