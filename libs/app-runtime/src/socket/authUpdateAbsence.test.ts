import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * `auth.update` 부재 게이트 — 소켓 핸드셰이크는 SDK `ClientSocketAuth` 단독 소유다.
 *
 * `refreshAbsence.test.ts`와 같은 형식이고 같은 이유로 부재 검사다: 지켜야 하는 것이 "정당한
 * 호출부만 부른다"가 아니라 **호출부가 하나도 없다**이기 때문이다. 경로 패턴 lint는 심볼이
 * 옮겨가면 조용히 죽지만(실제로 한 번 그랬다), 부재 검사에는 그 실패 양식이 없다.
 *
 * 왜 두 번째 발신자가 있으면 안 되는가. 컨트롤러의 상태 머신(refresh 스케줄링, 실패 카운트,
 * 종단 `expired`)은 자기가 연 세션을 기준으로 돈다. 앱이 따로 `auth.update`를 보내면 컨트롤러가
 * 모르는 인증이 성립하고, 그때부터 컨트롤러는 열지 않은 세션에 대해 갱신을 계획한다.
 *
 * app-runtime이 하는 일은 발사가 아니라 **게이트 조작**이다 — `bootstrapSocketConnection`이
 * `gate.stop()`/`gate.start()`로 컨트롤러의 자동 발사 시점을 미룰 뿐, 패킷을 직접 만들지 않는다.
 * 그래서 이 검사는 문자열 `'auth.update'`(패킷 이름)를 짓는 코드만 잡는다.
 */
const SRC = join(__dirname, '..');

const SELF = __filename.split('/').pop() as string;

const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap(entry => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) return walk(full);
        return full.endsWith('.ts') || full.endsWith('.tsx') ? [full] : [];
    });

/**
 * 주석을 먼저 걷어낸다. 이 패키지는 `auth.update`를 **설명**하는 주석이 많고(게이트가 왜
 * 필요한지, SDK가 언제 보내는지) 그 주석들은 백틱으로 이름을 감싼다 — 문자열 리터럴 검사만으로는
 * 설명과 발사를 구별하지 못한다. 걷어내는 쪽이 검사를 무르게 만들지도 않는다: 코드에서 패킷
 * 이름을 짓는 방법은 리터럴뿐이고, 리터럴은 주석 밖에 남는다.
 */
const stripComments = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

describe('auth.update 부재 게이트', () => {
    it('app-runtime 어디에도 auth.update 패킷을 짓는 코드가 없다', () => {
        const offenders = walk(SRC)
            .filter(file => !file.endsWith(SELF))
            .filter(file => {
                const code = stripComments(readFileSync(file, 'utf8'));
                // 발사 지점만 — `request('auth.update', …)` 형태. `auth.update:ok`는 수신 확인용
                // 메시지 이름이라(구독은 발사가 아니다) 제외한다.
                return /["'`]auth\.update(?!:)["'`]/.test(code);
            })
            .map(file => file.slice(SRC.length + 1));

        expect(offenders).toEqual([]);
    });
});
