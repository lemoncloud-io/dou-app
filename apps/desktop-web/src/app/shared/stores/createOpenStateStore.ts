import { create } from 'zustand';

export interface OpenState {
    isOpen: boolean;
    setOpen: (open: boolean) => void;
    toggle: () => void;
}

/**
 * Open state for a dialog that more than one place can open (a key, a button,
 * the shell's menu bar), so it lives in a store rather than in the dialog.
 */
export const createOpenStateStore = () =>
    create<OpenState>(set => ({
        isOpen: false,
        setOpen: isOpen => set({ isOpen }),
        toggle: () => set(state => ({ isOpen: !state.isOpen })),
    }));
