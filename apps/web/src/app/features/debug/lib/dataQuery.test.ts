import { applyFilter, EMPTY_FILTER, fieldNamesOf, matchesFilter, type RecordFilter } from './dataQuery';

const rows = [
    { id: 'a', name: 'Alpha Room', chatNo: 3, pinned: true, $join: { nick: 'kim' } },
    { id: 'b', name: 'Beta', chatNo: 12, pinned: false },
    { id: 'c', name: '', chatNo: '7' },
    { id: 'd', chatNo: null },
];

const ids = (filter: Partial<RecordFilter>) => applyFilter(rows, { ...EMPTY_FILTER, ...filter }).map(row => row.id);

describe('applyFilter', () => {
    it('keeps every record, in order, for the empty filter', () => {
        expect(ids({})).toEqual(['a', 'b', 'c', 'd']);
    });

    it('matches the text anywhere in the record, case-insensitively, nested fields included', () => {
        expect(ids({ text: 'ALPHA' })).toEqual(['a']);
        expect(ids({ text: 'kim' })).toEqual(['a']);
    });

    it('filters one field by what it contains', () => {
        expect(ids({ field: 'name', value: 'ET' })).toEqual(['b']);
        expect(ids({ field: 'pinned', value: 'true' })).toEqual(['a']);
        expect(ids({ field: 'chatNo', value: '7' })).toEqual(['c']);
    });

    it('filters nothing while the field or its value is still empty', () => {
        expect(ids({ field: 'name' })).toEqual(['a', 'b', 'c', 'd']);
        expect(ids({ value: 'beta' })).toEqual(['a', 'b', 'c', 'd']);
    });

    it('applies the text and the field filter together', () => {
        expect(ids({ text: 'room', field: 'chatNo', value: '12' })).toEqual([]);
    });

    it('sorts numerically both ways, numeric strings included, and keeps absent values last', () => {
        expect(ids({ sortField: 'chatNo' })).toEqual(['a', 'c', 'b', 'd']);
        expect(ids({ sortField: 'chatNo', descending: true })).toEqual(['b', 'c', 'a', 'd']);
    });

    it('sorts text by locale', () => {
        expect(ids({ sortField: 'name', descending: true })).toEqual(['b', 'a', 'c', 'd']);
    });

    it('does not reorder the array it was handed', () => {
        const input = [...rows];
        applyFilter(input, { ...EMPTY_FILTER, sortField: 'chatNo', descending: true });
        expect(input.map(row => row.id)).toEqual(['a', 'b', 'c', 'd']);
    });
});

describe('helpers', () => {
    it('matchesFilter reads a missing field as empty text', () => {
        expect(matchesFilter({ id: 'x' }, { ...EMPTY_FILTER, field: 'name', value: 'a' })).toBe(false);
    });

    it('fieldNamesOf lists the top-level fields sorted', () => {
        expect(fieldNamesOf(rows)).toEqual(['$join', 'chatNo', 'id', 'name', 'pinned']);
    });
});
