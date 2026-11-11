import { runtime } from '@chatic/app-runtime';

/**
 * Reads the name of a cloud this browser entered through a pairing, once per entry, so home's header
 * and the switch sheet stop naming it by its id. Mounted once under AppRuntime, in the browser and the
 * shells alike — pairing is not a native-only path, unlike the invited-cloud durability next to it.
 */
export const PairedCloudNameRunner = (): null => {
    runtime.data.usePairedCloudNameSync();
    return null;
};
