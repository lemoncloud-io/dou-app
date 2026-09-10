import type { ConfigRegistryModule } from '../types';

/**
 * Log collection and upload — five levers collapsed into three keys, plus the upload tuning
 * discovered in the tunables sweep.
 *
 * `LOG_UPLOAD_FORCED_KEY` used to be a second key that existed only because there was no override
 * layer: the build flag became `log.upload.enabled`'s default and forcing became its local
 * override, so one key now does both jobs. `collection.enabled` stays excluded from `server` —
 * it is a privacy opt-out, and privacy opt-outs must not be something the server can undo.
 *
 * `upload.batchSize`/`intervalMs`/`backoffMs`/`maxAttempts` are `'restart'`:
 * `LogUploadScheduler`'s constructor captures them into instance fields, so a changed value has no
 * effect until the scheduler is rebuilt.
 */
export const logModule: ConfigRegistryModule = {
    'log.collection.enabled': {
        title: '로그 수집',
        description: '기기에서 로그를 모을지 결정한다. 끄면 쌓인 로그도 버린다.',
        type: 'boolean',
        defaultValue: true,
        surface: 'dev',
        writableBy: ['local'],
        persist: 'local',
    },
    'log.upload.enabled': {
        title: '로그 전송',
        description: '모은 로그를 서버로 보낼지 결정한다.',
        type: 'boolean',
        defaultValue: true,
        surface: 'dev',
        writableBy: ['shell', 'local', 'server'],
        persist: 'local',
    },
    'log.upload.hold': {
        title: '로그 전송 보류',
        description:
            '큐를 비우지 않고 쌓아 둔다. 기기가 만든 로그를 되읽기 위한 디버깅 레버이고, 수집 거부와는 다르다.',
        type: 'boolean',
        defaultValue: false,
        surface: 'dev',
        writableBy: ['shell', 'local'],
        persist: 'local',
    },
    'log.keepDebug': {
        title: '디버그 로그 유지',
        description: 'debug 레벨 로그도 함께 보관한다.',
        type: 'boolean',
        defaultValue: false,
        byStage: { LOCAL: true, DEV: true },
        surface: 'dev',
        writableBy: ['shell', 'local'],
        persist: 'none',
    },
    'log.console.mirror': {
        title: '콘솔 로그 미러링',
        description: '웹 콘솔 로그를 네이티브 콘솔에도 함께 출력한다.',
        type: 'boolean',
        defaultValue: false,
        byStage: { LOCAL: true, DEV: true },
        surface: 'dev',
        writableBy: ['shell', 'local'],
        persist: 'none',
    },
    'log.perf.runId': {
        title: '성능 측정 실행 ID',
        description: '이번 실행을 식별하는 성능 로그용 ID. 네이티브가 주입한다.',
        type: 'string',
        defaultValue: '',
        surface: 'dev',
        writableBy: ['shell'],
        persist: 'none',
    },
    'log.upload.batchSize': {
        title: '로그 배치 크기',
        description: '한 번에 묶어 보내는 로그 엔트리 수.',
        type: 'number',
        defaultValue: 50,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'restart',
    },
    'log.upload.intervalMs': {
        title: '로그 전송 주기',
        description: '쌓인 로그를 보내는 주기.',
        type: 'number',
        defaultValue: 60_000,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'restart',
    },
    'log.upload.backoffMs': {
        title: '로그 전송 재시도 간격표',
        description: '전송이 실패했을 때 순서대로 늘어나는 재시도 대기 시간.',
        type: 'json',
        defaultValue: [5_000, 30_000, 120_000],
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'restart',
    },
    'log.upload.maxAttempts': {
        title: '로그 전송 재시도 횟수',
        description: '한 배치를 포기하기 전까지 시도하는 최대 횟수.',
        type: 'number',
        defaultValue: 5,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'restart',
    },
    'log.perf.samplePercent': {
        title: '성능 지표 샘플링 비율',
        description: '부팅 성능 지표를 서버로 보내는 기기의 비율.',
        type: 'number',
        defaultValue: 10,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'none',
        appliesAt: 'live',
    },
};
