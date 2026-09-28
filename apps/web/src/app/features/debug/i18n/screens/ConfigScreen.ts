import { defineDebugStrings } from '../define';

const en = {
    description:
        'What this device actually runs with — see which row won (origin), and change the keys you can write from here',
    searchPlaceholder: 'Search by key or name',
    refresh: 'Refresh',
    copyJson: 'Copy JSON',
    notWiredUp: "Registry isn't wired up yet — either config.init() hasn't run, or this build has no adapter",
    overriddenTitle: (count: number) => `Overridden (${count})`,
    noneOverridden: 'None — everything is at its build-defined value',
    restTitle: (count: number) => `Rest (${count})`,
    defaultLabel: 'Default',
    notANumber: 'Not a number',
    jsonParseFailed: (message: string) => `JSON parse failed: ${message}`,
    on: 'On',
    off: 'Off',
    apply: 'Apply',
    revert: 'Revert',
    readOnly: (writers: string) => `Read-only on this device — writable by: ${writers}`,
    noWriters: 'none',
    /** Keyed by `SetRejection` — why `config.set`/`config.clear` refused a write. */
    rejection: {
        unknownKey: 'Not a key in the registry',
        laneNotAllowed: 'Not writable from this screen (outside the local lane)',
        locked: 'Override lock is on',
        invalidValue: "Value doesn't match this key's type",
        notWired: 'Not wired up yet',
    },
    /** When the change actually lands. A control that silently needs a restart is a lie. */
    appliesAt: {
        live: 'Applies immediately',
        reconnect: 'Applies after reconnect',
        restart: 'Applies after restart',
    },
};

const ko: typeof en = {
    description: '이 기기가 실제로 쓰는 값 — 이긴 행(origin)까지 보고, 쓸 수 있는 키는 여기서 바꿉니다',
    searchPlaceholder: '키 또는 이름으로 찾기',
    refresh: '새로고침',
    copyJson: 'JSON 복사',
    notWiredUp: '레지스트리가 아직 배선되지 않았습니다 — `config.init()` 전이거나 이 빌드에 어댑터가 없습니다',
    overriddenTitle: (count: number) => `오버라이드됨 (${count})`,
    noneOverridden: '없습니다 — 전부 빌드가 정한 값입니다',
    restTitle: (count: number) => `나머지 (${count})`,
    defaultLabel: '기본',
    notANumber: '숫자가 아닙니다',
    jsonParseFailed: (message: string) => `JSON 파싱 실패: ${message}`,
    on: '켜기',
    off: '끄기',
    apply: '적용',
    revert: '되돌리기',
    readOnly: (writers: string) => `이 기기에서는 읽기 전용입니다 — 쓸 수 있는 주체: ${writers}`,
    noWriters: '없음',
    rejection: {
        unknownKey: '레지스트리에 없는 키입니다',
        laneNotAllowed: '이 화면이 쓸 수 있는 키가 아닙니다 (로컬 레인 밖)',
        locked: '오버라이드 잠금이 걸려 있습니다',
        invalidValue: '이 키의 타입과 맞지 않는 값입니다',
        notWired: '설정이 아직 배선되지 않았습니다',
    },
    appliesAt: {
        live: '즉시 적용',
        reconnect: '재연결 후 적용',
        restart: '재시작 후 적용',
    },
};

export const useConfigScreenStrings = defineDebugStrings({ ko, en });
