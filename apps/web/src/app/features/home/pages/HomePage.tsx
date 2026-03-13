import { ArrowLeftRight, ChevronDown, Plus, Search, User } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { useDynamicProfile, useOnboardingStore, useWebCoreStore } from '@chatic/web-core';

import { useCanCreateChannel } from '../../../shared/hooks/useCanCreateChannel';
import { BottomNavigation } from '../../../shared/components/BottomNavigation';
import { SettingsDialog } from '../../../components/SettingsDialog';
import { OnboardingModal } from '../../onboarding';
import { ChannelList } from '../components/ChannelList';
import { CreateChannelDialog } from '../components/CreateChannelDialog';
import { CreatePlaceDialog } from '../components/CreatePlaceDialog';
import { CloudSessionSheet } from '../components/CloudSessionSheet';
import { PlaceList } from '../components/PlaceList';

export const HomePage = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const profile = useDynamicProfile();
    const { logout, isGuest } = useWebCoreStore();
    const { canCreate } = useCanCreateChannel();
    const { isCompleted, completeOnboarding } = useOnboardingStore();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isCreatePlaceOpen, setIsCreatePlaceOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isCloudSessionOpen, setIsCloudSessionOpen] = useState(false);

    const handleLogout = () => {
        logout();
        window.location.href = '/auth/login';
    };

    const { toast } = useToast();

    const handleComplete = () => {
        toast({ title: t('homePage.roomCreated') });
    };

    return (
        <div className="flex min-h-screen flex-col bg-background pb-[98px] pt-4">
            {/* Header */}
            <header className="flex items-center justify-between px-5 pb-3 pt-safe-top">
                {isGuest ? (
                    <img src="/logo-chatic.svg" alt="chatic" className="h-6" />
                ) : (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className="flex items-center gap-3">
                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary">
                                    <User size={20} className="text-primary-foreground" />
                                </div>
                                <div className="flex flex-col items-start">
                                    <div className="flex items-center gap-1">
                                        <h1 className="max-w-[120px] truncate text-lg font-bold text-foreground">
                                            {profile?.name || '-'}
                                        </h1>
                                        <ChevronDown size={18} className="text-muted-foreground" />
                                    </div>
                                    <p className="text-xs text-muted-foreground">{profile?.email || '-'}</p>
                                </div>
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-48">
                            <DropdownMenuItem onClick={() => setIsSettingsOpen(true)} className="cursor-pointer">
                                <span>{t('home.settings')}</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
                                <span>{t('home.logout')}</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
                <div className="flex items-center gap-1">
                    {!isGuest && (
                        <button onClick={() => setIsCloudSessionOpen(true)} className="p-2">
                            <ArrowLeftRight size={22} className="text-foreground" />
                        </button>
                    )}
                    <button onClick={() => navigate('/search')} className="p-2">
                        <Search size={22} className="text-foreground" />
                    </button>
                </div>
            </header>

            {/* Place List */}
            {!isGuest && (
                <section className="px-5 py-4">
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="text-xl font-bold text-foreground">Place</h2>
                        {canCreate && (
                            <button
                                onClick={() => setIsCreatePlaceOpen(true)}
                                className="flex h-8 w-8 items-center justify-center rounded-full border border-border"
                            >
                                <Plus size={18} className="text-foreground" />
                            </button>
                        )}
                    </div>

                    <PlaceList />
                </section>
            )}

            <div className="mx-5 h-px bg-border" />

            {/* Chat List */}
            <section className="flex-1 px-5 pt-4">
                <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-foreground">Chat</h2>
                    {canCreate && (
                        <button
                            onClick={() => setIsDialogOpen(true)}
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-border"
                        >
                            <Plus size={18} className="text-foreground" />
                        </button>
                    )}
                </div>

                <ChannelList workspaceId={''} />
            </section>

            <CreateChannelDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} onComplete={handleComplete} />
            <CreatePlaceDialog open={isCreatePlaceOpen} onOpenChange={setIsCreatePlaceOpen} />
            <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
            <CloudSessionSheet open={isCloudSessionOpen} onOpenChange={setIsCloudSessionOpen} />
            <OnboardingModal open={!isCompleted} onComplete={completeOnboarding} />
            <BottomNavigation />
        </div>
    );
};
