import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * ADR-0070 결정 2 불변조건 1·2 — refresh 실행은 `ClientSocketAuth` 단독 소유.
 *
 * 이 리포에는 이제 refresh 엔드포인트를 치는 코드가 **없다**. 그래서 "정당 호출부만 부른다"를
 * 경로 패턴으로 지키던 이전 장치를 **부재로** 대체한다 — `libs/http/src/gateways/refreshAbsence.spec.ts`가
 * 게이트웨이 디렉토리에 대해 하는 것과 같은 방식이고, 훨씬 강하다: 심볼이 어디로 옮겨가든,
 * 누가 새 파일을 만들든 걸린다.
 *
 * 이전 장치(ESLint no-restricted-imports)는 경로 문자열에 의존해서 심볼이 이동하자 조용히
 * 죽었다. 부재 검사는 그 실패 양식 자체가 없다.
 */
const SRC = join(__dirname, '..');

const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap(entry => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) return walk(full);
        return full.endsWith('.ts') || full.endsWith('.tsx') ? [full] : [];
    });

describe('refresh 부재 게이트', () => {
    it('app-runtime 어디에도 refresh 엔드포인트 경로가 없다', () => {
        const offenders = walk(SRC)
            .filter(file => !file.endsWith(__filename.split('/').pop() as string))
            .filter(file => {
                const content = readFileSync(file, 'utf8');
                // 주석이 아니라 실제 경로 문자열만 — 템플릿/문자열 안의 `/refresh`.
                return /["'`][^"'`\n]*\/refresh\b/.test(content);
            })
            .map(file => file.slice(SRC.length + 1));

        expect(offenders).toEqual([]);
    });
});
