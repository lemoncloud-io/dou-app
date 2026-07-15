import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';
import { useCloudSessionCatalog, useMembershipInfo, useSessionSelection } from '@chatic/web-core';
import { useRuntimeProfile } from '@chatic/app-runtime';

import { AppHeader, DefaultAvatar, ProfileAvatar } from '@chatic/web-ui-kit';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { useMyProfile, useMyUser, useUserPermissions } from '../../../hooks';
import { usePreferenceStore } from '../../../stores/usePreferenceStore';
import { ROUTES } from '../../../routes/paths';
import { BottomNavigation } from '../../../ui';
import { OnboardingModal } from '../../onboarding';
import {
    ChannelList,
    CloudSessionSheet,
    CreateChannelDialog,
    CreatePlaceDialog,
    InviteDialog,
    PlaceList,
    PlaceProfileCreateDialog,
    SubscriptionRequiredDialog,
} from '../components';
import { getCloudDisplayName } from '../components/cloud-session';
import {
    useActiveCloudChannels,
    useChannelUnreads,
    useHomeChannels,
    useHomePlaces,
    useInvitedClouds,
    usePlaceProfilePrompt,
    useSwitchPlace,
} from '../hooks';
import { resolveHeaderProfile } from '../lib';

export const HomePage = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();

    // Profile facts track the cached profile (seeded synchronously from the active session payload,
    // then reactive on cache emits), so a profile edit fans out here without a session refresh.
    const { isGuest } = useRuntimeProfile();
    const permissions = useUserPermissions();
    // A guest who has accepted a cloud invite stays userType === TEMP_ACCOUNT, but holds invited
    // clouds in the cache. This "invited guest" must be able to switch into those clouds, so the
    // cloud-switch UI is offered to them even though they are still a guest.
    // useInvitedClouds hides clouds the signed-in account now owns, so an invited cloud that became
    // owned (guest → owner) no longer counts here and is shown only as an owned cloud.
    const { hasInvitedClouds, invitedClouds } = useInvitedClouds();
    const isInvitedGuest = isGuest && hasInvitedClouds;
    const canSwitchCloud = !isGuest || isInvitedGuest;
    const { selectedCloudId } = useSessionSelection();
    const isDefaultCloud = selectedCloudId === 'default';
    // Connected to an invited cloud → drives the place-type caption; place creation is owner-only
    // (hidden on relay and for invited users), gated by the runtime permission.
    const isInvitedCloud = !isDefaultCloud && invitedClouds.some(cloud => cloud.id === selectedCloudId);
    const canAddPlace = !isDefaultCloud && permissions.canCreatePlace;

    // Cloud identity for the `cloud` header kind. CloudView has no image field, so AppHeader falls
    // back to a CloudAvatar (name initials) — we only supply the display name here.
    const { clouds } = useCloudSessionCatalog();
    const activeCloud = clouds.find(cloud => cloud.id === selectedCloudId);
    const cloudName = activeCloud ? getCloudDisplayName(activeCloud) : '';

    // Subscription tier drives the FREE/PRO plan badge. A guest is always FREE; otherwise a valid
    // membership reads as PRO (same convention as SubscriptionPage). CloudView carries no grade.
    const { data: membership } = useMembershipInfo();
    const planTier: 'free' | 'pro' = !isGuest && membership?.isValid ? 'pro' : 'free';

    // === Data: place list, active place, channel list, unread ===
    const { places, isLoading: isPlacesLoading } = useHomePlaces();
    const { selectedPlaceId, switchPlace, isSwitching } = useSwitchPlace(places);

    // Prompt to CREATE a per-place profile when the active place has none yet.
    const { shouldPrompt: needsPlaceProfile, dismiss: dismissPlaceProfile } = usePlaceProfilePrompt();
    const [isPlaceProfileOpen, setIsPlaceProfileOpen] = useState(false);
    const activePlaceName = places.find(place => place.id === selectedPlaceId)?.name ?? '';

    const { channels, isLoading: isChannelsLoading } = useHomeChannels(selectedPlaceId);
    // Aggregate over the active cloud's FULL channel list (every site) so place dots cover all
    // sites, not just the selected one. Unread derives from each channel's embedded `$join`/`metaNo`
    // (kept live by the background channel sync) — no per-channel join sync here. The app-icon badge
    // is owned globally by UnreadBadgeRunner (AppRuntime), not this page.
    const cloudChannels = useActiveCloudChannels();
    const { byChannel: unreadByChannel, byPlace: unreadByPlace } = useChannelUnreads(cloudChannels);

    // Header profile is resolved by tier (site → user account → setup prompt). The site profile
    // (V2 per-site nick/thumbnail) only applies off the default cloud; an edit-screen save reflects
    // immediately via the observed cache. `identity.userName` is intentionally excluded — it defaults
    // to 'Unknown', which would mask the empty-account state that should show the setup prompt.
    const { profile: myProfile } = useMyProfile();
    const myUser = useMyUser();
    const headerProfile = resolveHeaderProfile({
        siteName: !isDefaultCloud ? myProfile?.nick : undefined,
        siteImageUrl: !isDefaultCloud ? myProfile?.thumbnail : undefined,
        accountName: myUser?.name,
        accountImageUrl: myUser?.photo,
    });
    const displayName = headerProfile.kind === 'setup' ? t('homePage.setupProfile') : headerProfile.name || '-';
    const displayImageUrl = headerProfile.kind === 'setup' ? undefined : headerProfile.imageUrl;

    // On an active site everyone has an editable site profile (incl. invited-cloud users), so show
    // the profile header there regardless of guest/invited status. On the default cloud, keep hiding
    // it for guests / invited users who have no editable relay profile.
    const showProfileButton = !isDefaultCloud || !isGuest;
    const profileTarget = isDefaultCloud ? ROUTES.mypage.account.edit : ROUTES.mypage.account.siteProfile;

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isPlaceDialogOpen, setIsPlaceDialogOpen] = useState(false);
    const [isCloudSessionOpen, setIsCloudSessionOpen] = useState(false);
    const [isSubscriptionRequiredOpen, setIsSubscriptionRequiredOpen] = useState(false);

    const { isFirstRun, completeOnboarding } = usePreferenceStore();
    const { toast } = useToast();

    // Open the place-profile-create overlay once the prompt is due, but never over the first-run
    // onboarding modal (that flow takes precedence).
    useEffect(() => {
        if (needsPlaceProfile && !isFirstRun) setIsPlaceProfileOpen(true);
    }, [needsPlaceProfile, isFirstRun]);

    const handleComplete = () => {
        toast({ title: t('homePage.roomCreated') });
    };

    const handleCreatePlace = () => {
        if (!permissions.canCreatePlace) {
            toast({ title: t('homePage.cannotCreatePlace'), variant: 'destructive' });
            return;
        }
        setIsPlaceDialogOpen(true);
    };

    // Group-room creation is PRO-gated: subscribed → the create dialog, otherwise the upsell.
    const handleCreateGroup = () => {
        if (planTier === 'pro') {
            setIsDialogOpen(true);
        } else {
            setIsSubscriptionRequiredOpen(true);
        }
    };
    // Relay 1:1 chat creation is not implemented yet (ADR-0013): placeholder.
    const handleCreateOneOnOne = () => toast({ title: t('homePage.directComingSoon', '1:1 대화는 준비 중이에요') });

    // Search is not implemented yet (ADR-0013): the button is a visible placeholder.
    const handleSearch = () => toast({ title: t('homePage.searchComingSoon', '검색은 준비 중이에요') });
    // Notifications settings has no route yet (ADR-0013): placeholder, tracked as a follow-up.
    const handleNotifications = () =>
        toast({ title: t('homePage.notificationsComingSoon', '알림 설정은 준비 중이에요') });

    // Right-side profile → dropdown (프로필 / 알림 / 설정). The header shows my place profile.
    const profileMenu = (
        <DropdownMenu>
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
                    <span className="min-w-0 truncate text-sm font-semibold text-foreground">{displayName}</span>
                </div>
                <DropdownMenuItem onClick={() => navigate(profileTarget)} className="cursor-pointer">
                    {t('homePage.menuProfile', '프로필')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleNotifications} className="cursor-pointer">
                    {t('homePage.menuNotifications', '알림')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate(ROUTES.mypage.root)} className="cursor-pointer">
                    {t('homePage.menuSettings', '설정')}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );

    return (
        <div className="flex h-screen flex-col overflow-hidden bg-background pb-[98px]">
            <AppHeader
                kind={isDefaultCloud ? 'no-cloud' : 'cloud'}
                name={cloudName}
                planTier={planTier}
                onPlanClick={() => navigate(ROUTES.subscription.root)}
                onSearch={handleSearch}
                searchLabel={t('homePage.search', '검색')}
                onSwitcher={canSwitchCloud ? () => setIsCloudSessionOpen(true) : undefined}
                switcherLabel={t('homePage.switchCloud', '클라우드 전환')}
                avatar={showProfileButton ? profileMenu : <DefaultAvatar size={36} />}
                profileLabel={t('homePage.profile', '프로필')}
            />

            {/* Place + Chat scroll together under the fixed header (accordion sections). */}
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-2">
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

                {selectedPlaceId ? (
                    <ChannelList
                        channels={channels}
                        unreadByChannel={unreadByChannel}
                        isLoading={isChannelsLoading}
                        canCreate={!isChannelsLoading && permissions.canCreateChannel}
                        isDefaultCloud={isDefaultCloud}
                        isPro={planTier === 'pro'}
                        onCreateOneOnOne={handleCreateOneOnOne}
                        onCreateGroup={handleCreateGroup}
                    />
                ) : null}
            </div>

            <CreateChannelDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} onComplete={handleComplete} />
            <CreatePlaceDialog open={isPlaceDialogOpen} onOpenChange={setIsPlaceDialogOpen} />
            <PlaceProfileCreateDialog
                open={isPlaceProfileOpen}
                placeName={activePlaceName}
                onDone={() => setIsPlaceProfileOpen(false)}
                onExit={() => {
                    setIsPlaceProfileOpen(false);
                    dismissPlaceProfile();
                }}
            />
            <CloudSessionSheet open={isCloudSessionOpen} onOpenChange={setIsCloudSessionOpen} />
            <SubscriptionRequiredDialog
                open={isSubscriptionRequiredOpen}
                onClose={() => setIsSubscriptionRequiredOpen(false)}
            />
            <OnboardingModal open={isFirstRun} onComplete={completeOnboarding} />
            <InviteDialog />
            <BottomNavigation />
        </div>
    );
};
