import { runtime } from '@chatic/runtime';

export const PairedCloudNameRunner = (): null => {
    runtime.data.usePairedCloudNameSync();
    return null;
};
