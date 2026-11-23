import { buildQueryString } from '../utils';

export const useQueryString = (params: Record<string, any> = {}): string => {
    return buildQueryString(params);
};
