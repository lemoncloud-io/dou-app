import { createOpenStateStore } from '../../../shared/stores/createOpenStateStore';

/** Open state of the "new place" dialog: the place rail opens it, the home page renders it. */
export const useCreatePlaceDialogStore = createOpenStateStore();
