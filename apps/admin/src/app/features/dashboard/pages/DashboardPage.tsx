import { LayoutDashboard, Settings, Users } from 'lucide-react';

import { Button } from '@chatic/ui-kit/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@chatic/ui-kit/components/ui/card';
import { useWebCoreStore } from '@chatic/web-core';

export const DashboardPage = (): JSX.Element => {
    const profile = useWebCoreStore(state => state.profile);

    const stats = [
        { label: 'Total Users', value: '2,847', icon: Users },
        { label: 'Active Sessions', value: '124', icon: LayoutDashboard },
        { label: 'Pending Tasks', value: '18', icon: Settings },
    ];

    return (
        <div className="p-6">
            {/* Welcome */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold mb-2">Welcome, {profile?.nick || 'Admin'}</h1>
                <p className="text-muted-foreground">Admin dashboard overview</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                {stats.map(stat => (
                    <Card key={stat.label}>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
                            <stat.icon className="w-4 h-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-bold">{stat.value}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Quick Actions */}
            <Card>
                <CardHeader>
                    <CardTitle>Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="flex gap-3">
                    <Button>
                        <Users className="w-4 h-4 mr-2" />
                        Manage Users
                    </Button>
                    <Button variant="outline">
                        <LayoutDashboard className="w-4 h-4 mr-2" />
                        View Analytics
                    </Button>
                    <Button variant="outline">
                        <Settings className="w-4 h-4 mr-2" />
                        Settings
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
};
