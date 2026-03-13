import { ChevronDown, Plus, Search, Settings, SlidersHorizontal, User } from 'lucide-react';
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
import { useOnboardingStore, useWebCoreStore } from '@chatic/web-core';

import { useCanCreateChannel } from '../../../shared/hooks/useCanCreateChannel';
import { BottomNavigation } from '../../../shared/components/BottomNavigation';
import { SettingsDialog } from '../../../components/SettingsDialog';
import { OnboardingModal } from '../../onboarding';
import { ChannelList } from '../components/ChannelList';
import { CreateChannelDialog } from '../components/CreateChannelDialog';
import { CreatePlaceDialog } from '../components/CreatePlaceDialog';
import { PlaceList } from '../components/PlaceList';

export const HomePage = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { logout, isGuest, profile } = useWebCoreStore();
    const { canCreate } = useCanCreateChannel();
    const { isCompleted, completeOnboarding } = useOnboardingStore();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isPlaceDialogOpen, setIsPlaceDialogOpen] = useState(false);
    const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);

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
                            <button className="flex items-center gap-[9px]">
                                <div className="flex h-[46px] w-[46px] items-center justify-center rounded-full border border-border bg-muted">
                                    <User size={20} className="text-muted-foreground" />
                                </div>
                                <div className="flex items-center gap-1">
                                    <span className="max-w-[160px] truncate text-[17px] font-semibold tracking-[-0.025em] text-foreground">
                                        {profile?.$user?.nick || profile?.$user?.name || '-'}
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
                                <span>{t('home.logout')}</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/search')} className="p-1">
                        <Search size={22} className="text-foreground" />
                    </button>
                    <button onClick={() => setIsSettingsOpen(true)} className="p-1">
                        <Settings size={22} className="text-foreground" />
                    </button>
                </div>
            </header>

            {/* Place List */}
            <section className="pb-4 pt-2">
                <div className="mb-[18px] flex items-center justify-between px-4">
                    <div className="flex items-center gap-[6px]">
                        <span className="text-[18px] font-semibold leading-[1.334] tracking-[-0.003em] text-foreground">
                            {t('homePage.places')}
                        </span>
                        <button className="flex items-center justify-center rounded-[6px] border border-border p-[2px]">
                            <SlidersHorizontal size={20} className="text-foreground" />
                        </button>
                    </div>
                    <button
                        onClick={() => setIsPlaceDialogOpen(true)}
                        className="flex items-center justify-center rounded-[8px]"
                    >
                        <Plus size={24} className="text-foreground" />
                    </button>
                </div>
                <PlaceList onPlaceSelected={setSelectedPlaceId} />
            </section>

            <div className="mx-4 h-[3px] bg-border" />

            {/* Chat List */}
            <section className="flex-1 px-4 pt-[18px]">
                <div className="mb-[18px] flex items-center justify-between">
                    <span className="text-[18px] font-semibold leading-[1.334] tracking-[-0.003em] text-foreground">
                        Chat
                    </span>
                    {canCreate && (
                        <button
                            onClick={() => setIsDialogOpen(true)}
                            className="flex h-[24px] w-[24px] items-center justify-center"
                        >
                            <Plus size={24} className="text-foreground" />
                        </button>
                    )}
                </div>

                <ChannelList workspaceId={selectedPlaceId ?? ''} />
            </section>

            <CreateChannelDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} onComplete={handleComplete} />
            <CreatePlaceDialog open={isPlaceDialogOpen} onOpenChange={setIsPlaceDialogOpen} />
            <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
            <OnboardingModal open={!isCompleted} onComplete={completeOnboarding} />
            <BottomNavigation />
        </div>
    );
};
