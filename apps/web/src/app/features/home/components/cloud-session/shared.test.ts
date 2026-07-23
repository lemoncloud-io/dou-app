import { sortCloudsForSwitcher } from './shared';

interface TestCloud {
    id?: string;
    createdAt?: number;
}

describe('sortCloudsForSwitcher — 클라우드 스위처 정렬', () => {
    it('선택된 클라우드를 최상단에 고정한다', () => {
        const list: TestCloud[] = [
            { id: 'a', createdAt: 300 },
            { id: 'b', createdAt: 200 },
            { id: 'c', createdAt: 100 },
        ];
        expect(sortCloudsForSwitcher(list, 'c').map(c => c.id)).toEqual(['c', 'a', 'b']);
    });

    it('선택 외에는 생성순(createdAt) 내림차순으로 정렬한다', () => {
        const list: TestCloud[] = [
            { id: 'old', createdAt: 100 },
            { id: 'new', createdAt: 300 },
            { id: 'mid', createdAt: 200 },
        ];
        expect(sortCloudsForSwitcher(list, null).map(c => c.id)).toEqual(['new', 'mid', 'old']);
    });

    it('createdAt이 없는 항목은 마지막으로 정렬한다', () => {
        const list: TestCloud[] = [{ id: 'none' }, { id: 'has', createdAt: 100 }];
        expect(sortCloudsForSwitcher(list, null).map(c => c.id)).toEqual(['has', 'none']);
    });

    it('원본 배열을 변경하지 않는다 (view-only)', () => {
        const list: TestCloud[] = [
            { id: 'a', createdAt: 100 },
            { id: 'b', createdAt: 200 },
        ];
        const snapshot = list.map(c => c.id);
        sortCloudsForSwitcher(list, 'a');
        expect(list.map(c => c.id)).toEqual(snapshot);
    });

    it('selectedId가 없으면 생성순만 적용한다', () => {
        const list: TestCloud[] = [
            { id: 'a', createdAt: 100 },
            { id: 'b', createdAt: 200 },
        ];
        expect(sortCloudsForSwitcher(list).map(c => c.id)).toEqual(['b', 'a']);
    });
});
