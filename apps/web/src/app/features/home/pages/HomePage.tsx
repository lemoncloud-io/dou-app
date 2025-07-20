import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Activity, ArrowUpRight, BarChart3, Bell, Calendar, LogOut, TrendingUp, User } from 'lucide-react';

import { Logo } from '@lemon/assets';
import { Button } from '@lemon/ui-kit/components/ui/button';
import { Card } from '@lemon/ui-kit/components/ui/card';
import { Separator } from '@lemon/ui-kit/components/ui/separator';
import { useWebCoreStore } from '@lemon/web-core';

import { SettingsControl } from '../../../shared';
import { ProfileEditModal } from '../components';

export const HomePage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const [animateStats, setAnimateStats] = useState(false);
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

    const userName = useWebCoreStore(state => state.userName);
    const profile = useWebCoreStore(state => state.profile);

    useEffect(() => {
        const timer = setTimeout(() => setAnimateStats(true), 500);
        return () => clearTimeout(timer);
    }, []);

    const stats = [
        {
            label: t('dashboard.stats.projects', 'Total Projects'),
            value: 12,
            icon: <BarChart3 className="w-6 h-6" />,
            color: 'bg-lemon-gradient',
        },
        {
            label: t('dashboard.stats.tasks', 'Active Tasks'),
            value: 28,
            icon: <Activity className="w-6 h-6" />,
            color: 'bg-gradient-to-r from-blue-500 to-cyan-500',
        },
        {
            label: t('dashboard.stats.completed', 'Completed'),
            value: 156,
            icon: <TrendingUp className="w-6 h-6" />,
            color: 'bg-gradient-to-r from-green-500 to-emerald-500',
        },
        {
            label: t('dashboard.stats.thisMonth', 'This Month'),
            value: 89,
            icon: <Calendar className="w-6 h-6" />,
            color: 'bg-gradient-to-r from-purple-500 to-pink-500',
        },
    ];

    const recentActivities = [
        {
            action: t('dashboard.activity.created', 'Created new project'),
            time: t('dashboard.time.hoursAgo', '2 hours ago', { count: 2 }),
            type: 'create',
        },
        {
            action: t('dashboard.activity.completed', 'Completed task "Design Review"'),
            time: t('dashboard.time.hoursAgo', '4 hours ago', { count: 4 }),
            type: 'complete',
        },
        {
            action: t('dashboard.activity.updated', 'Updated project settings'),
            time: t('dashboard.time.dayAgo', '1 day ago'),
            type: 'update',
        },
        {
            action: t('dashboard.activity.shared', 'Shared project with team'),
            time: t('dashboard.time.daysAgo', '2 days ago', { count: 2 }),
            type: 'share',
        },
    ];

    const AnimatedCounter = ({ value, duration = 2000 }: { value: number; duration?: number }) => {
        const [count, setCount] = useState(0);

        useEffect(() => {
            if (!animateStats) return;

            let startTime: number;
            const animate = (timestamp: number) => {
                if (!startTime) startTime = timestamp;
                const progress = Math.min((timestamp - startTime) / duration, 1);
                setCount(Math.floor(progress * value));

                if (progress < 1) {
                    requestAnimationFrame(animate);
                }
            };
            requestAnimationFrame(animate);
        }, [animateStats, value, duration]);

        return <span>{count}</span>;
    };

    return (
        <>
            <div className="min-h-screen bg-lemon-cosmic animate-gradient">
                {/* Background Effects */}
                <div className="fixed inset-0 bg-lemon-aurora animate-gradient opacity-20 z-background" />
                <div className="fixed top-20 left-20 w-96 h-96 bg-orange-500/3 dark:bg-orange-400/2 rounded-full blur-3xl animate-float z-background" />
                <div
                    className="fixed bottom-20 right-20 w-80 h-80 bg-yellow-500/3 dark:bg-yellow-400/2 rounded-full blur-3xl animate-float"
                    style={{ animationDelay: '4s' }}
                />

                {/* Header */}
                <header className="relative z-header glass border-b border-white/10 dark:border-white/5">
                    <div className="max-w-6xl mx-auto px-6 py-4" style={{ position: 'relative', zIndex: 30 }}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-4">
                                <div className="flex items-center space-x-2">
                                    <img src={Logo.symbol} alt="symbol" className="w-8 h-8" />
                                    <span className="text-2xl font-bold text-primary-content">LemonCloud</span>
                                </div>
                                <Separator orientation="vertical" className="h-8 bg-white/20 dark:bg-white/10" />
                                <span className="text-secondary-content">{t('dashboard.title', 'Dashboard')}</span>
                            </div>

                            <div className="flex items-center space-x-4">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-secondary-content hover:text-primary-content hover:bg-white/10 dark:hover:bg-white/5"
                                >
                                    <Bell className="w-5 h-5" />
                                </Button>
                                <SettingsControl />
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-secondary-content hover:text-primary-content hover:bg-white/10 dark:hover:bg-white/5"
                                    onClick={() => navigate('/auth/logout')}
                                >
                                    <LogOut className="w-5 h-5" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </header>

                <div className="relative z-10 max-w-7xl mx-auto px-6 py-8">
                    {/* Welcome Section */}
                    <div className="mb-8">
                        <h1 className="text-4xl md:text-5xl font-bold text-primary-content mb-4 animate-slide-up">
                            {t('dashboard.welcome', 'Welcome back!')} 👋
                        </h1>
                        <p className="text-xl text-secondary-content animate-fade-in">
                            {t('dashboard.subtitle', "Here's what's happening with your projects today.")}
                        </p>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                        {stats.map((stat, index) => (
                            <Card
                                key={stat.label}
                                className="glass p-6 border-0 hover:scale-105 transition-all duration-300 animate-slide-up group"
                                style={{ animationDelay: `${index * 100}ms` }}
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <div className={`p-3 rounded-xl ${stat.color} text-white`}>{stat.icon}</div>
                                    <ArrowUpRight className="w-5 h-5 text-muted-content group-hover:text-primary-content transition-colors" />
                                </div>
                                <div className="space-y-1">
                                    <p className="text-2xl md:text-3xl font-bold text-primary-content">
                                        <AnimatedCounter value={stat.value} />
                                    </p>
                                    <p className="text-sm text-secondary-content">{stat.label}</p>
                                </div>
                            </Card>
                        ))}
                    </div>

                    {/* Main Content Grid */}
                    <div className="grid lg:grid-cols-3 gap-8">
                        {/* User Profile Card */}
                        <div className="lg:col-span-1">
                            <Card className="glass p-6 border-0 animate-slide-up" style={{ animationDelay: '600ms' }}>
                                <div className="text-center">
                                    <div className="w-24 h-24 bg-lemon-gradient rounded-full flex items-center justify-center mx-auto mb-4">
                                        <User className="w-12 h-12 text-white" />
                                    </div>
                                    <h3 className="text-xl font-semibold text-primary-content mb-2">
                                        {userName || 'John Doe'}
                                    </h3>
                                    <p className="text-secondary-content mb-4">
                                        {profile?.$user?.email || 'john.doe@example.com'}
                                    </p>
                                    <Button
                                        variant="outline"
                                        className="w-full glass border-white/20 dark:border-white/10 hover:bg-white/10 dark:hover:bg-white/5 text-primary-content"
                                        onClick={() => setIsProfileModalOpen(true)}
                                    >
                                        {t('dashboard.editProfile', 'Edit Profile')}
                                    </Button>
                                </div>
                            </Card>
                        </div>

                        {/* Recent Activity */}
                        <div className="lg:col-span-2">
                            <Card className="glass p-6 border-0 animate-slide-up" style={{ animationDelay: '800ms' }}>
                                <h3 className="text-2xl font-semibold text-primary-content mb-6">
                                    {t('dashboard.recentActivity', 'Recent Activity')}
                                </h3>
                                <div className="space-y-4">
                                    {recentActivities.map((activity, index) => (
                                        <div
                                            key={index}
                                            className="flex items-center space-x-4 p-4 rounded-lg glass-strong"
                                        >
                                            <div
                                                className={`w-3 h-3 rounded-full ${
                                                    activity.type === 'create'
                                                        ? 'bg-green-400'
                                                        : activity.type === 'complete'
                                                        ? 'bg-blue-400'
                                                        : activity.type === 'update'
                                                        ? 'bg-yellow-400'
                                                        : 'bg-purple-400'
                                                }`}
                                            />
                                            <div className="flex-1">
                                                <p className="text-primary-content">{activity.action}</p>
                                                <p className="text-sm text-secondary-content">{activity.time}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="mt-8">
                        <Card className="glass p-6 border-0 animate-slide-up" style={{ animationDelay: '1000ms' }}>
                            <h3 className="text-2xl font-semibold text-primary-content mb-6">
                                {t('dashboard.quickActions', 'Quick Actions')}
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <Button className="h-16 glass-strong border-white/20 dark:border-white/10 hover:bg-white/10 dark:hover:bg-white/5 justify-start text-primary-content">
                                    <div className="w-8 h-8 bg-lemon-gradient rounded-lg flex items-center justify-center mr-3">
                                        <BarChart3 className="w-4 h-4 text-white" />
                                    </div>
                                    {t('dashboard.actions.newProject', 'Create New Project')}
                                </Button>
                                <Button className="h-16 glass-strong border-white/20 dark:border-white/10 hover:bg-white/10 dark:hover:bg-white/5 justify-start text-primary-content">
                                    <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center mr-3">
                                        <Activity className="w-4 h-4 text-white" />
                                    </div>
                                    {t('dashboard.actions.newTask', 'Add New Task')}
                                </Button>
                                <Button className="h-16 glass-strong border-white/20 dark:border-white/10 hover:bg-white/10 dark:hover:bg-white/5 justify-start text-primary-content">
                                    <div className="w-8 h-8 bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg flex items-center justify-center mr-3">
                                        <TrendingUp className="w-4 h-4 text-white" />
                                    </div>
                                    {t('dashboard.actions.analytics', 'View Analytics')}
                                </Button>
                            </div>
                        </Card>
                    </div>
                </div>
            </div>
            <ProfileEditModal isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)} />
        </>
    );
};
