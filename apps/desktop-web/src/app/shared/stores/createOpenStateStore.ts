import { create } from 'zustand';

export interface OpenState {
    isOpen: boolean;
    setOpen: (open: boolean) => void;
    toggle: () => void;
}

export const createOpenStateStore = () =>
    create<OpenState>(set => ({
        isOpen: false,
        setOpen: isOpen => set({ isOpen }),
        toggle: () => set(state => ({ isOpen: !state.isOpen })),
    }));
