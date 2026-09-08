import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

/**
 * 훅은 자기 모듈의 `hooks/` 폴더에 있다 — 예외 없이.
 *
 * 규칙이 아니라 관례였을 때 훅은 다섯 모양으로 흩어져 있었다: `runtime/`은 폴더 전체가 훅이었고,
 * `connection/`은 훅과 `.tsx` 컴포넌트가 섞여 있었고, `push/`는 루트에 한 개, 그러면서
 * `data/hooks/` · `session/hooks/` · `socket/sync/hooks/`는 이미 하위 폴더를 쓰고 있었다. 어느
 * 배치도 틀리지 않았고, 그게 문제였다 — 새 훅을 어디에 둘지 결정할 근거가 매번 그 폴더의
 * 과거뿐이었다.
 *
 * 리포 전체 관례가 이미 `hooks/`다 (`libs/shared/src/hooks` · `libs/device-utils/src/hooks` ·
 * `libs/theme/src/hooks` + 앱 feature 폴더 다수). 이 검사는 그 관례를 이 패키지에서 기계적으로
 * 확인 가능한 규칙으로 바꾼다.
 *
 * 판정은 파일명이다: `use*`로 시작하는 소스 파일은 경로에 `hooks/`가 있어야 한다. 역방향은 보지
 * 않는다 — `hooks/` 안에 훅이 아닌 파일(`queryKeys.ts` · `mutationKeys.ts`)이 있는 것은 그 훅들이
 * 쓰는 상수라서 정상이다.
 */
const SRC = join(__dirname);

const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap(entry => {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) return sourceFiles(path);
        if (!/\.tsx?$/.test(entry) || /\.(test|spec)\.tsx?$/.test(entry)) return [];
        return [path];
    });

describe('app-runtime — 훅 배치', () => {
    it('use* 파일은 전부 hooks/ 안에 있다', () => {
        const misplaced = sourceFiles(SRC)
            .map(file => relative(SRC, file))
            .filter(file => /(^|[\\/])use[A-Z]/.test(file))
            .filter(file => !file.split(sep).slice(0, -1).includes('hooks'))
            .sort();

        // 어긴 파일을 이름으로 출력한다 — 개수만 틀리면 어디를 옮겨야 하는지 알 수 없다.
        expect(misplaced).toEqual([]);
    });

    /**
     * 파일명 검사만으로는 **파일 안에 선언된 훅**을 놓친다. 실제로 놓쳤다:
     * `data/invitedCloudDurability.ts`가 `useInvitedCloudNameSync`를 export하고 있었고, 그 파일은
     * `use*`로 시작하지 않으므로 위 검사를 그냥 통과했다. 가드가 규칙보다 좁으면 규칙은 지켜지지
     * 않는다.
     *
     * **export된** 훅만 본다. `SocketBinder.tsx`의 `useSameWssSwitchGuard`·`useSocketSlot`처럼
     * 그 컴포넌트만 쓰는 지역 훅은 파일 밖으로 나갈 수 없으므로 배치 문제가 아니다 — 컴포넌트를
     * 나누어 쓰는 정상적인 React 조립이다.
     */
    it('export된 훅은 선언 위치까지 hooks/ 안이다', () => {
        const declaredOutside = sourceFiles(SRC)
            .filter(file => !relative(SRC, file).split(sep).slice(0, -1).includes('hooks'))
            .flatMap(file =>
                readFileSync(file, 'utf8')
                    .split('\n')
                    .filter(line => /^export (const|function) use[A-Z]/.test(line))
                    .map(line => `${relative(SRC, file)}: ${line.trim().slice(0, 60)}`)
            )
            .sort();

        expect(declaredOutside).toEqual([]);
    });

    it('훅을 가진 모듈은 모두 hooks/ 폴더로 그것을 표현한다', () => {
        const hookFolders = sourceFiles(SRC)
            .map(file => relative(SRC, file))
            .filter(file => file.split(sep).includes('hooks'))
            .map(file => file.split(sep).slice(0, file.split(sep).indexOf('hooks')).join('/') || '<root>')
            .filter((value, index, all) => all.indexOf(value) === index)
            .sort();

        // 배치가 조용히 되돌아가면(훅이 모듈 루트로 새면) 이 목록이 줄어든다.
        expect(hookFolders).toEqual(['connection', 'data', 'push', 'runtime', 'session', 'socket/sync']);
    });
});
