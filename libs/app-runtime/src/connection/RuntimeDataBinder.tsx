import { useEffect, useRef } from 'react';
import { getDataManager } from '../data/runtime';
import type { RuntimeBinding } from '../runtime/useRuntimeBinding';

export interface RuntimeDataBinderProps {
    binding: RuntimeBinding;
}

export const RuntimeDataBinder = ({ binding }: RuntimeDataBinderProps) => {
    const dataManager = getDataManager();
    const prevContextRef = useRef<string>('');

    useEffect(() => {
        const currentContextStr = JSON.stringify(binding.context);
        if (prevContextRef.current !== currentContextStr) {
            prevContextRef.current = currentContextStr;
            dataManager.ensure(binding.context);
        }
    }, [binding.context, dataManager]);

    return null;
};
