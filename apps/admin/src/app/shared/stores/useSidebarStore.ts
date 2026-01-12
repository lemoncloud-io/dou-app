import { create } from 'zustand';

interface SidebarState {
    isSidebarCollapsed: boolean;
    isHoverExpanded: boolean;
    isMobileMenuOpen: boolean;
    toggleSidebar: () => void;
    setHoverExpanded: (expanded: boolean) => void;
    toggleMobileMenu: () => void;
    setMobileMenuOpen: (open: boolean) => void;
}

export const useSidebarStore = create<SidebarState>(set => ({
    isSidebarCollapsed: true,
    isHoverExpanded: false,
    isMobileMenuOpen: false,
    toggleSidebar: () => set(state => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
    setHoverExpanded: expanded => set({ isHoverExpanded: expanded }),
    toggleMobileMenu: () => set(state => ({ isMobileMenuOpen: !state.isMobileMenuOpen })),
    setMobileMenuOpen: open => set({ isMobileMenuOpen: open }),
}));
