import { config } from '@chatic/config';
import type { StorageLike } from '@chatic/runtime-react';

export const wireTestSettings = (storage: { local: StorageLike; session: StorageLike }): void => {
    config.init({
        env: { stage: () => 'PROD', buildStage: () => 'PROD', platform: () => 'web', raw: () => undefined },
        storage,
    });
};
