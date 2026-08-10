import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { X } from 'lucide-react';

import { useNavigateWithTransition } from '@chatic/shared';
import { useCloudSessionCatalog, useMembershipInfo, useSessionSelection } from '@chatic/web-core';
import { useRuntimeProfile } from '@chatic/app-runtime';

import { AppHeader, EmptyState, ProfileAvatar } from '@chatic/web-ui-kit';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { useMyProfile, useScrollRestoration, useUserPermissions } from '../../../hooks';
import { usePreferenceStore } from '../../../stores/usePreferenceStore';
import { DEFAULT_CHANNEL_SORT, placeScopeKey } from '../../../stores/preferenceKeys';
import { usePendingInviteChannel } from '../../../stores/usePendingInviteChannel';
import { BottomNavSpacer } from '../../../ui/components';
import { ROUTES } from '../../../routes/paths';
import { MAX_CHANNELS_PER_PLACE, MAX_PLACES } from '../../../utils';
import { isDevBuild } from '../../../utils/buildEnv';
import { OnboardingModal } from '../../onboarding';
import {
    ChannelList,
    CloudPromoBanner,
    CloudSessionSheet,
    CreateChannelDialog,
    CreatePlaceDialog,
    PlaceList,
    SubscriptionRequiredDialog,
} from '../components';
import { getCloudDisplayName } from '../components/cloud-session';
import { useAddCloudFlow, useHomePlaces, useSwitchPlace } from '../hooks';
import {
    useActiveCloudChannels,
    useCachedCloudNames,
    useChannelUnreads,
    useHomeChannels,
    useInvitedClouds,
    useMyJoins,
} from '../../../hooks';
import { resolveHeaderProfile } from '../lib';
import { useCanceledInviteReconcile } from '../../invite/hooks/useCanceledInviteReconcile';
import { useInviteListRows } from '../../invite/hooks/useInviteListRows';

export const HomePage = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();

    // Profile facts track the cached profile (seeded synchronously from the active session payload,
    // then reactive on cache emits), so a profile edit fans out here without a session refresh.
    const { isGuest } = useRuntimeProfile();
    const permissions = useUserPermissions();
    // useInvitedClouds hides clouds the signed-in account now owns, so an invited cloud that became
    // owned (guest → owner) no longer counts here and is shown only as an owned cloud.
    const { invitedClouds } = useInvitedClouds();
    const { selectedCloudId, selectedSiteId } = useSessionSelection();
    const isDefaultCloud = selectedCloudId === 'default';
    // Connected to an invited cloud → drives the place-type caption.
    const isInvitedCloud = !isDefaultCloud && invitedClouds.some(cloud => cloud.id === selectedCloudId);
    // Place/group-room creation is owner-only and cloud-server-only. A cloud I own is one that is
    // neither the relay (default) nor invited — cloudType is only ever 'invited' | 'owner'. This is
    // UX gating; the server is the final authority. See place-channel-create.md.
    const isCloudOwner = !isDefaultCloud && !isInvitedCloud;
    const canAddPlace = isCloudOwner && permissions.canCreatePlace;

    // Cloud identity for the `cloud` header kind. CloudView has no image field, so AppHeader falls
    // back to a CloudAvatar (name initials) — we only supply the display name here.
    // The active cloud is usually an owned catalog cloud, but an INVITED cloud is not in the catalog
    // (it lives in invitedClouds), so look there too — matched by id or cid. Invited clouds may lack
    // name/email (and even id), so fall back name → id → cid so both the header label and its
    // initials avatar always have something to show instead of a blank "?".
    const { clouds } = useCloudSessionCatalog();
    const activeOwnedCloud = clouds.find(cloud => cloud.id === selectedCloudId);
    const activeInvitedCloud = invitedClouds.find(
        cloud => cloud.id === selectedCloudId || cloud.cid === selectedCloudId
    );
    const activeCloud = activeOwnedCloud ?? activeInvitedCloud;
    // The locally cached name (written first by cloud.update/get) wins over the relay catalog so a
    // just-edited subscription-cloud name shows immediately, before the catalog refetch catches up.
    const cachedCloudNames = useCachedCloudNames();
    const cachedCloudName = selectedCloudId ? cachedCloudNames[selectedCloudId] : undefined;
    const cloudName =
        cachedCloudName ??
        (activeCloud ? getCloudDisplayName(activeCloud) || activeCloud.id || activeInvitedCloud?.cid || '' : '');

    // Subscription tier drives the FREE/PRO plan badge. A guest is always FREE; otherwise PRO when
    // either a valid membership OR at least one activated cloud exists — owning a live cloud (status
    // 'active' in the relay catalog above) already implies paid access. CloudView carries no grade.
    // useMembershipInfo has staleTime: 0 + refetchOnMount: 'always', so right after login/reload
    // `membership` starts out `undefined` while the query is in flight. Without a guard, a
    // membership-only PRO user (no owned cloud yet) would flash FREE for a beat before flipping to
    // PRO once the fetch resolves. While that fetch is pending and we have no cloud-based fallback,
    // leave the tier undecided (`undefined`) instead of guessing FREE: AppHeader already hides its
    // badge when planTier is falsy, and PRO-gated UI below treats "undecided" as PRO-optimistic
    // (not FREE) — the server remains the final authority on any gated action either way.
    const { data: membership, isLoading: isMembershipLoading } = useMembershipInfo();
    const hasActiveCloud = clouds.some(cloud => cloud.status === 'active');
    const isTierUndecided = !isGuest && isMembershipLoading && !hasActiveCloud;
    const planTier: 'free' | 'pro' | undefined = isGuest
        ? 'free'
        : isTierUndecided
          ? undefined
          : membership?.isValid || hasActiveCloud
            ? 'pro'
            : 'free';

    // === Data: place list, active place, channel list, unread ===
    // Relay hides the Place SECTION (a relay cloud always has exactly one place), but these hooks
    // still run in every mode: ChannelList keys off `selectedPlaceId`, and on relay that value only
    // ever comes from useSwitchPlace's auto-select. Dropping them would empty the relay home.
    const { places, isLoading: isPlacesLoading } = useHomePlaces();
    const { selectedPlaceId, switchPlace, isSwitching } = useSwitchPlace(places);

    // Subscribe-a-cloud flow. The switcher sheet's footer button opens the plan picker directly
    // (the user is already deep in cloud management there); the home banner instead sends first-time
    // users to the guide, which explains what a cloud is before asking them to pay.
    const { requestAddCloud, addCloudDialog } = useAddCloudFlow();
    const openCloudGuide = () => navigate(ROUTES.subscription.guide);

    // Promo gate: only clouds the account OWNS count. Being a guest in someone else's cloud does not
    // satisfy "make a cloud of your own", so invited ids are subtracted from the relay catalog — the
    // same set the switcher's "내 클라우드" section lists. The flag is computed here, in an
    // always-mounted host, because the banner must not subscribe to the cloud query itself
    // (see useCloudPromo).
    const invitedCloudIds = new Set(invitedClouds.map(cloud => cloud.id ?? ''));
    const hasOwnedCloud = clouds.some(cloud => !invitedCloudIds.has(cloud.id ?? ''));

    // NOTE: entering a place no longer force-opens a per-place profile setup dialog. The profile is
    // optional at entry; users set it up on their own terms from the place settings hub ('내 프로필').
    // The header still nudges them via resolveHeaderProfile's `setup` state below.
    // Real (creatable) places exclude relay subscription rows (stereo === 'place'); drives the cap.
    const ownedPlaceCount = places.filter(place => place.stereo !== 'place').length;

    const { channels, isLoading: isChannelsLoading } = useHomeChannels(selectedPlaceId);
    // Sent relay invites (ADR-0033 Track B) — 1:1 DM invites only make sense on the default
    // (relay) cloud, since invite.create has no siteId/place concept (unlike a custom cloud's
    // group-channel invites). Gate rendering, not the fetch, to avoid a Track 0 contract change.
    const { invites: sentInvites } = useInviteListRows();
    // Replays the stub era's local-only cancels as real invite.cancel calls, once per mount
    // (ADR-0043 결정 8) — a no-op once the legacy records are drained.
    useCanceledInviteReconcile();
    // Aggregate over the active cloud's FULL channel list (every site) so place dots cover all
    // sites, not just the selected one. Unread derives from each channel head (`chatNo`/`metaNo`)
    // and MY read cursor from the subscribed join list (useMyJoins), not the channel-embedded
    // `$join`. The app-icon badge is owned globally by UnreadBadgeRunner (AppRuntime), not this page.
    const cloudChannels = useActiveCloudChannels();
    const myJoins = useMyJoins(cloudChannels);
    const { byChannel: unreadByChannel, byPlace: unreadByPlace } = useChannelUnreads(cloudChannels, myJoins);

    // Restore the list scroll position when returning from a chat room (the page unmounts on
    // navigation). Restore only once the list content has rendered so the offset isn't clamped
    // against a still-loading (short) list.
    const isListReady = !isPlacesLoading && (!selectedPlaceId || !isChannelsLoading);
    const { containerRef: scrollContainerRef, onScroll: handleListScroll } = useScrollRestoration('home', isListReady);

    // Header identity is the PLACE (site) profile only — HomePage never uses the account/user
    // record. On every cloud (relay included) the header shows the place profile nick/thumbnail;
    // when it's missing we fall through to the setup prompt (never the account name), nudging the
    // user to set up their place profile. A site-profile edit reflects immediately via the observed
    // cache.
    const { profile: myProfile } = useMyProfile();
    const headerProfile = resolveHeaderProfile({
        siteName: myProfile?.nick,
        siteImageUrl: myProfile?.thumbnail,
    });

    const displayName = headerProfile.kind === 'setup' ? t('homePage.setupProfile') : headerProfile.name || '-';
    // Top-right avatar shows the PLACE (site) profile photo only — no account-photo fallback. When
    // the active place has no photo, ProfileAvatar renders its default glyph (기본 아바타).
    const displayImageUrl = myProfile?.thumbnail ?? undefined;

    // The place-settings menu entry needs an active site (its route is keyed by the site id). Works on
    // the default cloud too — relay still supplies `selectedSiteId` — and is disabled only when no site
    // is active, since there'd be no place to configure.
    const hasActivePlace = !!selectedSiteId;

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isPlaceDialogOpen, setIsPlaceDialogOpen] = useState(false);
    const [isCloudSessionOpen, setIsCloudSessionOpen] = useState(false);
    const [isSubscriptionRequiredOpen, setIsSubscriptionRequiredOpen] = useState(false);

    const { isFirstRun, completeOnboarding } = usePreferenceStore();
    // Sort + pins are scoped to cid:sid — a place id is only unique within its cloud, so the same
    // sid in another cloud must not inherit this cloud's settings.
    const placeScope = placeScopeKey(selectedCloudId, selectedSiteId);
    const channelSortMap = usePreferenceStore(s => s.channelSort);
    const channelSortMethod = (placeScope && channelSortMap[placeScope]) || DEFAULT_CHANNEL_SORT;
    // Pinned channels for the active place (client preference, set from the chat-room management
    // screen). Pinned rows float above the chosen sort order.
    const pinnedChannelMap = usePreferenceStore(s => s.pinnedChannels);
    const pinnedChannelIds = useMemo(
        () => new Set(placeScope ? (pinnedChannelMap[placeScope] ?? []) : []),
        [pinnedChannelMap, placeScope]
    );
    const { toast } = useToast();

    // Invite flow tail: the accept pipeline lands here and stashes the invited channel, then we open
    // it straight through. There is NO place-profile gate any more — an invitee who has not set up an
    // in-place profile used to be held on home behind the mandatory setup dialog; now they go directly
    // to the room and can fill the profile in later from the place settings hub.
    // See usePendingInviteChannel / useEnterInvitedChannel.
    const pendingInviteChannelId = usePendingInviteChannel(state => state.channelId);
    const clearPendingInviteChannel = usePendingInviteChannel(state => state.clearPendingChannel);
    // The store id is the only trigger, so there is nothing async left to wait on. Each id is consumed
    // exactly once: clearing re-renders us with `null`, and the ref additionally absorbs a repeated
    // effect run over the same (still captured) id, so we never clear/navigate twice.
    const consumedInviteChannelRef = useRef<string | null>(null);
    useEffect(() => {
        if (!pendingInviteChannelId) return;
        if (consumedInviteChannelRef.current === pendingInviteChannelId) return;
        consumedInviteChannelRef.current = pendingInviteChannelId;
        clearPendingInviteChannel();
        navigate(ROUTES.channels.room(pendingInviteChannelId), { replace: true });
    }, [pendingInviteChannelId, clearPendingInviteChannel, navigate]);

    const handleCreatePlace = () => {
        if (!canAddPlace) {
            toast({ title: t('homePage.cannotCreatePlace'), variant: 'destructive' });
            return;
        }
        // Places are capped per owned cloud; the "+" stays visible and the attempt is toasted.
        // Dev-class builds (VITE_ENV DEV/LOCAL) are uncapped so testers can seed freely.
        if (!isDevBuild() && ownedPlaceCount >= MAX_PLACES) {
            toast({ title: t('homePage.placeLimitReached') });
            return;
        }
        setIsPlaceDialogOpen(true);
    };

    // Group-room creation is limit- and PRO-gated: at the cap → toast; subscribed → the create
    // dialog; otherwise the upsell. Owner gating is upstream (the "+" only shows for owners).
    const handleCreateGroup = () => {
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
    // Relay 1:1 chat creation (ADR-0033 Track B): contact entry → invite.create → SMS handoff.
    const handleCreateOneOnOne = () => navigate(ROUTES.invite.contact);

    // Search is not implemented yet (ADR-0013): the button is a visible placeholder.
    const handleSearch = () => navigate(ROUTES.search.root);

    // Right-side profile → dropdown. The header shows my place profile; the only entry navigates to
    // the place settings hub. Controlled open state so the header's close (X) can dismiss it.
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const profileMenu = (
        <DropdownMenu open={isProfileMenuOpen} onOpenChange={setIsProfileMenuOpen}>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    aria-label={t('homePage.profile', '프로필')}
                    className="flex size-9 items-center justify-center"
                >
                    <ProfileAvatar src={displayImageUrl} size={36} />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
                <div className="flex items-center gap-2 px-2 py-2">
                    <ProfileAvatar src={displayImageUrl} size={32} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{displayName}</span>
                    <button
                        type="button"
                        aria-label={t('homePage.menuClose', '닫기')}
                        onClick={() => setIsProfileMenuOpen(false)}
                        className="flex size-6 shrink-0 items-center justify-center text-muted-foreground"
                    >
                        <X size={18} />
                    </button>
                </div>
                <DropdownMenuItem
                    disabled={!hasActivePlace}
                    onClick={() => selectedSiteId && navigate(ROUTES.place.settings(selectedSiteId))}
                    className="cursor-pointer"
                >
                    {t('homePage.menuPlaceSettings', '플레이스 설정')}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );

    return (
        <div className="flex h-screen flex-col overflow-hidden bg-background">
            <AppHeader
                kind={isDefaultCloud ? 'no-cloud' : 'cloud'}
                name={cloudName}
                planTier={planTier}
                onPlanClick={() => navigate(ROUTES.subscription.root)}
                onSearch={handleSearch}
                searchLabel={t('homePage.search', '검색')}
                // The cloud-switch entry is always available — even a plain guest can open the sheet
                // to reach DoU Home, view invited clouds, or add a cloud (subscribe).
                onSwitcher={() => setIsCloudSessionOpen(true)}
                switcherLabel={t('homePage.switchCloud', '클라우드 전환')}
                avatar={profileMenu}
                profileLabel={t('homePage.profile', '프로필')}
            />

            {/* Place + Chat scroll together under the fixed header (accordion sections). Trailing
                clearance for the floating nav comes from BottomNavSpacer at the end of the content,
                not from padding on this container — see BottomNavSpacer for why. */}
            <div
                ref={scrollContainerRef}
                onScroll={handleListScroll}
                className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-2"
            >
                {/* Relay: no Place section — the single relay place is auto-connected, so the list
                    carries no information. Its slot goes to the cloud upsell instead. The banner
                    owns its own gutter and renders nothing when hidden, so no ghost box remains. */}
                {isDefaultCloud ? (
                    <CloudPromoBanner hasOwnedCloud={hasOwnedCloud} onAddCloud={openCloudGuide} className="pb-2" />
                ) : (
                    <PlaceList
                        places={places}
                        selectedPlaceId={selectedPlaceId}
                        unreadByPlace={unreadByPlace}
                        isLoading={isPlacesLoading}
                        isSwitching={isSwitching}
                        onSelectPlace={switchPlace}
                        onCreatePlace={handleCreatePlace}
                        isInvitedCloud={isInvitedCloud}
                        canAddPlace={canAddPlace}
                    />
                )}

                {selectedPlaceId ? (
                    <ChannelList
                        channels={channels}
                        unreadByChannel={unreadByChannel}
                        joinByChannel={myJoins}
                        sid={selectedPlaceId}
                        isLoading={isChannelsLoading}
                        canCreate={!isChannelsLoading && (isDefaultCloud || isCloudOwner)}
                        isDefaultCloud={isDefaultCloud}
                        isPro={planTier !== 'free'}
                        sortMethod={channelSortMethod}
                        pinnedChannelIds={pinnedChannelIds}
                        onCreateOneOnOne={handleCreateOneOnOne}
                        onCreateGroup={handleCreateGroup}
                        sentInvites={isDefaultCloud ? sentInvites : []}
                        onSelectInvite={inviteId => navigate(ROUTES.invite.waiting(inviteId))}
                    />
                ) : !isPlacesLoading && !isSwitching ? (
                    // No place is active in this cloud (none to auto-select) — guide the user to
                    // connect to a place before a channel list can show.
                    <EmptyState
                        title={t('homePage.noPlaceTitle', '접속한 플레이스가 없어요')}
                        description={t('homePage.noPlaceDescription', '플레이스에 접속해 대화를 시작해보세요')}
                    />
                ) : null}

                <BottomNavSpacer />
            </div>

            <CreateChannelDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} />
            <CreatePlaceDialog open={isPlaceDialogOpen} onOpenChange={setIsPlaceDialogOpen} />
            <CloudSessionSheet
                open={isCloudSessionOpen}
                onOpenChange={setIsCloudSessionOpen}
                onAddCloud={requestAddCloud}
            />
            <SubscriptionRequiredDialog
                open={isSubscriptionRequiredOpen}
                onClose={() => setIsSubscriptionRequiredOpen(false)}
            />
            <OnboardingModal open={isFirstRun} onComplete={completeOnboarding} />
            {addCloudDialog}
        </div>
    );
};
