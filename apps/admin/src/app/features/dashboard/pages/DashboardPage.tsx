import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { LayoutDashboard, LogOut, Settings, Users } from 'lucide-react';

import { Button } from '@chatic/ui-kit/components/ui/button';
import { Card } from '@chatic/ui-kit/components/ui/card';
import { useWebCoreStore } from '@chatic/web-core';

import { SettingsControl } from '../../../shared';

export const DashboardPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const profile = useWebCoreStore(state => state.profile);

    const handleLogout = () => {
        navigate('/auth/logout');
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
            {/* Header */}
            <header className="border-b border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                            <LayoutDashboard className="w-5 h-5 text-white" />
                        </div>
                        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Admin Dashboard</h1>
                    </div>
                    <div className="flex items-center gap-4">
                        <SettingsControl />
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleLogout}
                            className="text-slate-600 dark:text-slate-400"
                        >
                            <LogOut className="w-4 h-4 mr-2" />
                            {t('common.logout', 'Logout')}
                        </Button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-6 py-8">
                {/* Welcome Section */}
                <div className="mb-8">
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                        {t('dashboard.welcome', 'Welcome back')}, {profile?.nick || 'Admin'}!
                    </h2>
                    <p className="text-slate-600 dark:text-slate-400">
                        {t('dashboard.subtitle', "Here's what's happening with your platform today.")}
                    </p>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    <Card className="p-6 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                                <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                    {t('dashboard.totalUsers', 'Total Users')}
                                </p>
                                <p className="text-2xl font-bold text-slate-900 dark:text-white">0</p>
                            </div>
                        </div>
                    </Card>

                    <Card className="p-6 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
                                <Settings className="w-6 h-6 text-green-600 dark:text-green-400" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                    {t('dashboard.activeServices', 'Active Services')}
                                </p>
                                <p className="text-2xl font-bold text-slate-900 dark:text-white">0</p>
                            </div>
                        </div>
                    </Card>

                    <Card className="p-6 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center">
                                <LayoutDashboard className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                    {t('dashboard.sessions', 'Sessions')}
                                </p>
                                <p className="text-2xl font-bold text-slate-900 dark:text-white">0</p>
                            </div>
                        </div>
                    </Card>

                    <Card className="p-6 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-xl flex items-center justify-center">
                                <Settings className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                    {t('dashboard.pending', 'Pending')}
                                </p>
                                <p className="text-2xl font-bold text-slate-900 dark:text-white">0</p>
                            </div>
                        </div>
                    </Card>
                </div>

                {/* Content Placeholder */}
                <Card className="p-8 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                    <div className="text-center">
                        <LayoutDashboard className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
                            {t('dashboard.getStarted', 'Get Started')}
                        </h3>
                        <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                            {t(
                                'dashboard.placeholder',
                                'Your admin dashboard is ready. Start managing your platform by exploring the features.'
                            )}
                        </p>
                    </div>
                </Card>
            </main>
        </div>
    );
};
