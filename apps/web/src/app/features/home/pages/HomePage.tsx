import { ArrowLeftRight, Bell, Bug, ChevronDown, CircleAlert, EllipsisVertical, Search, User } from 'lucide-react';

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { useOnboardingStore, useDynamicProfile, useUserContext, UserType, cloudCore } from '@chatic/web-core';
import { useWebSocketV2Store } from '@chatic/socket';
import { useLogout } from '@chatic/auth';

import { useCanCreateChannel } from '../../../shared/hooks/useCanCreateChannel';
import { useCanCreatePlace } from '../../../shared/hooks/useCanCreatePlace';
import { usePlaces } from '../../../shared/hooks/usePlaces';
import { useChannels } from '../../../shared/hooks/useChannels';
import { useCloudSession } from '../../../shared/hooks/useCloudSession';
import { BottomNavigation } from '../../../shared/components/BottomNavigation';
import { CloudLogo } from '../../../shared/components/CloudLogo';
import { LimitExceededDialog } from '../../../shared/components/LimitExceededDialog';
import { SettingsDialog } from '../../../components/SettingsDialog';
import { OnboardingModal } from '../../onboarding';
import { SearchModal } from '../../search';
import { ReportIssueDialog } from '../../../shared/components/ReportIssueDialog';
import { ChannelList } from '../components/ChannelList';
import { CloudSessionSheet } from '../components/CloudSessionSheet';
import { CreateChannelDialog } from '../components/CreateChannelDialog';
import { CreatePlaceDialog } from '../components/CreatePlaceDialog';
import { PlaceList } from '../components/PlaceList';

const IS_LOCAL = import.meta.env.VITE_ENV === 'LOCAL';
const IS_DEV = import.meta.env.VITE_ENV !== 'PROD';

export const HomePage = () => {
    const { t } = useTranslation();
    const profile = useDynamicProfile();
    const { userType } = useUserContext();

    const isInvited = userType === UserType.INVITED || userType === UserType.INVITED_WITH_CLOUD;
    const { mutate: logout } = useLogout();
    const navigate = useNavigateWithTransition();

    // === 데이터: 단일 소스 — usePlaces/useChannels를 한 번만 호출 ===
    const placesResult = usePlaces();
    const selectedPlaceId = useWebSocketV2Store(s => s.selectedPlaceId);
    const storeCloudId = useWebSocketV2Store(s => s.cloudId);
    const wssType = useWebSocketV2Store(s => s.wssType);
    const isVerified = useWebSocketV2Store(s => s.isVerified);
    const channelsResult = useChannels({ sid: selectedPlaceId || '', detail: true });

    // 파생 데이터
    const {
        canCreate: _canCreateChannel,
        isDefaultCloud,
        isLimitReached: isChannelLimitReached,
        isLoading: isChannelsLoading,
        currentCount: channelCount,
        maxCount: maxChannels,
        isMyCloud: isMyCloudForChannel,
    } = useCanCreateChannel({ count: channelsResult.channels.length, isLoading: channelsResult.isLoading });
    const {
        isLimitReached: isPlaceLimitReached,
        isLoading: isPlacesLoading,
        maxCount: maxPlaces,
        isMyCloud,
    } = useCanCreatePlace({ count: placesResult.places.length, isLoading: placesResult.isLoading });
    const { isCompleted, completeOnboarding } = useOnboardingStore();
    const { isCloudsError } = useCloudSession();

    const totalUnread = useMemo(
        () => channelsResult.channels.reduce((sum, ch) => sum + ((ch.unreadCount as number) ?? 0), 0),
        [channelsResult.channels]
    );

    const displayName = profile?.$user?.name ?? '-';
    const displayImageUrl = profile?.$user?.photo;
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isPlaceDialogOpen, setIsPlaceDialogOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isCloudSessionOpen, setIsCloudSessionOpen] = useState(false);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isReportIssueOpen, setIsReportIssueOpen] = useState(false);
    const [isDebugOpen, setIsDebugOpen] = useState(false);
    const [limitDialogType, setLimitDialogType] = useState<'place' | 'channel' | null>(null);

    const handleLogout = () => {
        logout();
    };

    const { toast } = useToast();

    const handleComplete = () => {
        toast({ title: t('homePage.roomCreated') });
    };

    const handleCreatePlace = () => {
        if (!isMyCloud) {
            toast({ title: t('homePage.cannotCreatePlace'), variant: 'destructive' });
            return;
        }
        if (isPlaceLimitReached) {
            setLimitDialogType('place');
        } else {
            setIsPlaceDialogOpen(true);
        }
    };

    const handleCreateChannel = () => {
        if (isChannelLimitReached) {
            setLimitDialogType('channel');
        } else {
            setIsDialogOpen(true);
        }
    };

    return (
        <div className="flex h-screen flex-col overflow-hidden bg-background pb-[98px] pt-4">
            {/* Header */}
            <header className="flex items-center justify-between px-5 pb-3 pt-safe-top">
                {userType === UserType.TEMP_ACCOUNT || userType === UserType.INVITED ? (
                    <CloudLogo />
                ) : IS_LOCAL ? (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className="flex items-center gap-[9px]">
                                <div className="flex h-[46px] w-[46px] items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
                                    {displayImageUrl ? (
                                        <img
                                            src={displayImageUrl}
                                            alt="Profile"
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        <User size={20} className="text-muted-foreground" />
                                    )}
                                </div>
                                <div className="flex items-center gap-1">
                                    <span className="max-w-[100px] truncate text-[17px] font-semibold tracking-[-0.025em] text-foreground">
                                        {displayName}
                                    </span>
                                    <ChevronDown size={18} className="text-muted-foreground" />
                                </div>
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-48">
                            <DropdownMenuItem onClick={() => setIsSettingsOpen(true)} className="cursor-pointer">
                                <span>{t('home.settings')}</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : (
                    <button
                        onClick={() => navigate(isDefaultCloud ? '/mypage/edit' : '/mypage/cloud-profile')}
                        className="flex items-center gap-[9px]"
                    >
                        <div className="flex h-[46px] w-[46px] items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
                            {displayImageUrl ? (
                                <img src={displayImageUrl} alt="Profile" className="h-full w-full object-cover" />
                            ) : (
                                <User size={20} className="text-muted-foreground" />
                            )}
                        </div>
                        <span className="max-w-[100px] truncate text-[17px] font-semibold tracking-[-0.025em] text-foreground">
                            {displayName}
                        </span>
                    </button>
                )}
                <div className="flex items-center gap-4">
                    {userType !== UserType.TEMP_ACCOUNT && (
                        <button onClick={() => setIsCloudSessionOpen(true)} className="p-1">
                            <ArrowLeftRight size={22} className="text-foreground" />
                        </button>
                    )}
                    <button onClick={() => setIsSearchOpen(true)} className="p-1">
                        <Search size={22} className="text-foreground" />
                    </button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className="p-1">
                                <EllipsisVertical size={22} className="text-foreground" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => navigate('/notifications')} className="cursor-pointer">
                                <Bell size={16} className="mr-2" />
                                <span>{t('home.notifications')}</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setIsReportIssueOpen(true)} className="cursor-pointer">
                                <CircleAlert size={16} className="mr-2" />
                                <span>{t('home.reportIssue')}</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </header>

            {/* Cloud Error Banner */}
            {userType !== UserType.TEMP_ACCOUNT && isCloudsError && (
                <button
                    onClick={() => setIsCloudSessionOpen(true)}
                    className="mx-5 mb-2 rounded-lg bg-destructive/10 px-4 py-2.5 text-left text-sm text-destructive"
                >
                    {t('homePage.noCloudsError')}
                </button>
            )}

            {/* Place List */}
            <section className="pb-4 pt-2">
                <PlaceList
                    places={placesResult.places}
                    isLoading={placesResult.isLoading}
                    isError={placesResult.isError}
                    onRefreshPlaces={placesResult.refresh}
                    onNavigateToOrder={() => navigate('/places/order')}
                    onCreatePlace={handleCreatePlace}
                    isGuest={userType === UserType.TEMP_ACCOUNT}
                />
            </section>

            <div className="mx-4 h-[3px] bg-border" />

            {/* Chat List */}
            <section className="flex min-h-0 flex-1 flex-col px-4 pt-[18px]">
                {selectedPlaceId ? (
                    <ChannelList
                        channels={channelsResult.channels}
                        isLoading={channelsResult.isLoading}
                        isSyncing={channelsResult.isSyncing}
                        isError={channelsResult.isError}
                        errorMessage={channelsResult.errorMessage}
                        onRefreshChannels={channelsResult.refresh}
                        showCreateButton={!isChannelsLoading && (isMyCloud || (isDefaultCloud && channelCount === 0))}
                        onCreateChannel={handleCreateChannel}
                        channelLimit={maxChannels}
                    />
                ) : null}
            </section>

            <CreateChannelDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} onComplete={handleComplete} />
            <CreatePlaceDialog open={isPlaceDialogOpen} onOpenChange={setIsPlaceDialogOpen} />
            <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
            <CloudSessionSheet open={isCloudSessionOpen} onOpenChange={setIsCloudSessionOpen} />
            <OnboardingModal open={!isCompleted} onComplete={completeOnboarding} />
            {isSearchOpen && <SearchModal open={isSearchOpen} onClose={() => setIsSearchOpen(false)} />}
            <ReportIssueDialog open={isReportIssueOpen} onOpenChange={setIsReportIssueOpen} />
            <LimitExceededDialog
                open={limitDialogType !== null}
                onOpenChange={open => !open && setLimitDialogType(null)}
                type={limitDialogType ?? 'place'}
                maxCount={limitDialogType === 'channel' ? maxChannels : maxPlaces}
            />
            {IS_DEV && (
                <>
                    <button
                        onClick={() => setIsDebugOpen(true)}
                        className="fixed bottom-[110px] right-4 z-50 flex h-8 w-8 items-center justify-center rounded-full bg-muted/80 text-muted-foreground shadow-md backdrop-blur-sm active:bg-muted"
                    >
                        <Bug size={14} />
                    </button>
                    <Dialog open={isDebugOpen} onOpenChange={setIsDebugOpen}>
                        <DialogContent className="max-h-[80vh] overflow-y-auto">
                            <DialogTitle>Debug Info</DialogTitle>
                            <DialogDescription className="sr-only">Development debug information</DialogDescription>
                            <div className="space-y-4 font-mono text-[12px] leading-[1.6] text-muted-foreground">
                                {/* Session */}
                                <div>
                                    <div className="mb-1 font-sans text-[13px] font-semibold text-foreground">
                                        Session
                                    </div>
                                    <div>
                                        cloudId(store):{' '}
                                        <span className="font-semibold text-foreground">
                                            {storeCloudId || '(null)'}
                                        </span>
                                    </div>
                                    <div>
                                        cloudId(core):{' '}
                                        <span
                                            className={`font-semibold ${cloudCore.getSelectedCloudId() !== storeCloudId ? 'text-destructive' : 'text-foreground'}`}
                                        >
                                            {cloudCore.getSelectedCloudId() || '(null)'}
                                        </span>
                                    </div>
                                    <div>
                                        wssType:{' '}
                                        <span className="font-semibold text-foreground">{wssType || '(null)'}</span>
                                    </div>
                                    <div>
                                        isVerified:{' '}
                                        <span
                                            className={`font-semibold ${isVerified ? 'text-foreground' : 'text-destructive'}`}
                                        >
                                            {String(isVerified)}
                                        </span>
                                    </div>
                                </div>
                                {/* Place */}
                                <div>
                                    <div className="mb-1 font-sans text-[13px] font-semibold text-foreground">
                                        Place ({placesResult.places.length})
                                    </div>
                                    <div>
                                        selectedPlaceId(store):{' '}
                                        <span className="font-semibold text-foreground">
                                            {selectedPlaceId || '(null)'}
                                        </span>
                                    </div>
                                    <div>
                                        selectedPlaceId(core):{' '}
                                        <span
                                            className={`font-semibold ${cloudCore.getSelectedPlaceId() !== selectedPlaceId ? 'text-destructive' : 'text-foreground'}`}
                                        >
                                            {cloudCore.getSelectedPlaceId() || '(null)'}
                                        </span>
                                    </div>
                                    {placesResult.places.map(p => {
                                        const cid = (p as unknown as { cid?: string }).cid;
                                        const mismatch = cid && storeCloudId && cid !== storeCloudId;
                                        return (
                                            <div
                                                key={p.id}
                                                className={`pl-2 ${mismatch ? 'font-semibold text-destructive' : ''}`}
                                            >
                                                {mismatch ? '[X] ' : ''}id={p.id} name={p.name} cid={cid || '?'}
                                            </div>
                                        );
                                    })}
                                </div>
                                {/* Channel */}
                                <div>
                                    <div className="mb-1 font-sans text-[13px] font-semibold text-foreground">
                                        Channel ({channelsResult.channels.length})
                                    </div>
                                    <div>
                                        sid(param):{' '}
                                        <span className="font-semibold text-foreground">
                                            {selectedPlaceId || '(empty)'}
                                        </span>
                                    </div>
                                    <div>
                                        isLoading:{' '}
                                        <span
                                            className={`font-semibold ${channelsResult.isLoading ? 'text-yellow-600' : 'text-foreground'}`}
                                        >
                                            {String(channelsResult.isLoading)}
                                        </span>
                                    </div>
                                    <div>
                                        isError:{' '}
                                        <span
                                            className={`font-semibold ${channelsResult.isError ? 'text-destructive' : 'text-foreground'}`}
                                        >
                                            {String(channelsResult.isError)}
                                            {channelsResult.errorMessage ? ` (${channelsResult.errorMessage})` : ''}
                                        </span>
                                    </div>
                                    <div>
                                        cacheKey:{' '}
                                        <span className="font-semibold text-foreground">
                                            {channelsResult.debugInfo?.cacheKey || '(none)'}
                                        </span>
                                    </div>
                                    <div>
                                        cacheHit:{' '}
                                        <span className="font-semibold text-foreground">
                                            {String(channelsResult.debugInfo?.cacheHit)}
                                        </span>
                                    </div>
                                    <div className="mt-1 text-[11px] opacity-70">--- fetch ---</div>
                                    <div>
                                        fetchCount:{' '}
                                        <span className="font-semibold text-foreground">
                                            {channelsResult.debugInfo?.fetchCount}
                                        </span>
                                    </div>
                                    <div>
                                        lastFetchAt:{' '}
                                        <span className="font-semibold text-foreground">
                                            {channelsResult.debugInfo?.lastFetchAt?.split('T')[1] ?? '(never)'}
                                        </span>
                                    </div>
                                    <div>
                                        lastFetchResult:{' '}
                                        <span
                                            className={`font-semibold ${channelsResult.debugInfo?.lastFetchResultCount === 0 ? 'text-yellow-600' : 'text-foreground'}`}
                                        >
                                            {channelsResult.debugInfo?.lastFetchResultCount ?? '(none)'}
                                        </span>
                                    </div>
                                    <div className="mt-1 text-[11px] opacity-70">--- subscribe ---</div>
                                    <div>
                                        subscribeCount:{' '}
                                        <span className="font-semibold text-foreground">
                                            {channelsResult.debugInfo?.subscribeCount}
                                        </span>
                                    </div>
                                    <div>
                                        lastSubscribeAt:{' '}
                                        <span className="font-semibold text-foreground">
                                            {channelsResult.debugInfo?.lastSubscribeAt?.split('T')[1] ?? '(never)'}
                                        </span>
                                    </div>
                                    <div>
                                        lastSubscribeResult:{' '}
                                        <span
                                            className={`font-semibold ${channelsResult.debugInfo?.lastSubscribeResultCount === 0 ? 'text-yellow-600' : 'text-foreground'}`}
                                        >
                                            {channelsResult.debugInfo?.lastSubscribeResultCount ?? '(none)'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </DialogContent>
                    </Dialog>
                </>
            )}
            <BottomNavigation totalUnread={totalUnread} />
        </div>
    );
};
