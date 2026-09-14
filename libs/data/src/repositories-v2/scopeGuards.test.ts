import { isCidActive, isForeignContext } from './scopeGuards';

// 인라인 6곳을 함수로 바꾸는 교체라, 각 위치의 스킵/통과 케이스를 1:1로 보존하는 표를 먼저 못박는다
// (설계문서 §검증 방법 — 특히 ChannelRepositoryV2:326의 부정 반전).
describe('isForeignContext', () => {
    it.each`
        cid          | socketCid    | expected | why
        ${'c1'}      | ${'c1'}      | ${false} | ${'같은 클라우드 — 정상 구간'}
        ${'c2'}      | ${'c1'}      | ${true}  | ${'전환 낙관 창 — cid는 이미 뒤집혔고 소켓은 아직 옛 클라우드'}
        ${'c1'}      | ${undefined} | ${false} | ${'바인드된 소켓이 없으면 어긋날 상대가 없다 (부팅)'}
        ${undefined} | ${'default'} | ${false} | ${'cid 부재는 default 파티션 그 자체다'}
        ${undefined} | ${'c1'}      | ${true}  | ${'default 스코프인데 소켓은 클라우드에 바인드'}
        ${'default'} | ${'default'} | ${false} | ${'명시적 default끼리'}
        ${'default'} | ${'c1'}      | ${true}  | ${'relay 스코프인데 소켓은 클라우드'}
    `('cid=$cid socketCid=$socketCid → $expected ($why)', ({ cid, socketCid, expected }) => {
        expect(isForeignContext({ cid, socketCid })).toBe(expected);
    });

    it('ChannelRepositoryV2.getSelfChannel의 부정 반전과 일치한다 — 쓰기 조건은 !isForeignContext', () => {
        // 원본: `socketCid == null || (cid || 'default') === socketCid` 일 때 캐시 쓰기
        const shouldWrite = (cid?: string, socketCid?: string) => !isForeignContext({ cid, socketCid });

        expect(shouldWrite('c1', 'c1')).toBe(true);
        expect(shouldWrite('c1', undefined)).toBe(true);
        expect(shouldWrite('c2', 'c1')).toBe(false);
    });
});

describe('isCidActive', () => {
    it.each`
        targetCid | boundCid | expected | why
        ${null}   | ${'c1'}  | ${true}  | ${'클라우드 스코프가 아닌 작업은 항상 유효'}
        ${null}   | ${null}  | ${true}  | ${'바인드가 없어도 마찬가지'}
        ${'c1'}   | ${'c1'}  | ${true}  | ${'대상과 바인드가 같다'}
        ${'c1'}   | ${'c2'}  | ${false} | ${'다른 클라우드로 바인드된 상태'}
        ${'c1'}   | ${null}  | ${false} | ${'바인드가 없으면 특정 클라우드 대상 작업은 유효하지 않다'}
    `('target=$targetCid bound=$boundCid → $expected ($why)', ({ targetCid, boundCid, expected }) => {
        expect(isCidActive(targetCid, boundCid)).toBe(expected);
    });
});
