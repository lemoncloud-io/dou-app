import { createOpenStateStore } from '../../../shared/stores/createOpenStateStore';

/**
 * Open state for the keyboard-shortcut sheet. A store, not local state, so the
 * sheet can be opened from a menu as well as by pressing `?` — the key alone was
 * the only door, and nothing on screen said it existed.
 */
export const useShortcutsDialogStore = createOpenStateStore();
