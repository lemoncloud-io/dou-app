import { ChevronLeft, Home, MoreHorizontal, Pin } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '../../../shared/hooks';

interface WorkspaceItem {
    id: string;
    name: string;
    image: string | null;
    isDefault?: boolean;
    isPinned: boolean;
}

interface WorkspaceListItemProps {
    workspace: WorkspaceItem;
    isMenuOpen: boolean;
    onMenuToggle: () => void;
    onMenuClose: () => void;
    onNavigateToSettings: () => void;
    onDelete: () => void;
    settingsLabel: string;
    deleteLabel: string;
}

const WorkspaceListItem = ({
    workspace,
    isMenuOpen,
    onMenuToggle,
    onMenuClose,
    onNavigateToSettings,
    onDelete,
    settingsLabel,
    deleteLabel,
}: WorkspaceListItemProps) => {
    return (
        <div className="relative">
            <div className="flex items-center gap-3 py-3.5">
                {/* Drag handle */}
                <button className="flex-shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <line x1="3" y1="12" x2="21" y2="12" />
                        <line x1="3" y1="18" x2="21" y2="18" />
                    </svg>
                </button>

                {/* Pin */}
                <button className="flex-shrink-0">
                    {workspace.isPinned ? (
                        <Pin size={16} className="fill-foreground text-foreground" />
                    ) : (
                        <Pin size={16} className="text-muted-foreground" />
                    )}
                </button>

                {/* Avatar */}
                <div
                    className="flex h-10 w-10 flex-shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full"
                    onClick={onNavigateToSettings}
                >
                    {workspace.isDefault ? (
                        <div className="flex h-full w-full items-center justify-center bg-primary">
                            <Home size={18} className="text-primary-foreground" />
                        </div>
                    ) : (
                        <img src={workspace.image ?? ''} alt={workspace.name} className="h-full w-full object-cover" />
                    )}
                </div>

                {/* Name */}
                <span
                    className="flex-1 cursor-pointer text-[15px] font-medium text-foreground"
                    onClick={onNavigateToSettings}
                >
                    {workspace.name}
                </span>

                {/* More menu */}
                <button onClick={onMenuToggle} className="flex-shrink-0 p-1">
                    <MoreHorizontal size={20} className="text-muted-foreground" />
                </button>
            </div>

            {/* Dropdown */}
            {isMenuOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={onMenuClose} />
                    <div className="absolute right-4 top-12 z-50 min-w-[120px] animate-fade-in overflow-hidden rounded-xl border border-border bg-card shadow-lg">
                        <button
                            onClick={() => {
                                onMenuClose();
                                onNavigateToSettings();
                            }}
                            className="w-full px-4 py-3 text-left text-[15px] text-foreground transition-colors active:bg-muted"
                        >
                            {settingsLabel}
                        </button>
                        <button
                            onClick={() => {
                                onMenuClose();
                                onDelete();
                            }}
                            className="w-full px-4 py-3 text-left text-[15px] text-destructive transition-colors active:bg-muted"
                        >
                            {deleteLabel}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

const mockWorkspaces = {
    mine: [
        { id: '1', name: 'Sunny Place', image: null, isDefault: true, isPinned: true },
        {
            id: '2',
            name: '개발자 모임',
            image: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=80&h=80&fit=crop',
            isPinned: false,
        },
    ],
    friends: [
        {
            id: '3',
            name: '디자인 팀',
            image: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=80&h=80&fit=crop',
            isPinned: false,
        },
        {
            id: '4',
            name: '독서 클럽',
            image: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=80&h=80&fit=crop',
            isPinned: false,
        },
    ],
};

export const WorkspaceListPage = () => {
    const navigate = useNavigateWithTransition();
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<'mine' | 'friends'>('mine');
    const [menuOpen, setMenuOpen] = useState<string | null>(null);

    const list = activeTab === 'mine' ? mockWorkspaces.mine : mockWorkspaces.friends;

    return (
        <div className="flex min-h-screen flex-col bg-background pt-safe-top">
            {/* Header */}
            <header className="flex items-center justify-center px-4 py-3">
                <button onClick={() => navigate(-1)} className="absolute left-4 p-2">
                    <ChevronLeft size={24} strokeWidth={2} className="text-foreground" />
                </button>
                <h1 className="text-[17px] font-semibold text-foreground">{t('workspace.list.title')}</h1>
            </header>

            {/* Tabs */}
            <div className="mb-4 flex gap-4 px-5 pt-5">
                <button
                    onClick={() => setActiveTab('mine')}
                    className={`text-lg font-bold transition-colors ${
                        activeTab === 'mine' ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                >
                    {t('workspace.list.mine')}
                </button>
                <button
                    onClick={() => setActiveTab('friends')}
                    className={`text-lg font-bold transition-colors ${
                        activeTab === 'friends' ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                >
                    {t('workspace.list.friends')}
                </button>
            </div>

            {/* List */}
            <div className="space-y-0 px-5">
                {list.map(ws => (
                    <WorkspaceListItem
                        key={ws.id}
                        workspace={ws}
                        isMenuOpen={menuOpen === ws.id}
                        onMenuToggle={() => setMenuOpen(menuOpen === ws.id ? null : ws.id)}
                        onMenuClose={() => setMenuOpen(null)}
                        onNavigateToSettings={() => navigate(`/workspace/${ws.id}/settings`)}
                        onDelete={() => {
                            // TODO: Implement delete functionality
                        }}
                        settingsLabel={t('workspace.list.settings')}
                        deleteLabel={t('workspace.list.delete')}
                    />
                ))}
            </div>
        </div>
    );
};
