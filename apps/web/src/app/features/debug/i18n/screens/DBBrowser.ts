import { defineDebugStrings } from '../define';

const en = {
    cacheTables: 'Cache Tables',
    typeCard: {
        loading: 'Loading...',
        rows: (count: number) => `${count} ${count === 1 ? 'row' : 'rows'}`,
    },
    rowItem: {
        edit: 'Edit',
        delete: 'Delete',
    },
    detail: {
        backToList: '← List',
        newRowTemplate: '+ New row (template)',
        cancelEditing: 'Cancel editing',
        addEditData: 'Add/edit data',
        clearAll: 'Clear all',
        confirm: 'Confirm',
        cancel: 'Cancel',
        addEditDataJson: 'Add/edit data (JSON)',
        save: 'Save',
        rows: (count: number) => `${count} ${count === 1 ? 'row' : 'rows'}`,
        copyAll: 'Copy all',
        noResults: 'No results',
        querying: 'Querying...',
    },
};

const ko: typeof en = {
    cacheTables: '캐시 테이블',
    typeCard: {
        loading: '로딩 중...',
        rows: count => `${count}건`,
    },
    rowItem: {
        edit: '수정',
        delete: '삭제',
    },
    detail: {
        backToList: '← 목록',
        newRowTemplate: '+ 새 행(템플릿)',
        cancelEditing: '작성 취소',
        addEditData: '데이터 추가/수정',
        clearAll: '전체삭제',
        confirm: '확인',
        cancel: '취소',
        addEditDataJson: '데이터 추가/수정 (JSON)',
        save: '저장',
        rows: count => `${count}건`,
        copyAll: '전체 복사',
        noResults: '결과 없음',
        querying: '조회 중...',
    },
};

export const useDBBrowserStrings = defineDebugStrings({ ko, en });
