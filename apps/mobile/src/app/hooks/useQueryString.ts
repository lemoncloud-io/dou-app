import { buildQueryString } from '../utils';

/**
 * A custom hook that converts an object of parameters into a URL query string.
 * @param params An object of key-value pairs to convert into a query string.
 * @returns The converted query string (e.g., "key1=value1&key2=value2").
 */
export const useQueryString = (params: Record<string, any> = {}): string => {
    return buildQueryString(params);
};
