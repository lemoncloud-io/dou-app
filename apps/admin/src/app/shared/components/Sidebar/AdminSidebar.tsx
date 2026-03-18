import { PanelLeft, PanelLeftClose } from 'lucide-react';

import { Logo } from '@chatic/assets';
import { cn } from '@chatic/lib/utils';
import { ScrollArea } from '@chatic/ui-kit/components/ui/scroll-area';
import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import { SidebarNavItem } from './SidebarNavItem';
import { adminMenuItems } from '../../config/menuConfig';
import { useSidebarStore } from '../../stores';

export const AdminSidebar = (): JSX.Element => {
    const { isSidebarCollapsed, isHoverExpanded, setHoverExpanded, toggleSidebar, setMobileMenuOpen } =
        useSidebarStore();

    const isEffectivelyCollapsed = isSidebarCollapsed && !isHoverExpanded;

    return (
        <TooltipProvider delayDuration={0}>
            <aside
                className={cn(
                    'h-full bg-card border-r border-border transition-all duration-300 ease-in-out flex flex-col',
                    'w-64',
                    isEffectivelyCollapsed && 'lg:w-[72px]'
                )}
                onMouseEnter={() => isSidebarCollapsed && setHoverExpanded(true)}
                onMouseLeave={() => setHoverExpanded(false)}
                role="navigation"
                aria-label="Main navigation"
            >
                {/* Header */}
                <div
                    className={cn(
                        'flex items-center h-16 px-4 border-b border-border shrink-0',
                        isEffectivelyCollapsed && 'justify-center px-2'
                    )}
                >
                    <div className="flex items-center gap-3">
                        <img src={Logo.purpleSymbol} alt="DoU" className="h-8 w-8" />
                        {!isEffectivelyCollapsed && (
                            <span className="text-lg font-semibold text-foreground">DoU Admin</span>
                        )}
                    </div>
                </div>

                {/* Navigation */}
                <ScrollArea className="flex-1 py-4">
                    <nav className={cn('space-y-1', isEffectivelyCollapsed ? 'px-2' : 'px-3')}>
                        {adminMenuItems.map(item => (
                            <SidebarNavItem key={item.path} item={item} isCollapsed={isEffectivelyCollapsed} />
                        ))}
                    </nav>
                </ScrollArea>

                {/* Footer - Collapse Toggle (Desktop only) */}
                <div className="hidden lg:flex items-center justify-end p-3 border-t border-border shrink-0">
                    <button
                        type="button"
                        onClick={() => {
                            toggleSidebar();
                            setHoverExpanded(false);
                        }}
                        className={cn(
                            'p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors',
                            isEffectivelyCollapsed && 'mx-auto'
                        )}
                        aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        {isSidebarCollapsed ? (
                            <PanelLeft className="h-5 w-5" />
                        ) : (
                            <PanelLeftClose className="h-5 w-5" />
                        )}
                    </button>
                </div>

                {/* Mobile Close Button */}
                <div className="lg:hidden flex items-center justify-center p-3 border-t border-border shrink-0">
                    <button
                        type="button"
                        onClick={() => setMobileMenuOpen(false)}
                        className="w-full py-2 px-4 rounded-lg bg-accent text-accent-foreground font-medium"
                    >
                        Close Menu
                    </button>
                </div>
            </aside>
        </TooltipProvider>
    );
};
