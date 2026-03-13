import { Search, Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const categoryKeys = ['all', 'study', 'development', 'design', 'reading', 'exercise', 'music'] as const;

const mockRooms = [
    {
        id: '1',
        name: 'React 스터디',
        workspace: '개발자 모임',
        members: 24,
        category: '개발',
        image: 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=300&h=200&fit=crop',
    },
    {
        id: '2',
        name: 'UI/UX 피드백',
        workspace: '디자인 팀',
        members: 15,
        category: '디자인',
        image: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=300&h=200&fit=crop',
    },
    {
        id: '3',
        name: '매일 영어 읽기',
        workspace: '독서 클럽',
        members: 42,
        category: '독서',
        image: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=300&h=200&fit=crop',
    },
    {
        id: '4',
        name: '주말 러닝 크루',
        workspace: '운동 모임',
        members: 31,
        category: '운동',
        image: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=300&h=200&fit=crop',
    },
    {
        id: '5',
        name: 'TypeScript 심화',
        workspace: '개발자 모임',
        members: 18,
        category: '개발',
        image: 'https://images.unsplash.com/photo-1516116216624-53e697fedbea?w=300&h=200&fit=crop',
    },
    {
        id: '6',
        name: '기타 연습방',
        workspace: '음악 모임',
        members: 9,
        category: '음악',
        image: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=300&h=200&fit=crop',
    },
];

export const ExplorePage = () => {
    const { t } = useTranslation();
    const [activeCategory, setActiveCategory] = useState('all');
    const [activeTab, setActiveTab] = useState<'rooms' | 'workspaces'>('rooms');

    const categoryMap: Record<string, string> = {
        all: t('explore.categories.all'),
        study: t('explore.categories.study'),
        development: t('explore.categories.development'),
        design: t('explore.categories.design'),
        reading: t('explore.categories.reading'),
        exercise: t('explore.categories.exercise'),
        music: t('explore.categories.music'),
    };

    const filtered =
        activeCategory === 'all'
            ? mockRooms
            : mockRooms.filter(r => {
                  const categoryKeyMap: Record<string, string> = {
                      스터디: 'study',
                      개발: 'development',
                      디자인: 'design',
                      독서: 'reading',
                      운동: 'exercise',
                      음악: 'music',
                  };
                  return categoryKeyMap[r.category] === activeCategory;
              });

    return (
        <div className="flex min-h-screen flex-col bg-background pb-20">
            {/* Header */}
            <header className="px-5 pb-3 pt-3">
                <h1 className="text-2xl font-extrabold text-foreground">{t('explore.title')}</h1>
            </header>

            {/* Search */}
            <div className="mb-4 px-5">
                <div className="flex items-center gap-2.5 rounded-xl bg-muted px-4 py-3">
                    <Search size={18} className="text-muted-foreground" />
                    <input
                        type="text"
                        placeholder={t('explore.searchPlaceholder')}
                        className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                    />
                </div>
            </div>

            {/* Tabs */}
            <div className="mb-4 flex gap-0 px-5">
                {(['rooms', 'workspaces'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`flex-1 border-b-2 py-2.5 text-sm font-semibold transition-colors ${
                            activeTab === tab
                                ? 'border-foreground text-foreground'
                                : 'border-transparent text-muted-foreground'
                        }`}
                    >
                        {tab === 'rooms' ? t('explore.tabs.rooms') : t('explore.tabs.workspaces')}
                    </button>
                ))}
            </div>

            {/* Categories */}
            <div className="mb-4 px-5">
                <div className="scrollbar-hide flex gap-2 overflow-x-auto">
                    {categoryKeys.map(key => (
                        <button
                            key={key}
                            onClick={() => setActiveCategory(key)}
                            className={`flex-shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                                activeCategory === key
                                    ? 'bg-foreground text-background'
                                    : 'bg-muted text-muted-foreground'
                            }`}
                        >
                            {categoryMap[key]}
                        </button>
                    ))}
                </div>
            </div>

            {/* Room Grid */}
            <div className="grid grid-cols-2 gap-3 px-5">
                {filtered.map(room => (
                    <div
                        key={room.id}
                        className="cursor-pointer overflow-hidden rounded-xl border border-border bg-card transition-transform active:scale-[0.97]"
                    >
                        <div className="h-24 overflow-hidden">
                            <img src={room.image} alt={room.name} className="h-full w-full object-cover" />
                        </div>
                        <div className="p-3">
                            <h3 className="truncate text-sm font-semibold text-foreground">{room.name}</h3>
                            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{room.workspace}</p>
                            <div className="mt-2 flex items-center gap-1">
                                <Users size={12} className="text-muted-foreground" />
                                <span className="text-[11px] text-muted-foreground">
                                    {t('explore.members', { count: room.members })}
                                </span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
