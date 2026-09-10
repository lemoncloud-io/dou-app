# @chatic/app-runtime

앱이 데이터·세션·소켓을 쓰기 위해 지나는 런타임 계층. `libs/data`가 소유한 repository를 조립하고,
세션과 소켓 연결의 생애주기를 갖고, sync 등록과 푸시·리포트 경로를 배선한다.

이 패키지가 공개하는 이름은 **`runtime` 하나**다. 그 아래 그룹 7개(`boot` · `session` ·
`connection` · `data` · `sync` · `push` · `report`)가 표면 전부이고, 평탄 별칭은 두지 않는다.
그룹은 폴더가 아니라 "무엇을 하려는가"로 묶여 있어서 내부 구조를 몰라도 찾아갈 수 있다.

```ts
import { runtime } from '@chatic/app-runtime';

runtime.boot.initAppRuntime(); // 엔트리에서 render 전에 한 번
```

표면의 정확한 목록은 산문이 아니라 테스트가 지킨다 — `src/public-surface.test.ts`가 그룹별 심볼을
고정하고 배럴이 `runtime` 외에는 아무것도 내보내지 않음을 단언한다.

문서 정본은 [`docs/`](./docs/README.md)다.
