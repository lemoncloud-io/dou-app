import { ChevronDown, Home, Plus, Search, User } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { cn } from '@chatic/lib/utils';
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

// Mock workspaces for now
const mockWorkspaces = [
    { id: 'default', name: 'sunny place', image: null, isDefault: true },
    {
        id: 'ws-2',
        name: '개발자 모임',
        image: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=200&h=200&fit=crop',
    },
    {
        id: 'ws-3',
        name: '디자인 팀',
        image: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=200&h=200&fit=crop',
    },
    {
        id: 'ws-4',
        name: '독서 클럽',
        image: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=200&h=200&fit=crop',
    },
];

export const HomePage = () => {
    const navigate = useNavigate();
    const { profile, logout } = useSimpleWebCore();
    const { isCompleted, completeOnboarding } = useOnboardingStore();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [activeWorkspaceId, setActiveWorkspaceId] = useState('default');

    const activeWorkspace = mockWorkspaces.find(ws => ws.id === activeWorkspaceId);

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
            <header className="flex items-center justify-between px-5 pb-3 pt-3">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button className="flex items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary">
                                <User size={20} className="text-primary-foreground" />
                            </div>
                            <div className="flex flex-col items-start">
                                <div className="flex items-center gap-1">
                                    <h1 className="text-lg font-bold text-foreground">{profile?.name || '-'}</h1>
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

            {/* Workspace Carousel */}
            <section className="px-5 pb-4 pt-2">
                <p className="mb-3 text-xs font-medium text-muted-foreground">내 워크스페이스 목록</p>
                <div className="scrollbar-hide flex gap-3 overflow-x-auto pb-1">
                    {mockWorkspaces.map(ws => {
                        const isActive = ws.id === activeWorkspaceId;
                        return (
                            <div
                                key={ws.id}
                                onClick={() => setActiveWorkspaceId(ws.id)}
                                className={cn(
                                    'relative h-[110px] w-[110px] flex-shrink-0 cursor-pointer overflow-hidden rounded-xl transition-all active:scale-95',
                                    isActive && 'ring-2 ring-accent ring-offset-2 ring-offset-background'
                                )}
                            >
                                {ws.isDefault ? (
                                    <div className="flex h-full w-full flex-col items-center justify-center bg-primary">
                                        <Home size={24} className="mb-1 text-primary-foreground" />
                                        <span className="px-2 text-center text-[11px] font-medium leading-tight text-primary-foreground">
                                            {ws.name}
                                        </span>
                                    </div>
                                ) : (
                                    <>
                                        <img
                                            src={ws.image ?? ''}
                                            alt={ws.name}
                                            className="h-full w-full object-cover"
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                                        <span className="absolute bottom-2 left-2 right-2 truncate text-[11px] font-medium leading-tight text-primary-foreground">
                                            {ws.name}
                                        </span>
                                    </>
                                )}
                            </div>
                        );
                    })}
                    {/* + Button */}
                    <button
                        onClick={() => navigate('/create-workspace')}
                        className="flex h-[110px] w-[110px] flex-shrink-0 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-border transition-all hover:border-muted-foreground active:scale-95"
                    >
                        <Plus size={28} className="text-muted-foreground" />
                    </button>
                </div>
            </section>

            <div className="mx-5 h-px bg-border" />

            {/* Chat List */}
            <section className="flex-1 px-5 pt-4">
                <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-foreground">{activeWorkspace?.name || 'Chat'}</h2>
                    <button
                        onClick={() => setIsDialogOpen(true)}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-border"
                    >
                        <Plus size={18} className="text-foreground" />
                    </button>
                </div>

                <ChannelList workspaceId={activeWorkspaceId} />
            </section>

            <CreateChannelDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} onComplete={handleComplete} />
            <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
            <OnboardingModal open={!isCompleted} onComplete={completeOnboarding} />
        </div>
    );
};
