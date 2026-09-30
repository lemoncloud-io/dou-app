import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Loader2, X } from 'lucide-react';

import { useNavigateWithTransition } from '@chatic/shared';
import { runtime } from '@chatic/app-runtime';
import { useCloudSessionCatalog } from '../../../hooks/useCloudCatalog';
import { useJoinedCloudIds } from '../../../hooks/useJoinedCloudIds';
import { useMembershipInfo } from '../../../hooks/useMembership';

import {
    AppHeader,
    EmptyState,
    ProfileAvatar,
    PullToRefresh,
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
    useScrollRestoration,
    useUserPermissions,
} from '../../../hooks';
import { useCloudDmChannels } from '../../channels/hooks';
import { isInCloudDmSection } from '../../channels/lib';
import { placeScopeKey, usePinnedChannels } from '@chatic/shared';
import { DEFAULT_CHANNEL_SORT } from '../../../stores/preferenceKeys';
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
    PlaceLimitDialog,
    PlaceList,
    SubscriptionRequiredDialog,
} from '../components';
import { getCloudDisplayName } from '../components/cloud-session';
import { requestBackgroundRefresh } from '../../../runtime/backgroundRefresh';
import { haptics } from '../../../bridge/haptics';
import { divergenceReporter } from '../../../runtime/logging/divergenceReporter';
import { useAddCloudFlow, useHomePlaces, useHomeSections, useSwitchPlace } from '../hooks';
import {
    useCachedCloudNames,
    useChatSyncRegistration,
    useHomeChannels,
    useInvitedClouds,
    useJoinSyncRegistration,
    useOtherCloudUnread,
} from '../../../hooks';
import { useCloudPushMarkStore } from '../stores/useCloudPushMarkStore';
import { RELAY_CLOUD_ID } from '../utils/resolvePushCloudId';
import { resolveHeaderProfile } from '../lib';
import { useCanceledInviteReconcile } from '../../invite/hooks/useCanceledInviteReconcile';
import { useInviteDismissMigration } from '../../invite/hooks/useInviteDismissMigration';
import { useInviteListRows } from '../../invite/hooks/useInviteListRows';
import { resolvePlaceInviteGate } from '../../../utils/placeInviteGate';

export const HomePage = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    // The same navigate, for the entries that live inside a dropdown: it lets the menu finish
    // leaving before the page transition snapshots the screen, so the menu is not carried off
    // inside the outgoing page. See `hooks/menuDismissal`.
    const navigateFromMenu = useMenuNavigate();

    // Profile facts track the cached profile (seeded synchronously from the active session payload,
    // then reactive on cache emits), so a profile edit fans out here without a session refresh.
    const { isGuest } = runtime.session.useRuntimeProfile();
    const permissions = useUserPermissions();
    // useInvitedClouds hides clouds the signed-in account now owns, so an invited cloud that became
    // owned (guest → owner) no longer counts here and is shown only as an owned cloud.
    const { invitedClouds } = useInvitedClouds();
    const { selectedCloudId, selectedSiteId } = runtime.session.useSessionSelection();
    const isDefaultCloud = selectedCloudId === 'default';
    // Cloud 1:1 rooms belong to the cloud, not a place, so no place list holds them — they get
    // a section of their own below the place's rooms.
    const { channels: cloudDmChannels, isLoading: isCloudDmLoading } = useCloudDmChannels();
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
    const { clouds, isPendingClouds, hasCloudCatalog, refetchClouds } = useCloudSessionCatalog();
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
    // Cold start on a cloud: the catalog has not answered yet AND nothing was cached locally, so
    // there is no name to print. The header shows a pulsing placeholder for that window instead of
    // a blank circle beside blank text — which otherwise reads as a nameless cloud, not a pending
    // fetch. A cached name short-circuits this, so the common (warm) case never flashes a skeleton.
    const isCloudHeaderLoading = !isDefaultCloud && isPendingClouds && !cloudName;

    // Cloud-name divergence (ADR-0099). The two sources above are the reason a renamed cloud can show
    // its new name here and its old one on MY: this header prefers the local cache, MY screens read
    // the relay catalog alone. Compared here because this is the only place that holds both, and only
    // once the catalog has actually answered — while it is pending there is nothing to disagree with.
    const catalogCloudName = activeOwnedCloud ? getCloudDisplayName(activeOwnedCloud) : undefined;
    useEffect(() => {
        if (isPendingClouds || !selectedCloudId) return;
        divergenceReporter.cloudName({
            cid: selectedCloudId,
            cachedName: cachedCloudName,
            catalogName: catalogCloudName,
        });
    }, [selectedCloudId, cachedCloudName, catalogCloudName, isPendingClouds]);

    // Subscription tier drives the FREE/PRO plan badge. A guest is always FREE; otherwise PRO when
    // either a valid membership OR at least one activated cloud exists — owning a live cloud (status
    // 'active' in the relay catalog above) already implies paid access. CloudView carries no grade.
    // useMembershipInfo has staleTime: 0 + refetchOnMount: 'always', so right after login/reload
    // `membership` starts out `undefined` while the query is in flight. Without a guard, a
    // membership-only PRO user (no owned cloud yet) would flash FREE for a beat before flipping to
    // PRO once the fetch resolves. While that fetch is pending and we have no cloud-based fallback,
    // leave the tier undecided (`undefined`) instead of guessing FREE: the header and the profile
    // menu draw a pill-sized placeholder for that window, and PRO-gated UI below treats "undecided"
    // as PRO-optimistic (not FREE) — the server remains the final authority on any gated action
    // either way.
    // FREE needs BOTH sources to have answered, since either one alone can make it PRO. So the
    // cloud catalog still being pending keeps the tier open too: otherwise a membership that comes
    // back invalid first prints FREE until the catalog reveals an active cloud. PRO, by contrast,
    // is final the moment either source says so.
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

    // === Data: place list, active place, channel list, unread ===
    // Relay hides the Place SECTION (a relay cloud always has exactly one place), but these hooks
    // still run in every mode: ChannelList keys off `selectedPlaceId`, and on relay that value only
    // ever comes from useSwitchPlace's auto-select. Dropping them would empty the relay home.
    const { places, isLoading: isPlacesLoading } = useHomePlaces();
    const { selectedPlaceId, switchPlace, isSwitching } = useSwitchPlace(places, isPlacesLoading);

    // Subscribe-a-cloud flow. The switcher sheet's footer button opens the plan picker directly
    // (the user is already deep in cloud management there); the home banner instead sends first-time
    // users to the guide, which explains what a cloud is before asking them to pay.
    const { requestAddCloud } = useAddCloudFlow();
    const openCloudGuide = () => navigate(ROUTES.subscription.guide);

    // Promo gate: only clouds the account OWNS count. Being a guest in someone else's cloud does not
    // satisfy "make a cloud of your own", so invited ids are subtracted from the relay catalog — the
    // same set the switcher's "내 클라우드" section lists. The flag is computed here, in an
    // always-mounted host, because the banner must not subscribe to the cloud query itself
    // (see useCloudPromo).
    const invitedCloudIds = new Set(invitedClouds.map(cloud => cloud.id ?? ''));
    const hasOwnedCloud = clouds.some(cloud => !invitedCloudIds.has(cloud.id ?? ''));

    // NOTE: entering a place no longer force-opens a per-place profile setup dialog. The profile is
    // optional at entry; users set it up on their own terms from the place settings hub ("내 프로필").
    // The header still nudges them via resolveHeaderProfile's `setup` state below.
    // Real (creatable) places exclude relay subscription rows (stereo === 'place'); drives the cap.
    const ownedPlaceCount = places.filter(place => place.stereo !== 'place').length;

    const { channels, isLoading: isChannelsLoading } = useHomeChannels(selectedPlaceId);
    // A place switch is also a channel load: `useHomeChannels` slices the ALREADY-loaded cloud-wide
    // observation by sid, so the moment the switch pre-applies the new sid the slice is empty with
    // isLoading === false. Without folding the switch in, the Chat section would flash its empty
    // state ("채팅방이 없어요") on the way into every place. Skeletons cover the gap instead.
    const isChannelSectionLoading = isChannelsLoading || isSwitching;
    // The place's own rooms. A subscription cloud's notes-to-self room carries a place too, but it
    // belongs to the account and is listed with the 1:1s below. `channels` keeps it for the syncs.
    const placeRooms = useMemo(() => channels.filter(channel => !isInCloudDmSection(channel)), [channels]);
    // Sent relay invites (ADR-0089 Track B) — 1:1 DM invites only make sense on the default
    // (relay) cloud, since invite.create has no siteId/place concept (unlike a custom cloud's
    // group-channel invites). Gate rendering, not the fetch, to avoid a Track 0 contract change.
    const { invites: sentInvites } = useInviteListRows();
    // One-time: folds the stub era's `canceledInviteIds` (localStorage) into cache dismiss stamps
    // (ADR-0052 decision 5) — a no-op once every install has run it.
    useInviteDismissMigration();
    // Replays the stub era's local-only cancels as real invite.cancel calls, once per mount
    // (ADR-0043 decision 8) — a no-op once the legacy records are drained.
    useCanceledInviteReconcile();
    // ONE unread source now (see docs/feature/home/unread-dot.md §Detailed Implementation 2, ADR-0056): the
    // app-wide observation already aggregates the whole cloud, so the per-row counts, the join rows
    // the rows read (nick/mute) and the place dots all come off it — home used to compute the
    // active-site half a second time, from its own observer per channel, purely as a side effect of
    // wanting the join SYNC. `byChannel` / `joinByChannel` are cloud-wide supersets and every
    // consumer looks rows up by channel id, so the extra keys are inert.
    const { myJoins, unreads } = useActiveCloudData();
    const { byPlace: unreadByPlace } = unreads;
    // What actually had to stay scoped to home: registering MY read-cursor sync for the ACTIVE
    // site's channels, so it tears down when home unmounts rather than living app-wide.
    useJoinSyncRegistration(channels);
    // Same shape for messages: the ACTIVE site's channels get a chat sync while home is mounted, so
    // a new message reaches the cache — and therefore the row's preview and the activity order —
    // without waiting for the room to be opened. See useChatSyncRegistration for the two mechanisms.
    useChatSyncRegistration(channels);

    // Cross-cloud dot — one observation shared by the switcher-button dot (below, on AppHeader) and
    // CloudSessionSheet's row dots, so the two surfaces never disagree.
    const { byCloud: otherCloudUnread, total: otherCloudUnreadTotal } = useOtherCloudUnread();
    const badgedClouds = useCloudPushMarkStore(s => s.badged);
    // Catalog filter: only a mark for a cloud actually in THIS account's reach (owned + invited +
    // relay) and not the one being viewed counts toward the dot — a stale/foreign mark otherwise
    // never clears (see docs/feature/home/unread-dot.md, Design Principle 5).
    const joinedCloudIds = useJoinedCloudIds(clouds, invitedClouds);
    const hasOtherCloudMark = useMemo(() => {
        const catalogIds = new Set<string>([RELAY_CLOUD_ID, ...joinedCloudIds]);
        return Object.keys(badgedClouds).some(id => id !== selectedCloudId && catalogIds.has(id));
    }, [badgedClouds, joinedCloudIds, selectedCloudId]);
    const switcherDot = otherCloudUnreadTotal > 0 || hasOtherCloudMark;

    // Restore the list scroll position when returning from a chat room (the page unmounts on
    // navigation). Restore only once the list content has rendered so the offset isn't clamped
    // against a still-loading (short) list.
    const isListReady = !isPlacesLoading && (!selectedPlaceId || !isChannelSectionLoading);
    const { containerRef: scrollContainerRef, onScroll: handleListScroll } = useScrollRestoration('home', isListReady);

    // Pull-to-refresh re-asks everything this screen draws: the background sync's lists (places,
    // channel delta — which carries the cloud 1:1s too — profiles, sent invites, the relay self
    // channel) in one pass, and the two queries behind the header, the cloud catalog and membership.
    // Nothing is fetched by a new path; a pull only runs sooner what the edges and the poll would run
    // anyway. The spinner waits for all of it, and every part is best-effort, so a failure ends the
    // pull like a success does.
    // The catalog query is disabled without a session, and `refetch` ignores that — so it is asked
    // only when the query itself would be.
    const { isAuthenticated } = runtime.session.useSessionAuth();
    const handleRefresh = () =>
        Promise.allSettled([
            requestBackgroundRefresh(),
            isAuthenticated ? refetchClouds() : undefined,
            refetchMembership(),
        ]);

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
    // the active place has no photo, ProfileAvatar renders its default glyph (default avatar).
    const displayImageUrl = myProfile?.thumbnail ?? undefined;

    // The place-settings menu entry needs an active site (its route is keyed by the site id). Works on
    // the default cloud too — relay still supplies `selectedSiteId` — and is disabled only when no site
    // is active, since there'd be no place to configure.
    const hasActivePlace = !!selectedSiteId;
    // "Invite to place" targets the place the session sits on — the server stamps that site, the
    // packet names none — so it is gated on the session's place, and held while a switch is moving
    // it. Hidden, not disabled, for anyone who can never invite here (relay, member, guest).
    const placeInviteGate = resolvePlaceInviteGate({
        isDefaultCloud,
        isGuest,
        place: places.find(place => place.id === selectedSiteId),
        sessionSiteId: selectedSiteId,
        isSwitching: isSwitching || selectedPlaceId !== selectedSiteId,
    });

    // Tier readout for the profile menu (Figma 3108:25868). DoU Home is pinned to FREE: what a
    // subscription buys is a cloud of one's OWN, so the relay stays the free home even for a paying
    // account — only a cloud reads `planTier`. Undecided (membership or catalog still in flight) shows a
    // placeholder of the pill's size, exactly like the header pill.
    const menuTier = isDefaultCloud ? 'free' : planTier;

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isPlaceDialogOpen, setIsPlaceDialogOpen] = useState(false);
    const [isCloudSessionOpen, setIsCloudSessionOpen] = useState(false);
    const [isSubscriptionRequiredOpen, setIsSubscriptionRequiredOpen] = useState(false);
    const [isPlaceLimitOpen, setIsPlaceLimitOpen] = useState(false);

    const { isFirstRun, completeOnboarding } = useOnboarding();
    // Sort + pins are scoped to cid:sid — a place id is only unique within its cloud, so the same
    // sid in another cloud must not inherit this cloud's settings.
    const placeScope = placeScopeKey(selectedCloudId, selectedSiteId);
    const { channelSort: channelSortMap } = useChannelSort();
    const channelSortMethod = (placeScope && channelSortMap[placeScope]) || DEFAULT_CHANNEL_SORT;
    // Pinned channels for the active place (client preference, set from the chat-room management
    // screen or the desktop favorites star). Pinned rows float above the chosen sort order.
    const { pinnedIds, toggle: togglePinned } = usePinnedChannels(placeScope);
    const pinnedChannelIds = useMemo(() => new Set(pinnedIds), [pinnedIds]);
    // Which sections are folded. App-wide, unlike sort and pins: it is about how home is used, so
    // it holds across clouds and places, and survives leaving home and relaunching.
    const homeSections = useHomeSections();
    const { toast } = useToast();

    // The dialog outlives the section that opened it — it is mounted unconditionally — so a place
    // that goes away mid-flow (cloud switch, deleted place, revoked access) would leave a form that
    // submits with no sid. Close it and say why, rather than let it write the room nowhere.
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
        // Places are capped per owned cloud; the "+" stays visible and the attempt opens the cap
        // dialog, which offers both ways out (free a slot / add a cloud) instead of only naming the
        // limit as the old toast did.
        // Dev-class builds (VITE_ENV DEV/LOCAL) are uncapped so testers can seed freely.
        if (!isDevBuild() && ownedPlaceCount >= MAX_PLACES) {
            setIsPlaceLimitOpen(true);
            return;
        }
        setIsPlaceDialogOpen(true);
    };

    // Group-room creation is limit- and PRO-gated: at the cap → toast; subscribed → the create
    // dialog; otherwise the upsell. Owner gating is upstream (the "+" only shows for owners).
    const handleCreateGroup = () => {
        // On relay the entry exists ONLY as an upsell (ChannelList shows it there while unpaid), so
        // it never reaches the create dialog — and the relay place's own channel count must not
        // turn that upsell into a cap toast.
        if (isDefaultCloud) {
            setIsSubscriptionRequiredOpen(true);
            return;
        }
        // A room belongs to the ACTIVE place, and `createChannel` falls back to an empty sid when
        // there is none — which writes a room into a scope no list reads. The Chat section does not
        // render without a selected place, so this is not reachable from the UI today; it is here
        // because the fallback makes "no place" silently succeed instead of failing loudly.
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
    /**
     * Starting a 1:1 is two different acts wearing one menu entry.
     *
     * On relay the only way to reach a person is their phone number, so it goes to the contact
     * form and on to the SMS handoff, exactly as it did (ADR-0089 Track B) — that flow is a
     * non-goal here and is not touched.
     *
     * Inside a cloud there is nothing to invite: the other person is already a member, and the room
     * is opened by naming them. So it goes to the picker instead.
     *
     * `navigateFromMenu`, because this is a dropdown item: the menu is given time to leave before
     * the page transition starts (ADR-0110).
     */
    const handleCreateOneOnOne = () =>
        navigateFromMenu(isDefaultCloud ? ROUTES.invite.contact : ROUTES.channels.startDm);

    // Search is not implemented yet (ADR-0013): the button is a visible placeholder.
    const handleSearch = () => navigate(ROUTES.search.root);

    // Right-side profile → dropdown. The header shows my place profile; the entries are the place
    // settings hub and, for the owner of a cloud place, the place invite. Both act on the active
    // place. Controlled open state so the header's close (X) can dismiss it.
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
            {/* Menu metrics are the design's, not the ui-kit defaults: 281px wide, 16px corners, no
                side gutter (every row carries its own 16px) and 8/10px top/bottom — Figma 3108:25868.
                281 is an upper bound rather than the width, so a screen narrower than the menu gets
                a narrower menu instead of one hanging off the edge. */}
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
                {/* A readout, not a control: the header pill is the one place that routes to
                    subscription, so this stays a non-interactive span outside the menu items. */}
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

    return (
        <div className="flex h-screen flex-col overflow-hidden bg-background">
            <AppHeader
                kind={isDefaultCloud ? 'no-cloud' : 'cloud'}
                name={cloudName}
                planTier={planTier}
                planLoading={isTierUndecided}
                onPlanClick={() => navigate(ROUTES.subscription.root)}
                loading={isCloudHeaderLoading}
                loadingLabel={t('homePage.loadingCloud')}
                onSearch={handleSearch}
                searchLabel={t('homePage.search')}
                // The cloud-switch entry is always available — even a plain guest can open the sheet
                // to reach DoU Home, view invited clouds, or add a cloud (subscribe).
                onSwitcher={() => setIsCloudSessionOpen(true)}
                switcherDot={switcherDot}
                switcherLabel={t('homePage.switchCloud')}
                avatar={profileMenu}
                profileLabel={t('homePage.profile')}
            />

            {/* Place + Chat scroll together under the fixed header (accordion sections). Trailing
                clearance for the floating nav comes from BottomNavSpacer at the end of the content,
                not from padding on this container — see BottomNavSpacer for why. */}
            <PullToRefresh
                ref={scrollContainerRef}
                onScroll={handleListScroll}
                onRefresh={handleRefresh}
                onArm={() => haptics.play('impact')}
                refreshingLabel={t('homePage.refreshing')}
                className="min-h-0 flex-1 overflow-y-auto pt-2"
                contentClassName="flex flex-col"
            >
                {/* Relay: no Place section — the single relay place is auto-connected, so the list
                    carries no information. Its slot goes to the cloud upsell instead. The banner
                    owns its own gutter and renders nothing when hidden, so no ghost box remains.
                    It is off until the catalog has actually answered: before that `clouds` is an
                    empty stand-in that reads as "owns no cloud", so an owner saw the pitch appear
                    on every cold start and vanish a beat later. Hiding is the safe default for a
                    promo — a missed beat costs nothing, a wrong one tells a paying user to go
                    subscribe. */}
                {isDefaultCloud ? (
                    hasCloudCatalog && (
                        <CloudPromoBanner hasOwnedCloud={hasOwnedCloud} onAddCloud={openCloudGuide} className="pb-2" />
                    )
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
                        open={homeSections.isOpen('places')}
                        onOpenChange={open => homeSections.setOpen('places', open)}
                    />
                )}

                {selectedPlaceId ? (
                    <ChannelList
                        channels={placeRooms}
                        joinByChannel={myJoins}
                        sid={selectedPlaceId}
                        isLoading={isChannelSectionLoading}
                        canCreate={!isChannelSectionLoading && (isDefaultCloud || isCloudOwner)}
                        isDefaultCloud={isDefaultCloud}
                        /**
                         * Every environment can start a 1:1, and they do not all do it the same way.
                         * Relay reaches a person by phone number; a cloud reaches them by name,
                         * because they are already a member.
                         *
                         * **Including an invited cloud**, which `canCreate` excludes — that flag is
                         * about making rooms, and a member who cannot make one can still talk to
                         * the people already beside them. The two were one flag until now, which is
                         * why they could not differ.
                         */
                        showOneOnOneCreate={!isChannelSectionLoading}
                        isPro={planTier !== 'free'}
                        sortMethod={channelSortMethod}
                        pinnedChannelIds={pinnedChannelIds}
                        onTogglePin={togglePinned}
                        onCreateOneOnOne={handleCreateOneOnOne}
                        onCreateGroup={handleCreateGroup}
                        // An invited member cannot create rooms here, so the empty body explains
                        // that rooms arrive by invitation and points at the place-info hub — the
                        // one place they CAN act on (leaving). See ChannelEmptyState.
                        isInvitedPlace={isInvitedCloud}
                        onOpenPlaceInfo={
                            selectedSiteId ? () => navigate(ROUTES.place.settings(selectedSiteId)) : undefined
                        }
                        sentInvites={isDefaultCloud ? sentInvites : []}
                        onSelectInvite={inviteId => navigate(ROUTES.invite.waiting(inviteId))}
                        open={homeSections.isOpen('channels')}
                        onOpenChange={open => homeSections.setOpen('channels', open)}
                    />
                ) : !isPlacesLoading && !isSwitching ? (
                    // No place is active in this cloud (none to auto-select) — guide the user to
                    // connect to a place before a channel list can show.
                    <EmptyState title={t('homePage.noPlaceTitle')} description={t('homePage.noPlaceDescription')} />
                ) : (
                    // Which place to show is still unresolved, so there is no channel list for this
                    // slot yet. It used to render nothing at all, and on a cold cloud that is the
                    // long half of a switch — on relay, where no place rail is drawn, it is the only
                    // thing in the body. A blank screen there reads as "this cloud is empty" exactly
                    // when it is not; the empty state above is what an actual answer looks like.
                    <div
                        role="status"
                        className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-description"
                    >
                        <Loader2 aria-hidden className="size-7 animate-spin" />
                        <p className="text-sm">{t('homePage.loadingCloud')}</p>
                    </div>
                )}

                {/* Cloud 1:1 rooms, which belong to the cloud rather than to any place and so appear
                    in none of the lists above. Relay is excluded: its 1:1s DO live in its one place
                    and are already in the list, so a second section would double them.

                    The same `ChannelList` as the place's rooms, deliberately — every row rule (the
                    title chain, the avatar, unread, the last-message preview) is decided there, and
                    a second row component would be a second place for them to drift. `sid` is the
                    reader's active place: a 1:1 carries one, but it is where its creator stood. */}
                {!isDefaultCloud && (
                    <ChannelList
                        channels={cloudDmChannels}
                        leadsWithSelf
                        joinByChannel={myJoins}
                        sid={selectedSiteId ?? ''}
                        isLoading={isCloudDmLoading}
                        title={t('cloudDm.section.title')}
                        emptyLabel={t('cloudDm.section.empty')}
                        sortMethod={channelSortMethod}
                        sentInvites={[]}
                        open={homeSections.isOpen('cloudDm')}
                        onOpenChange={open => homeSections.setOpen('cloudDm', open)}
                    />
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
            {/* "플레이스 관리" goes to the ACTIVE place's settings hub (where a place can be deleted to
                free a slot), so it is only offered when a site is active — same reason the header's
                "플레이스 설정" entry is gated on `hasActivePlace`. "클라우드 추가" reuses the one
                add-cloud entry point, which owns the cloud quota check. */}
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
