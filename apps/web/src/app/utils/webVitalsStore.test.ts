import { getVitals, reportVital } from './webVitalsStore';

describe('webVitalsStore — 최신 Web Vitals 보관', () => {
    it('지표를 이름별 최신값으로 보관한다', () => {
        reportVital('LCP', 1234.5, 'needs-improvement');
        reportVital('LCP', 980.1, 'good');
        expect(getVitals().LCP).toEqual({ value: 980.1, rating: 'good' });
    });

    it('스냅샷은 복사본이라 외부 변경이 내부 상태를 오염시키지 않는다', () => {
        reportVital('CLS', 0.01, 'good');
        const snap = getVitals();
        snap.CLS = { value: 999, rating: 'poor' };
        expect(getVitals().CLS.value).toBe(0.01);
    });
});
