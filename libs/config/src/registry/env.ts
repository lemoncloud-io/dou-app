import type { ConfigRegistryModule } from '../types';

/**
 * Read-only build facts. `writableBy: []` on every entry — nothing writes these, the env adapter
 * supplies them.
 *
 * `env.stage` and `env.buildStage` are deliberately two different keys (ADR-0080 결정 5).
 * `env.stage` mirrors today's behaviour (an injected value wins over the baked one); `env.buildStage`
 * reads only what the bundler baked in and cannot be spoofed, so security-relevant `byStage` rules
 * elsewhere in the registry are judged against it, not this one.
 */
export const envModule: ConfigRegistryModule = {
    // `env.stage`/`env.buildStage`/`env.platform` are resolved directly off the adapter
    // (`ConfigResolver`'s adapter-passthrough special case) — their `defaultValue`/`writableBy`
    // below exist for shape/typing only and are never actually reached.
    'env.stage': {
        title: '실행 환경',
        description: '셸이 주입한 값이 우선인 실행 환경. 보안 판정에는 쓰지 않는다.',
        type: 'enum',
        values: ['LOCAL', 'DEV', 'PROD'],
        defaultValue: 'LOCAL',
        surface: 'dev',
        writableBy: [],
        persist: 'none',
    },
    'env.buildStage': {
        title: '빌드 환경',
        description: '번들에 박힌 실행 환경. 위조할 수 없어 보안 규칙의 판정 기준이다.',
        type: 'enum',
        values: ['LOCAL', 'DEV', 'PROD'],
        defaultValue: 'LOCAL',
        surface: 'dev',
        writableBy: [],
        persist: 'none',
    },
    'env.platform': {
        title: '플랫폼',
        description: '이 앱이 도는 운영체제.',
        type: 'enum',
        values: ['ios', 'android', 'windows', 'macos', 'web'],
        defaultValue: 'web',
        surface: 'dev',
        writableBy: [],
        persist: 'none',
    },
    'env.project': {
        title: '프로젝트 코드',
        description: '빌드가 속한 프로젝트 식별자.',
        type: 'string',
        defaultValue: '',
        envDefaultKey: 'VITE_PROJECT',
        surface: 'dev',
        writableBy: [],
        persist: 'none',
    },
    'env.region': {
        title: '리전',
        description: '백엔드가 배포된 AWS 리전.',
        type: 'string',
        defaultValue: 'ap-northeast-2',
        envDefaultKey: 'VITE_REGION',
        surface: 'dev',
        writableBy: [],
        persist: 'none',
    },
    'env.host': {
        title: '호스트 주소',
        description: '이 빌드가 자신을 가리킬 때 쓰는 주소.',
        type: 'string',
        defaultValue: '',
        envDefaultKey: 'VITE_HOST',
        surface: 'dev',
        writableBy: [],
        persist: 'none',
    },
    'env.appId': {
        title: '앱 번들 ID',
        description: '스토어에 등록된 앱 식별자. 개발 빌드는 별도 ID를 쓴다.',
        type: 'string',
        defaultValue: 'io.chatic.dou',
        byStage: { LOCAL: 'io.chatic.dou.dev', DEV: 'io.chatic.dou.dev' },
        surface: 'dev',
        writableBy: [],
        persist: 'none',
    },
    'env.webVersion': {
        title: '웹 빌드 버전',
        description: '이 웹 번들의 버전. 설정 화면 하단에 표시된다.',
        type: 'string',
        defaultValue: '',
        envDefaultKey: 'VITE_APP_VERSION',
        surface: 'dev',
        writableBy: [],
        persist: 'none',
    },
    'env.appVersion': {
        title: '앱 버전',
        description: '셸(네이티브 앱)의 버전.',
        type: 'string',
        defaultValue: '',
        envDefaultKey: 'CHATIC_APP_CURRENT_VERSION',
        surface: 'dev',
        writableBy: [],
        persist: 'none',
    },
    'env.appBuildNumber': {
        title: '앱 빌드 번호',
        description: '셸의 빌드 번호.',
        type: 'string',
        defaultValue: '',
        envDefaultKey: 'CHATIC_APP_BUILD_NUMBER',
        surface: 'dev',
        writableBy: [],
        persist: 'none',
    },
    'env.osVersion': {
        title: 'OS 버전',
        description: '기기의 운영체제 버전.',
        type: 'string',
        defaultValue: '',
        envDefaultKey: 'CHATIC_APP_OS_VERSION',
        surface: 'dev',
        writableBy: [],
        persist: 'none',
    },
    'env.deviceModel': {
        title: '기기 모델명',
        description: '기기의 모델명. 식별자가 아니라 모델 정보만 담는다.',
        type: 'string',
        defaultValue: '',
        envDefaultKey: 'CHATIC_APP_DEVICE_MODEL',
        surface: 'dev',
        writableBy: [],
        persist: 'none',
    },
    'env.webviewBaseUrl': {
        title: '웹 로드 주소',
        description: '앱이 지금 웹을 불러온 주소. 런타임에는 바뀌지 않는다.',
        type: 'string',
        defaultValue: '',
        envDefaultKey: 'VITE_WEBVIEW_BASE_URL',
        surface: 'dev',
        writableBy: [],
        persist: 'none',
    },
};
