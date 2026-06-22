import { useEffect } from 'react';
import type { RuntimeBinding } from '../runtime';
import { getSyncRuntime } from '../sync/runtime';

export interface RuntimeSyncBinderProps {
    binding: RuntimeBinding;
}

export const RuntimeSyncBinder = ({ binding }: RuntimeSyncBinderProps) => {
    useEffect(() => {
        const syncRuntime = getSyncRuntime();
        syncRuntime.controller.ensure(binding);

        if (!binding.socket) {
            syncRuntime.controller.stop();
            return;
        }

        void syncRuntime.controller.start();

        return () => {
            syncRuntime.controller.stop();
        };
    }, [binding]);

    return null;
};
