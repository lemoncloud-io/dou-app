import { defineDebugStrings } from '../define';

/**
 * Strings for the pieces shared across screens (`CopyButton`, `DebugUnlockDialog`,
 * `useCopyFeedback`, `useDebugOperation`) rather than any one screen's own table.
 *
 * `operation.notSupported` and `operation.sentNoConfirmation` are asserted byte-for-byte by many
 * screen tests (in `en`) that other workers own — do not change the `en` text.
 */
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
        /** `${label} → sent (no confirmation)` — asserted verbatim by other workers' screen tests. */
        sentNoConfirmation: 'sent (no confirmation)',
        /** `${label} → not supported by this app version` — asserted verbatim by other workers' screen tests. */
        notSupported: 'not supported by this app version',
        /** `${label} → failed: ${message}` — the prefix is asserted verbatim by other workers' screen tests. */
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
        notSupported: '이 앱 버전이 지원하지 않습니다',
        failedPrefix: '실패',
    },
};

export const useDebugSharedStrings = defineDebugStrings({ ko, en });
