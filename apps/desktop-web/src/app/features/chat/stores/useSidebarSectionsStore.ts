import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { deviceStore, persistStorageOver } from '../../../storage';

interface SidebarSectionsState {
    collapsed: Record<string, true>;
    toggle: (sectionId: string) => void;
}

export const useSidebarSectionsStore = create<SidebarSectionsState>()(
    persist(
        set => ({
            collapsed: {},
            toggle: sectionId =>
                set(state => {
                    if (!state.collapsed[sectionId]) return { collapsed: { ...state.collapsed, [sectionId]: true } };
                    const { [sectionId]: _open, ...rest } = state.collapsed;
                    return { collapsed: rest };
                }),
        }),
        { name: 'chatic-sidebar-sections', storage: persistStorageOver(deviceStore) }
    )
);
