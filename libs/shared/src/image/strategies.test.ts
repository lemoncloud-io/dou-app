import { dataUrlStrategy, fileStrategy, OUTPUT_STRATEGIES } from './strategies';

// The pipelines are covered through prepareImage. What is pinned here is the registry: that a form
// resolves to exactly one strategy — the lookup replaced a switch, and a switch could not miss.

describe('OUTPUT_STRATEGIES — 레지스트리', () => {
    it('전략이 자기 키와 같은 as를 든다', () => {
        Object.entries(OUTPUT_STRATEGIES).forEach(([key, strategy]) => expect(strategy.as).toBe(key));
    });

    it('두 출력 형태가 각자 다른 전략으로 간다', () => {
        expect(OUTPUT_STRATEGIES.file).toBe(fileStrategy);
        expect(OUTPUT_STRATEGIES.dataUrl).toBe(dataUrlStrategy);
        expect(fileStrategy).not.toBe(dataUrlStrategy);
    });
});
