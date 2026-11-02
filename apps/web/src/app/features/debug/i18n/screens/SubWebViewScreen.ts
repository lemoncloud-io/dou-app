import { defineDebugStrings } from '../define';

const en = {
    intro: 'Opens a page on another origin in the app’s sub WebView, and records how it closed.',
    supported: (yes: boolean): string =>
        yes
            ? 'This app can open a sub WebView.'
            : 'This app cannot open a sub WebView — it will fall back to the OS browser.',
    urlLabel: 'URL',
    urlPlaceholder: 'https://<page>.apps-dev.chatic.io/',
    titleLabel: 'Title (optional)',
    paramsLabel: 'params (JSON object, optional)',
    paramsInvalid: (message: string) => `params is not a JSON object: ${message}`,
    open: 'Open',
    closeLast: (viewId: string) => `Close ${viewId}`,
    log: (count: number) => `Log (${count})`,
    clear: 'Clear',
    nothingYet: 'Nothing opened yet',
    opened: (via: string, viewId?: string) => (viewId ? `opened in ${via}: ${viewId}` : `opened in ${via}`),
    failed: (code: string, message: string) => `failed: ${code} — ${message}`,
    closed: (viewId: string, reason: string) => `closed ${viewId}: ${reason}`,
    result: 'result',
};

const ko: typeof en = {
    intro: '다른 출처의 페이지를 앱의 서브웹뷰로 열고, 어떻게 닫혔는지 기록합니다.',
    supported: yes =>
        yes ? '이 앱은 서브웹뷰를 열 수 있습니다.' : '이 앱은 서브웹뷰를 열 수 없습니다 — OS 브라우저로 대신 엽니다.',
    urlLabel: 'URL',
    urlPlaceholder: 'https://<page>.apps-dev.chatic.io/',
    titleLabel: '제목 (선택)',
    paramsLabel: 'params (JSON 객체, 선택)',
    paramsInvalid: message => `params가 JSON 객체가 아닙니다: ${message}`,
    open: '열기',
    closeLast: viewId => `${viewId} 닫기`,
    log: count => `기록 (${count})`,
    clear: '지우기',
    nothingYet: '아직 연 것이 없습니다',
    opened: (via, viewId) => (viewId ? `${via}로 열림: ${viewId}` : `${via}로 열림`),
    failed: (code, message) => `실패: ${code} — ${message}`,
    closed: (viewId, reason) => `닫힘 ${viewId}: ${reason}`,
    result: 'result',
};

export const useSubWebViewScreenStrings = defineDebugStrings({ ko, en });
