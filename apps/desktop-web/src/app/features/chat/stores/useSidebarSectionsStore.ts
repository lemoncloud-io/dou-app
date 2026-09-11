import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SidebarSectionsState {
    /** Section ids the user folded shut (`fav` · `ch` · `dm`). A UI preference, so it outlives logout. */
    collapsed: Record<string, true>;
    toggle: (sectionId: string) => void;
}

/** Which sidebar sections are folded — remembered so the sidebar reopens the way it was left. */
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
        { name: 'chatic-sidebar-sections' }
    )
);
