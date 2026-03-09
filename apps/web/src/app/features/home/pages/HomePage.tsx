import { ChevronDown, Plus, Search, User } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { useOnboardingStore, useSimpleWebCore } from '@chatic/web-core';

import { SettingsDialog } from '../../../components/SettingsDialog';
import { OnboardingModal } from '../../onboarding';
import { ChannelList } from '../components/ChannelList';
import { CreateChannelDialog } from '../components/CreateChannelDialog';
import { PlaceList } from '../components/PlaceList';

export const HomePage = () => {
    const navigate = useNavigate();
    const { profile, logout } = useSimpleWebCore();
    const { isCompleted, completeOnboarding } = useOnboardingStore();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);

    const handleLogout = () => {
        logout();
        window.location.href = '/auth/login';
    };

    const { toast } = useToast();

    const handleComplete = () => {
        toast({ title: '채팅방이 생성되었습니다' });
    };

    return (
        <div className="flex min-h-screen flex-col bg-background pb-20">
            {/* Header */}
            <header className="flex items-center justify-between px-5 pb-3 pt-safe-top">
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
                            <span>설정</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
                            <span>로그아웃</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                <div className="flex items-center gap-1">
                    <button onClick={() => navigate('/join')} className="p-2">
                        <Plus size={22} className="text-foreground" />
                    </button>
                    <button onClick={() => navigate('/search')} className="p-2">
                        <Search size={22} className="text-foreground" />
                    </button>
                </div>
            </header>

            {/* Place List */}
            <section className="pb-4 pt-2">
                <p className="mb-3 px-4 text-[18px] font-semibold text-black">플레이스</p>
                <PlaceList selectedId={selectedPlaceId} onSelect={setSelectedPlaceId} />
            </section>

            <div className="mx-5 h-px bg-border" />

            {/* Chat List */}
            <section className="flex-1 px-5 pt-4">
                <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-foreground">Chat</h2>
                    <button
                        onClick={() => setIsDialogOpen(true)}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-border"
                    >
                        <Plus size={18} className="text-foreground" />
                    </button>
                </div>

                <ChannelList workspaceId={selectedPlaceId ?? ''} />
            </section>

            <CreateChannelDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} onComplete={handleComplete} />
            <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
            <OnboardingModal open={!isCompleted} onComplete={completeOnboarding} />
        </div>
    );
};
