import { useEffect, useState } from 'react';

import { runtime } from '@chatic/runtime-react';

export const useCachedCloudNames = (): Record<string, string> => {
    const { cloud } = runtime.data.useRuntimeRepositories();
    const [names, setNames] = useState<Record<string, string>>({});

    useEffect(() => {
        return cloud.observeList(result => {
            const next: Record<string, string> = {};
            for (const cached of result?.list ?? []) {
                if (cached.id && cached.name) next[cached.id] = cached.name;
            }
            setNames(next);
        });
    }, [cloud]);

    return names;
};
