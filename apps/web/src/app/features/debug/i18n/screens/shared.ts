import { defineDebugStrings } from '../define';

const en = {
    copy: {
        idle: 'Copy',
        copied: 'Copied',
        failed: 'Copy failed',
    },
    unlockDialog: {
        title: 'Enter Debug Code',
        description: 'Enter the debug entry code to unlock debug tools.',
        placeholder: 'Debug code',
        wrongCode: 'Wrong code',
        unlock: 'Unlock',
        ariaLabel: 'debug entry code',
    },
    operation: {
        sentNoConfirmation: 'sent (no confirmation)',
        failedPrefix: 'failed',
    },
};

const ko: typeof en = {
    copy: {
        idle: '복사',
        copied: '복사됨',
        failed: '복사 실패',
    },
    unlockDialog: {
        title: '디버그 코드 입력',
        description: '디버그 기능을 열려면 디버그 입장 코드를 입력하세요.',
        placeholder: '디버그 코드',
        wrongCode: '틀린 코드',
        unlock: '잠금 해제',
        ariaLabel: '디버그 입장 코드',
    },
    operation: {
        sentNoConfirmation: '보냈습니다 (확인 없음)',
        failedPrefix: '실패',
    },
};

export const useDebugSharedStrings = defineDebugStrings({ ko, en });
