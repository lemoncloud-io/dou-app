import { Outlet } from 'react-router-dom';

import { cn } from '@lemon/ui-kit';

import { Header } from './Header';
import { Sidebar } from './Sidebar';

export const AdminLayout = () => {
    return (
        <div className="min-h-screen flex flex-col">
            <Header />
            <div className="flex flex-1">
                <Sidebar />
                <main className={cn('flex-1 p-6 bg-background/95 transition-all duration-300 ml-0')}>
                    <Outlet />
                </main>
            </div>
        </div>
    );
};
