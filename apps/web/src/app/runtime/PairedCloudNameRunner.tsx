import { runtime } from '@chatic/runtime-react';

export const PairedCloudNameRunner = (): null => {
    runtime.data.usePairedCloudNameSync();
    return null;
};
