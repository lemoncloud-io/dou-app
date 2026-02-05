import { useMemo } from 'react';

import { buildQueryString } from '../utils';

export const useQueryString = (params: Record<string, any> = {}) => {
    return useMemo(() => {
        return buildQueryString(params);
    }, [JSON.stringify(params)]);
};
