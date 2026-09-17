import { create } from 'zustand';

interface QuickSwitcherState {
    isOpen: boolean;
    setOpen: (open: boolean) => void;
    toggle: () => void;
}

/** Open state of the Cmd/Ctrl+K switcher, shared so the shell's menu bar can open it too. */
export const useQuickSwitcherStore = create<QuickSwitcherState>(set => ({
    isOpen: false,
    setOpen: isOpen => set({ isOpen }),
    toggle: () => set(state => ({ isOpen: !state.isOpen })),
}));
