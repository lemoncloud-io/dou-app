import { create } from 'zustand';

interface SearchDialogState {
    isOpen: boolean;
    setOpen: (open: boolean) => void;
    toggle: () => void;
}

/** Open state of the message SearchDialog — shared so the channel header's search button and Mod+Shift+F drive one dialog. */
export const useSearchDialogStore = create<SearchDialogState>(set => ({
    isOpen: false,
    setOpen: isOpen => set({ isOpen }),
    toggle: () => set(state => ({ isOpen: !state.isOpen })),
}));
