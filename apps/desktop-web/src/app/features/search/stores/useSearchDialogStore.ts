import { createOpenStateStore } from '../../../shared/stores/createOpenStateStore';

/** Open state of the message SearchDialog — shared so the channel header's search button and Mod+Shift+F drive one dialog. */
export const useSearchDialogStore = createOpenStateStore();
