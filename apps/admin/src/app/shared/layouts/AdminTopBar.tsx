import { LogOut, Menu } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { useWebCoreStore } from '@chatic/web-core';

import { SettingsControl } from '../components/SettingsControl';
import { useSidebarStore } from '../stores';

export const AdminTopBar = (): JSX.Element => {
    const { toggleMobileMenu } = useSidebarStore();
    const { logout, profile } = useWebCoreStore();

    return (
        <header
            className={cn('h-16 border-b border-border bg-card shrink-0', 'flex items-center justify-between px-4')}
        >
            {/* Left: Mobile Menu Toggle */}
            <div className="flex items-center gap-4">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleMobileMenu}
                    className="lg:hidden"
                    aria-label="Toggle menu"
                >
                    <Menu className="h-5 w-5" />
                </Button>
            </div>

            {/* Right: User Actions */}
            <div className="flex items-center gap-2">
                {profile && (
                    <span className="hidden sm:block text-sm text-muted-foreground mr-2">
                        {profile.nick || profile.name || 'Admin'}
                    </span>
                )}

                <SettingsControl />

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={logout}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Logout"
                >
                    <LogOut className="h-5 w-5" />
                </Button>
            </div>
        </header>
    );
};
