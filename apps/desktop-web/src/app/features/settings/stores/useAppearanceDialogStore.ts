import { createOpenStateStore } from '../../../shared/stores/createOpenStateStore';

/**
 * Open state for the Appearance dialog. A store, not local state, because the door is the account
 * menu in the nav rail while the dialog is mounted once at the router, away from it.
 */
export const useAppearanceDialogStore = createOpenStateStore();
