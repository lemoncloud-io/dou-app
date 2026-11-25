import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Loader2, X } from 'lucide-react';

import { useNavigateWithTransition } from '@chatic/shared';
import { runtime } from '@chatic/runtime-react';
import { cn } from '@chatic/ui-kit';
import { useCloudSessionCatalog } from '../../../hooks/useCloudCatalog';
import { useJoinedCloudIds } from '../../../hooks/useJoinedCloudIds';
import { useMembershipInfo } from '../../../hooks/useMembership';

import {
    AppHeader,
    EmptyState,
    IconChevronRight,
    ProfileAvatar,
    PullToRefresh,
    SegmentedTabs,
    SubscriptionBadge,
    SubscriptionBadgeSkeleton,
} from '@chatic/web-ui-kit';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import {
    useActiveCloudData,
    useChannelSort,
    useMenuNavigate,
    useMyProfile,
    useOnboarding,
    useScopedNotifications,
    useScrollChrome,
    useScrollRestoration,
    useUserPermissions,
} from '../../../hooks';
import { useFindMeSheetRequest } from '../../../stores/useFindMeSheetRequest';
import { findMe } from '../../../utils/notifications';
import { useCloudSelfChannels } from '../../channels/hooks';
import { channelKindOf, isInCloudSelfSection } from '../../channels/lib';
import { placeScopeKey, usePinnedChannels } from '@chatic/shared';
import { DEFAULT_CHANNEL_SORT } from '../../../stores/preferenceKeys';
import { BottomNavSpacer } from '../../../ui/components';
import { ROUTES } from '../../../routes/paths';
import { MAX_CHANNELS_PER_PLACE, MAX_PLACES } from '../../../utils';
import { isDevBuild } from '../../../utils/buildEnv';
import { OnboardingModal } from '../../onboarding';
import {
    ChannelCreateMenu,
    ChannelList,
    CloudPromoBanner,
    CloudSessionSheet,
    CreateChannelDialog,
    CreatePlaceDialog,
    PlaceChipRow,
    PlaceLimitDialog,
    PlaceProfileBanner,
    SubscriptionRequiredDialog,
} from '../components';
import { getCloudDisplayName } from '../components/cloud-session';
import { requestBackgroundRefresh } from '../../../runtime/backgroundRefresh';
import { haptics } from '../../../bridge/haptics';
import { divergenceReporter } from '../../../runtime/logging/divergenceReporter';
import { useAddCloudFlow, usePlaceProfileNudge, useSwitchPlace } from '../hooks';
import {
    useActiveCloudPlaces,
    useCachedCloudNames,
    useHomeChannels,
    useInvitedClouds,
    useJoinSyncRegistration,
    useOtherCloudUnread,
    usePlaceInviteExperiment,
} from '../../../hooks';
import { useCloudPushMarkStore } from '../stores/useCloudPushMarkStore';
import { useHomeChatTabStore, type HomeChatTab } from '../stores/useHomeChatTabStore';
import { RELAY_CLOUD_ID } from '../utils/resolvePushCloudId';
import { resolveHeaderProfile } from '../lib';
import { useInviteListRows } from '../../invite/hooks/useInviteListRows';
import { resolvePlaceInviteGate } from '../../../utils/placeInviteGate';

const TABS_PIN_TOP = -8;

export const HomePage = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const navigateFromMenu = useMenuNavigate();

    const { isGuest } = runtime.session.useRuntimeProfile();
    const permissions = useUserPermissions();
    const { invitedClouds } = useInvitedClouds();
    const { selectedCloudId, selectedSiteId } = runtime.session.useSessionSelection();
    const isDefaultCloud = selectedCloudId === 'default';
    const { channels: cloudSelfChannels, isLoading: isCloudSelfLoading } = useCloudSelfChannels();
    const isInvitedCloud = !isDefaultCloud && invitedClouds.some(cloud => cloud.id === selectedCloudId);
    const isCloudOwner = !isDefaultCloud && !isInvitedCloud;
    const canAddPlace = isCloudOwner && permissions.canCreatePlace;

    const { clouds, isPendingClouds, hasCloudCatalog, refetchClouds } = useCloudSessionCatalog();
    const activeOwnedCloud = clouds.find(cloud => cloud.id === selectedCloudId);
    const activeInvitedCloud = invitedClouds.find(
        cloud => cloud.id === selectedCloudId || cloud.cid === selectedCloudId
    );
    const activeCloud = activeOwnedCloud ?? activeInvitedCloud;
    const cachedCloudNames = useCachedCloudNames();
    const cachedCloudName = selectedCloudId ? cachedCloudNames[selectedCloudId] : undefined;
    const pairedCloudIds = runtime.session.usePairedCloudIds();
    const pairedCloudNames = runtime.session.usePairedCloudNames();
    const pairedCloudFallback =
        selectedCloudId && pairedCloudIds.includes(selectedCloudId)
            ? pairedCloudNames[selectedCloudId] || t('pairing.cloud.unnamed', { id: selectedCloudId.slice(-6) })
            : '';
    const cloudName =
        cachedCloudName ??
        (activeCloud
            ? getCloudDisplayName(activeCloud) || activeCloud.id || activeInvitedCloud?.cid || ''
            : pairedCloudFallback);
    const isCloudHeaderLoading = !isDefaultCloud && isPendingClouds && !cloudName;

    const catalogCloudName = activeOwnedCloud ? getCloudDisplayName(activeOwnedCloud) : undefined;
    useEffect(() => {
        if (isPendingClouds || !selectedCloudId) return;
        divergenceReporter.cloudName({
            cid: selectedCloudId,
            cachedName: cachedCloudName,
            catalogName: catalogCloudName,
        });
    }, [selectedCloudId, cachedCloudName, catalogCloudName, isPendingClouds]);

    const { data: membership, isLoading: isMembershipLoading, refetch: refetchMembership } = useMembershipInfo();
    const hasActiveCloud = clouds.some(cloud => cloud.status === 'active');
    const isPro = !!membership?.isValid || hasActiveCloud;
    const isTierUndecided = !isGuest && !isPro && (isMembershipLoading || isPendingClouds);
    const planTier: 'free' | 'pro' | undefined = isGuest
        ? 'free'
        : isTierUndecided
          ? undefined
          : isPro
            ? 'pro'
            : 'free';

    const { places, isLoading: isPlacesLoading } = useActiveCloudPlaces();
    const { selectedPlaceId, switchPlace, isSwitching } = useSwitchPlace(places, isPlacesLoading);

    const { requestAddCloud } = useAddCloudFlow();
    const openCloudGuide = () => navigate(ROUTES.subscription.guide);

    const invitedCloudIds = new Set(invitedClouds.map(cloud => cloud.id ?? ''));
    const hasOwnedCloud = clouds.some(cloud => !invitedCloudIds.has(cloud.id ?? ''));

    const ownedPlaceCount = places.filter(place => place.stereo !== 'place').length;

    const { channels, isLoading: isChannelsLoading } = useHomeChannels(selectedPlaceId);
    const isChannelSectionLoading = isChannelsLoading || isSwitching;
    const placeRooms = useMemo(() => channels.filter(channel => !isInCloudSelfSection(channel)), [channels]);
    const { placeDms, placeGroups } = useMemo(() => {
        const dms: typeof placeRooms = [];
        const groups: typeof placeRooms = [];
        for (const channel of placeRooms) (channelKindOf(channel.stereo) === 'group' ? groups : dms).push(channel);
        return { placeDms: dms, placeGroups: groups };
    }, [placeRooms]);
    const dmSectionRooms = useMemo(() => [...cloudSelfChannels, ...placeDms], [cloudSelfChannels, placeDms]);
    const storedChatTab = useHomeChatTabStore(state => state.tab);
    const chatTab: HomeChatTab = isDefaultCloud ? 'all' : storedChatTab;
    const setChatTab = useHomeChatTabStore(state => state.setTab);
    const allRooms = useMemo(() => [...dmSectionRooms, ...placeGroups], [dmSectionRooms, placeGroups]);
    const roomsByTab: Record<HomeChatTab, typeof allRooms> = { all: allRooms, group: placeGroups, dm: dmSectionRooms };
    const findMeCount = findMe(useScopedNotifications()).length;
    const requestFindMeSheet = useFindMeSheetRequest(state => state.request);
    const { invites: sentInvites } = useInviteListRows();
    const { myJoins, unreads } = useActiveCloudData();
    const { byPlace: unreadByPlace } = unreads;
    useJoinSyncRegistration(channels);

    const { byCloud: otherCloudUnread, total: otherCloudUnreadTotal } = useOtherCloudUnread();
    const badgedClouds = useCloudPushMarkStore(s => s.badged);
    const joinedCloudIds = useJoinedCloudIds(clouds, invitedClouds);
    const hasOtherCloudMark = useMemo(() => {
        const catalogIds = new Set<string>([RELAY_CLOUD_ID, ...joinedCloudIds]);
        return Object.keys(badgedClouds).some(id => id !== selectedCloudId && catalogIds.has(id));
    }, [badgedClouds, joinedCloudIds, selectedCloudId]);
    const switcherDot = otherCloudUnreadTotal > 0 || hasOtherCloudMark;

    const isListReady = !isPlacesLoading && (!selectedPlaceId || !isChannelSectionLoading);
    const { containerRef: scrollContainerRef, onScroll: handleListScroll } = useScrollRestoration('home', isListReady);
    const {
        scrolled,
        pinned: tabsPinned,
        anchorRef: tabsAnchorRef,
        track: trackScroll,
    } = useScrollChrome(TABS_PIN_TOP);

    const { isAuthenticated } = runtime.session.useSessionAuth();
    const handleRefresh = () =>
        Promise.allSettled([
            requestBackgroundRefresh(),
            isAuthenticated ? refetchClouds() : undefined,
            refetchMembership(),
        ]);

    const { profile: myProfile } = useMyProfile();
    const headerProfile = resolveHeaderProfile({
        siteName: myProfile?.nick,
        siteImageUrl: myProfile?.thumbnail,
    });

    const displayName = headerProfile.kind === 'setup' ? t('homePage.setupProfile') : headerProfile.name || '-';
    const displayImageUrl = myProfile?.thumbnail ?? undefined;

    const profileNudge = usePlaceProfileNudge({ nick: myProfile?.nick });

    const hasActivePlace = !!selectedSiteId;
    const { isEnabled: isPlaceInviteEnabled } = usePlaceInviteExperiment();
    const placeInviteGate = resolvePlaceInviteGate({
        isExperimentEnabled: isPlaceInviteEnabled,
        isDefaultCloud,
        isGuest,
        place: places.find(place => place.id === selectedSiteId),
        sessionSiteId: selectedSiteId,
        isSwitching: isSwitching || selectedPlaceId !== selectedSiteId,
    });

    const menuTier = isDefaultCloud ? 'free' : planTier;

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isPlaceDialogOpen, setIsPlaceDialogOpen] = useState(false);
    const [isCloudSessionOpen, setIsCloudSessionOpen] = useState(false);
    const [isSubscriptionRequiredOpen, setIsSubscriptionRequiredOpen] = useState(false);
    const [isPlaceLimitOpen, setIsPlaceLimitOpen] = useState(false);

    const { isFirstRun, completeOnboarding } = useOnboarding();
    const placeScope = placeScopeKey(selectedCloudId, selectedSiteId);
    const { channelSort: channelSortMap } = useChannelSort();
    const channelSortMethod = (placeScope && channelSortMap[placeScope]) || DEFAULT_CHANNEL_SORT;
    const { pinnedIds, toggle: togglePinned } = usePinnedChannels(placeScope);
    const pinnedChannelIds = useMemo(() => new Set(pinnedIds), [pinnedIds]);
    const { toast } = useToast();

    useEffect(() => {
        if (!isDialogOpen || hasActivePlace) return;
        setIsDialogOpen(false);
        toast({ title: t('homePage.selectPlaceFirst') });
    }, [isDialogOpen, hasActivePlace, toast, t]);

    const handleCreatePlace = () => {
        if (!canAddPlace) {
            toast({ title: t('homePage.cannotCreatePlace'), variant: 'destructive' });
            return;
        }
        if (!isDevBuild() && ownedPlaceCount >= MAX_PLACES) {
            setIsPlaceLimitOpen(true);
            return;
        }
        setIsPlaceDialogOpen(true);
    };

    const handleCreateGroup = () => {
        if (!hasActivePlace) {
            toast({ title: t('homePage.selectPlaceFirst') });
            return;
        }
        if (!isDevBuild() && channels.length >= MAX_CHANNELS_PER_PLACE) {
            toast({ title: t('homePage.channelLimitReached') });
            return;
        }
        if (planTier !== 'free') {
            setIsDialogOpen(true);
        } else {
            setIsSubscriptionRequiredOpen(true);
        }
    };
    const handleCreateOneOnOne = () => navigateFromMenu(ROUTES.invite.contact);
    const canStartCloudDm =
        !isDefaultCloud &&
        hasActivePlace &&
        !!selectedPlaceId &&
        selectedPlaceId === selectedSiteId &&
        !isChannelSectionLoading;
    const handleStartCloudDm = () => navigate(ROUTES.channels.startDm);

    const handleSearch = () => navigate(ROUTES.search.root);

    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const profileMenu = (
        <DropdownMenu open={isProfileMenuOpen} onOpenChange={setIsProfileMenuOpen}>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    aria-label={t('homePage.profile')}
                    className="flex size-9 items-center justify-center"
                >
                    <ProfileAvatar src={displayImageUrl} size={36} />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-full max-w-[281px] rounded-2xl p-0 pb-2.5 pt-2">
                <div className="flex items-center gap-3 px-4 py-2">
                    <ProfileAvatar src={displayImageUrl} size={42} />
                    <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{displayName}</span>
                    <button
                        type="button"
                        aria-label={t('homePage.menuClose')}
                        onClick={() => setIsProfileMenuOpen(false)}
                        className="flex size-[18px] shrink-0 items-center justify-center text-foreground"
                    >
                        <X size={18} />
                    </button>
                </div>
                <DropdownMenuItem
                    disabled={!hasActivePlace}
                    onClick={() => selectedSiteId && navigateFromMenu(ROUTES.place.settings(selectedSiteId))}
                    className="cursor-pointer px-4 py-2 text-base font-semibold"
                >
                    {t('homePage.menuPlaceSettings')}
                </DropdownMenuItem>
                {placeInviteGate !== 'hidden' && (
                    <DropdownMenuItem
                        disabled={placeInviteGate === 'disabled'}
                        onClick={() => selectedSiteId && navigateFromMenu(ROUTES.invite.place(selectedSiteId))}
                        className="cursor-pointer px-4 py-2 text-base font-semibold"
                    >
                        {t('homePage.menuPlaceInvite')}
                    </DropdownMenuItem>
                )}
                <div className="flex items-center px-4 py-1.5">
                    {menuTier ? (
                        <SubscriptionBadge tier={menuTier} size="xs" />
                    ) : (
                        <SubscriptionBadgeSkeleton size="xs" />
                    )}
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );

    const noPlaceBody =
        !isPlacesLoading && !isSwitching ? (
            <EmptyState title={t('homePage.noPlaceTitle')} description={t('homePage.noPlaceDescription')} />
        ) : (
            <div role="status" className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-description">
                <Loader2 aria-hidden className="size-7 animate-spin" />
                <p className="text-sm">{t('homePage.loadingCloud')}</p>
            </div>
        );
    const homeBanners = (
        <>
            <PlaceProfileBanner
                visible={profileNudge.isVisible}
                onDismiss={profileNudge.dismiss}
                onSaved={profileNudge.markPresent}
                className="py-2"
            />
            {isDefaultCloud && hasCloudCatalog && !profileNudge.isVisible && (
                <CloudPromoBanner hasOwnedCloud={hasOwnedCloud} onAddCloud={openCloudGuide} className="py-2" />
            )}
        </>
    );
    const hasChatTabs = !!selectedPlaceId || cloudSelfChannels.length > 0;
    const tabCount = (rooms: readonly unknown[]): number | undefined =>
        isChannelSectionLoading || isCloudSelfLoading ? undefined : rooms.length;

    return (
        <div className="flex h-screen flex-col overflow-hidden bg-background">
            <AppHeader
                kind={isDefaultCloud ? 'no-cloud' : 'cloud'}
                name={cloudName}
                loading={isCloudHeaderLoading}
                loadingLabel={t('homePage.loadingCloud')}
                onSearch={handleSearch}
                searchLabel={t('homePage.search')}
                onSwitcher={() => setIsCloudSessionOpen(true)}
                switcherDot={switcherDot}
                switcherLabel={t('homePage.switchCloud')}
                avatar={profileMenu}
                profileLabel={t('homePage.profile')}
                className={cn(
                    'border-b transition-colors duration-200 motion-reduce:transition-none',
                    scrolled && !tabsPinned ? 'border-input-border' : 'border-transparent'
                )}
            />

            <PullToRefresh
                ref={scrollContainerRef}
                onScroll={event => {
                    handleListScroll();
                    trackScroll(event.currentTarget);
                }}
                onRefresh={handleRefresh}
                onTick={() => haptics.play('selection')}
                onFill={() => haptics.play('impact')}
                refreshingLabel={t('homePage.refreshing')}
                className="min-h-0 flex-1 overflow-y-auto"
                contentClassName="flex flex-col pt-2"
            >
                {!isDefaultCloud && (
                    <PlaceChipRow
                        places={places}
                        selectedPlaceId={selectedPlaceId}
                        unreadByPlace={unreadByPlace}
                        isLoading={isPlacesLoading}
                        isSwitching={isSwitching}
                        onSelectPlace={switchPlace}
                        onCreatePlace={handleCreatePlace}
                        canAddPlace={canAddPlace}
                    />
                )}

                {!hasChatTabs && homeBanners}
                {!selectedPlaceId && noPlaceBody}
                {hasChatTabs && (
                    <>
                        <div ref={tabsAnchorRef} aria-hidden />
                        <SegmentedTabs
                            className="sticky top-[-8px] z-10 bg-background"
                            variant="inline"
                            items={
                                isDefaultCloud
                                    ? [{ id: 'all', label: t('homePage.tabs.chats'), count: tabCount(allRooms) }]
                                    : [
                                          { id: 'all', label: t('homePage.tabs.all'), count: tabCount(allRooms) },
                                          {
                                              id: 'group',
                                              label: t('homePage.tabs.group'),
                                              count: tabCount(placeGroups),
                                          },
                                          { id: 'dm', label: t('homePage.tabs.dm'), count: tabCount(dmSectionRooms) },
                                      ]
                            }
                            value={chatTab}
                            onChange={id => {
                                if (id === chatTab) return;
                                haptics.play('selection');
                                setChatTab(id as HomeChatTab);
                            }}
                            trailing={
                                isDefaultCloud ? (
                                    <ChannelCreateMenu
                                        onCreate={isChannelSectionLoading ? undefined : handleCreateOneOnOne}
                                        createLabel={t('channelList.createDirect')}
                                    />
                                ) : (
                                    <ChannelCreateMenu
                                        showOneOnOneCreate={canStartCloudDm}
                                        onCreateOneOnOne={handleStartCloudDm}
                                        showGroupCreate={!isChannelSectionLoading && isCloudOwner}
                                        onCreateGroup={handleCreateGroup}
                                        isPro={planTier !== 'free'}
                                    />
                                )
                            }
                        />
                        {homeBanners}
                        {findMeCount > 0 && (
                            <button
                                type="button"
                                onClick={() => {
                                    haptics.play('selection');
                                    requestFindMeSheet();
                                }}
                                className="flex w-full items-center gap-1 px-4 py-2.5 text-[13px] font-medium leading-[17px] tracking-[-0.26px] text-point-blue duration-200 animate-in fade-in-0 slide-in-from-top-1 active:opacity-70 motion-reduce:animate-none"
                            >
                                {t('homePage.findMe', { count: findMeCount })}
                                <IconChevronRight aria-hidden className="size-4" />
                            </button>
                        )}
                        <ChannelList
                            bare
                            channels={roomsByTab[chatTab]}
                            leadsWithSelf={chatTab !== 'group'}
                            joinByChannel={myJoins}
                            sid={selectedPlaceId ?? selectedSiteId ?? ''}
                            isLoading={isChannelSectionLoading || isCloudSelfLoading}
                            emptyLabel={
                                chatTab === 'group'
                                    ? t('homePage.groupChatsEmpty')
                                    : chatTab === 'dm'
                                      ? t('cloudDm.section.empty')
                                      : undefined
                            }
                            isInvitedPlace={isInvitedCloud}
                            onOpenPlaceInfo={
                                selectedSiteId ? () => navigate(ROUTES.place.settingsDetail(selectedSiteId)) : undefined
                            }
                            sortMethod={channelSortMethod}
                            pinnedChannelIds={pinnedChannelIds}
                            onTogglePin={togglePinned}
                            sentInvites={isDefaultCloud && chatTab !== 'group' ? sentInvites : []}
                            onSelectInvite={inviteId => navigate(ROUTES.invite.waiting(inviteId))}
                        />
                    </>
                )}

                <BottomNavSpacer />
            </PullToRefresh>

            <CreateChannelDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} />
            <CreatePlaceDialog open={isPlaceDialogOpen} onOpenChange={setIsPlaceDialogOpen} />
            <CloudSessionSheet
                open={isCloudSessionOpen}
                onOpenChange={setIsCloudSessionOpen}
                onAddCloud={requestAddCloud}
                cloudUnread={otherCloudUnread}
            />
            <SubscriptionRequiredDialog
                open={isSubscriptionRequiredOpen}
                onClose={() => setIsSubscriptionRequiredOpen(false)}
            />
            <PlaceLimitDialog
                open={isPlaceLimitOpen}
                onOpenChange={setIsPlaceLimitOpen}
                maxPlaces={MAX_PLACES}
                onManagePlaces={selectedSiteId ? () => navigate(ROUTES.place.settings(selectedSiteId)) : undefined}
                onAddCloud={requestAddCloud}
            />
            <OnboardingModal open={isFirstRun} onComplete={completeOnboarding} />
        </div>
    );
};
