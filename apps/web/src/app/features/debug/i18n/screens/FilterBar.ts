import { defineDebugStrings } from '../define';

/** The filter and sort controls the Storage and DB screens share (`components/FilterBar`). */
const en = {
    search: 'Search',
    searchPlaceholder: 'Text anywhere in the record',
    field: 'Filter field',
    anyField: 'No field filter',
    value: 'Contains',
    sortBy: 'Sort by',
    noSort: 'Stored order',
    ascending: 'Ascending',
    descending: 'Descending',
    reset: 'Reset',
    shown: (shown: number, total: number) => (shown === total ? `${total}` : `${shown} of ${total}`),
};

const ko: typeof en = {
    search: '검색',
    searchPlaceholder: '레코드 어디든 포함된 텍스트',
    field: '필터 필드',
    anyField: '필드 필터 없음',
    value: '포함',
    sortBy: '정렬',
    noSort: '저장된 순서',
    ascending: '오름차순',
    descending: '내림차순',
    reset: '초기화',
    shown: (shown, total) => (shown === total ? `${total}` : `${total}개 중 ${shown}`),
};

export const useFilterBarStrings = defineDebugStrings({ ko, en });
