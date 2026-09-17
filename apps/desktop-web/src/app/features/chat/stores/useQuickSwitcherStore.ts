import { createOpenStateStore } from '../../../shared/stores/createOpenStateStore';

/** Open state of the Cmd/Ctrl+K switcher, shared so the shell's menu bar can open it too. */
export const useQuickSwitcherStore = createOpenStateStore();
