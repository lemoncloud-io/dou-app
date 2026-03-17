import { buildQueryString } from '../utils';

/**
 * 객체 형태의 파라미터를 URL 쿼리 스트링 문자열로 변환하는 커스텀 훅
 * @param params  쿼리 스트링으로 변환할 키-값 쌍의 객체
 * @returns 변환된 쿼리 스트링 문자열 (예: "key1=value1&key2=value2")
 */
export const useQueryString = (params: Record<string, any> = {}): string => {
    return buildQueryString(params);
};
