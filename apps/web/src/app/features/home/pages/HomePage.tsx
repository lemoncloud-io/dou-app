import { ArrowLeftRight, Bell, ChevronDown, Search, User } from 'lucide-react';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { useLogout, useOnboardingStore, useWebCoreStore, useUserContext, UserType } from '@chatic/web-core';

import { useCanCreateChannel } from '../../../shared/hooks/useCanCreateChannel';
import { useCanCreatePlace } from '../../../shared/hooks/useCanCreatePlace';
import { useCloudSession } from '../../../shared/hooks/useCloudSession';
import { BottomNavigation } from '../../../shared/components/BottomNavigation';
import { CloudLogo } from '../../../shared/components/CloudLogo';
import { LimitExceededDialog } from '../../../shared/components/LimitExceededDialog';
import { SettingsDialog } from '../../../components/SettingsDialog';
import { OnboardingModal } from '../../onboarding';
import { SearchModal } from '../../search';
import { ChannelList } from '../components/ChannelList';
import { CloudSessionSheet } from '../components/CloudSessionSheet';
import { CreateChannelDialog } from '../components/CreateChannelDialog';
import { CreatePlaceDialog } from '../components/CreatePlaceDialog';
import { PlaceList } from '../components/PlaceList';

const IS_LOCAL = import.meta.env.VITE_ENV === 'LOCAL';

export const HomePage = () => {
    const { t } = useTranslation();
    const profile = useWebCoreStore(s => s.profile);
    const { userType } = useUserContext();
    const isInvited = userType === UserType.INVITED || userType === UserType.INVITED_WITH_CLOUD;
    const { mutate: logout } = useLogout();
    const navigate = useNavigateWithTransition();

    const {
        canCreate: _canCreateChannel,
        isLimitReached: isChannelLimitReached,
        isLoading: isChannelsLoading,
        maxCount: maxChannels,
    } = useCanCreateChannel();
    const {
        isLimitReached: isPlaceLimitReached,
        isLoading: isPlacesLoading,
        maxCount: maxPlaces,
        isMyCloud,
    } = useCanCreatePlace();
    const { isCompleted, completeOnboarding } = useOnboardingStore();
    const { isCloudsError } = useCloudSession();

    const displayName = profile?.$user.name ?? '-';
    const displayImageUrl = profile?.$user.photo;
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isPlaceDialogOpen, setIsPlaceDialogOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isCloudSessionOpen, setIsCloudSessionOpen] = useState(false);
    const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
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
        <div className="flex min-h-screen flex-col bg-background pb-[98px] pt-4">
            {/* Header */}
            <header className="flex items-center justify-between px-5 pb-3 pt-safe-top">
                {userType === UserType.TEMP_ACCOUNT ? (
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
                                    <span className="max-w-[160px] truncate text-[17px] font-semibold tracking-[-0.025em] text-foreground">
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
                            <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
                                <span>{isInvited ? t('home.logoutInvited') : t('home.logout')}</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : (
                    <div className="flex items-center gap-[9px]">
                        <div className="flex h-[46px] w-[46px] items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
                            {displayImageUrl ? (
                                <img src={displayImageUrl} alt="Profile" className="h-full w-full object-cover" />
                            ) : (
                                <User size={20} className="text-muted-foreground" />
                            )}
                        </div>
                        <span className="max-w-[160px] truncate text-[17px] font-semibold tracking-[-0.025em] text-foreground">
                            {displayName}
                        </span>
                    </div>
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
                    <button onClick={() => navigate('/notifications')} className="p-1">
                        <Bell size={22} className="text-foreground" />
                    </button>
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
                    onPlaceSelected={setSelectedPlaceId}
                    onNavigateToOrder={() => navigate('/places/order')}
                    onCreatePlace={handleCreatePlace}
                    isGuest={userType === UserType.TEMP_ACCOUNT}
                    isPlacesLoading={isPlacesLoading}
                />
            </section>

            <div className="mx-4 h-[3px] bg-border" />

            {/* Chat List */}
            <section className="flex-1 px-4 pt-[18px]">
                <ChannelList
                    workspaceId={selectedPlaceId ?? ''}
                    showCreateButton={userType !== UserType.TEMP_ACCOUNT && !isInvited && !isChannelsLoading}
                    isChannelsLoading={isChannelsLoading}
                    onCreateChannel={handleCreateChannel}
                    channelLimit={maxChannels}
                />
            </section>

            <CreateChannelDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} onComplete={handleComplete} />
            <CreatePlaceDialog open={isPlaceDialogOpen} onOpenChange={setIsPlaceDialogOpen} />
            <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
            <CloudSessionSheet open={isCloudSessionOpen} onOpenChange={setIsCloudSessionOpen} />
            <OnboardingModal open={!isCompleted} onComplete={completeOnboarding} />
            <SearchModal open={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
            <LimitExceededDialog
                open={limitDialogType !== null}
                onOpenChange={open => !open && setLimitDialogType(null)}
                type={limitDialogType ?? 'place'}
                maxCount={limitDialogType === 'channel' ? maxChannels : maxPlaces}
            />
            <BottomNavigation />
        </div>
    );
};
