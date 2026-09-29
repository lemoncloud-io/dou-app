import { defineDebugStrings } from '../define';

const en = {
    title: 'Custom web zip',
    subtitle: 'Downloads the zip, serves it from a local server, and reloads the WebView there',
    prodBlocked: "Can't apply on this app build (PROD) — only turning it off is allowed",
    statusSection: 'Current status',
    serverLabel: 'Server',
    defaultWeb: 'Default web',
    unpackedAtLabel: 'Unpacked at',
    zipUrlLabel: 'zip URL',
    placeholder: 'https://…/web-build.zip',
    apply: 'Apply',
    turnOff: 'Turn off',
    refresh: 'Refresh',
    /** Labels passed to `run` — shown as the operation name in the result line. */
    operations: {
        applyZip: 'Apply zip',
        revertToDefault: 'Revert to default web',
    },
};

const ko: typeof en = {
    title: '커스텀 web zip',
    subtitle: 'zip을 내려받아 로컬 서버로 띄우고 WebView를 그쪽으로 다시 로드합니다',
    prodBlocked: '이 앱 빌드(PROD)에서는 적용할 수 없습니다 — 끄기만 가능합니다',
    statusSection: '지금 상태',
    serverLabel: '서버',
    defaultWeb: '기본 웹',
    unpackedAtLabel: '풀린 위치',
    zipUrlLabel: 'zip 주소',
    placeholder: 'https://…/web-build.zip',
    apply: '적용',
    turnOff: '끄기',
    refresh: '새로고침',
    operations: {
        applyZip: 'zip 적용',
        revertToDefault: '기본 웹으로',
    },
};

export const useCustomZipScreenStrings = defineDebugStrings({ ko, en });
