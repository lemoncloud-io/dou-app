import { defineDebugStrings } from '../define';

const en = {
    title: 'OAuth (native)',
    subtitle: "Opens the app's native sign-in sheet — a separate path from the web relay",
    login: 'Login',
    logout: 'Logout',
    /** Passed to `useDebugOperation().run()` — `provider` is a technical id (`google`/`apple`), left as-is. */
    operationLabels: {
        login: (provider: string) => `${provider} login`,
        logout: (provider: string) => `${provider} logout`,
    },
};

const ko: typeof en = {
    title: 'OAuth (네이티브)',
    subtitle: '앱의 네이티브 로그인 시트를 띄웁니다 — 웹 릴레이 경로와는 별개입니다',
    login: '로그인',
    logout: '로그아웃',
    operationLabels: {
        login: (provider: string) => `${provider} 로그인`,
        logout: (provider: string) => `${provider} 로그아웃`,
    },
};

export const useOAuthScreenStrings = defineDebugStrings({ ko, en });
