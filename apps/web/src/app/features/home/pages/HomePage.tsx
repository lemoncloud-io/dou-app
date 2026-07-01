import { ArrowLeftRight, CircleAlert, EllipsisVertical, User } from 'lucide-react';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';
import { useCloudSessionCatalog, useSessionSelection } from '@chatic/web-core';
import { useSessionProfile } from '@chatic/app-runtime';

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
import { BottomNavigation, CloudLogo, ReportIssueDialog } from '../../../ui';
import { OnboardingModal } from '../../onboarding';
import { ChannelList, CloudSessionSheet, CreateChannelDialog, CreatePlaceDialog, PlaceList } from '../components';
import { useChannelUnreads, useHomeChannels, useHomePlaces, useInvitedClouds, useSwitchPlace } from '../hooks';
import { resolveHeaderProfile } from '../lib';
import { InviteDialog } from '../components';

export const HomePage = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();

    // Profile facts track the cached profile (seeded synchronously from the active session payload,
    // then reactive on cache emits), so a profile edit fans out here without a session refresh.
    const { isGuest } = useSessionProfile();
    const permissions = useUserPermissions();
    // A guest who has accepted a cloud invite stays userType === TEMP_ACCOUNT, but holds invited
    // clouds in the cache. This "invited guest" must be able to switch into those clouds, so the
    // cloud-switch UI is offered to them even though they are still a guest.
    // useInvitedClouds hides clouds the signed-in account now owns, so an invited cloud that became
    // owned (guest → owner) no longer counts here and is shown only as an owned cloud.
    const { hasInvitedClouds } = useInvitedClouds();
    const isInvitedGuest = isGuest && hasInvitedClouds;
    const canSwitchCloud = !isGuest || isInvitedGuest;
    const { selectedCloudId } = useSessionSelection();
    const isDefaultCloud = selectedCloudId === 'default';
    const { isCloudsError } = useCloudSessionCatalog();

    // === Data: place list, active place, channel list, unread ===
    const { places, isLoading: isPlacesLoading } = useHomePlaces();
    const { selectedPlaceId, switchPlace, isSwitching } = useSwitchPlace(places);

    const { channels, isLoading: isChannelsLoading } = useHomeChannels(selectedPlaceId);
    // Unread badges derive from each channel's embedded `$join.chatNo` (kept live by the channel
    // sync), so no separate per-channel join sync is registered here.
    const { byChannel: unreadByChannel } = useChannelUnreads(channels);

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
    const [isReportIssueOpen, setIsReportIssueOpen] = useState(false);

    const { isFirstRun, completeOnboarding } = usePreferenceStore();
    const { toast } = useToast();

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

    const handleCreateChannel = () => setIsDialogOpen(true);

    return (
        <div className="flex h-screen flex-col overflow-hidden bg-background pb-[98px] pt-4">
            {/* Header */}
            <header className="flex items-center justify-between px-5 pb-3 pt-safe-top">
                {!showProfileButton ? (
                    <CloudLogo />
                ) : (
                    <button onClick={() => navigate(profileTarget)} className="flex items-center gap-[9px]">
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
                    {canSwitchCloud && (
                        <button onClick={() => setIsCloudSessionOpen(true)} className="p-1">
                            <ArrowLeftRight size={22} className="text-foreground" />
                        </button>
                    )}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className="p-1">
                                <EllipsisVertical size={22} className="text-foreground" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => setIsReportIssueOpen(true)} className="cursor-pointer">
                                <CircleAlert size={16} className="mr-2" />
                                <span>{t('home.reportIssue')}</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </header>

            {/* Cloud Error Banner */}
            {!isGuest && isCloudsError && (
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
                    places={places}
                    selectedPlaceId={selectedPlaceId}
                    isLoading={isPlacesLoading}
                    isSwitching={isSwitching}
                    onSelectPlace={switchPlace}
                    onCreatePlace={handleCreatePlace}
                    isGuest={isGuest}
                />
            </section>

            <div className="mx-4 h-[3px] bg-border" />

            {/* Chat List */}
            <section className="flex min-h-0 flex-1 flex-col px-4 pt-[18px]">
                {selectedPlaceId ? (
                    <ChannelList
                        channels={channels}
                        unreadByChannel={unreadByChannel}
                        isLoading={isChannelsLoading}
                        showCreateButton={!isChannelsLoading && permissions.canCreateChannel}
                        onCreateChannel={handleCreateChannel}
                    />
                ) : null}
            </section>

            <CreateChannelDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} onComplete={handleComplete} />
            <CreatePlaceDialog open={isPlaceDialogOpen} onOpenChange={setIsPlaceDialogOpen} />
            <CloudSessionSheet open={isCloudSessionOpen} onOpenChange={setIsCloudSessionOpen} />
            <OnboardingModal open={isFirstRun} onComplete={completeOnboarding} />
            <ReportIssueDialog open={isReportIssueOpen} onOpenChange={setIsReportIssueOpen} />
            <InviteDialog />
            <BottomNavigation />
        </div>
    );
};
