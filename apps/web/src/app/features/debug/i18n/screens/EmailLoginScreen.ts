import { defineDebugStrings } from '../define';

const en = {
    subtitle: 'Debug Mode - Email Login',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
    loggedInToast: 'Logged in',
};

const ko: typeof en = {
    subtitle: '디버그 모드 - 이메일 로그인',
    showPassword: '비밀번호 보기',
    hidePassword: '비밀번호 숨기기',
    loggedInToast: '로그인되었습니다',
};

export const useEmailLoginScreenStrings = defineDebugStrings({ ko, en });
