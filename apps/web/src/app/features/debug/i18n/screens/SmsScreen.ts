import { defineDebugStrings } from '../define';

const en = {
    title: 'SMS',
    subtitle: 'Opens the OS compose sheet — sending still needs a human tap',
    recipientsLabel: 'Recipients (comma-separated)',
    recipientsPlaceholder: '01012345678, 01087654321',
    messageLabel: 'Message',
    defaultMessage: 'Text sent from the debug panel',
    openComposeSheet: 'Open compose sheet',
    loadContacts: 'Load contacts',
    /** Passed to `useDebugOperation().run()` — they end up in the on-screen result line. */
    operationLabels: {
        sms: 'SMS',
        contacts: 'Contacts',
    },
};

const ko: typeof en = {
    title: 'SMS',
    subtitle: 'OS 작성 창을 띄웁니다 — 보내기는 사람이 눌러야 합니다',
    recipientsLabel: '받는 번호 (쉼표로 구분)',
    recipientsPlaceholder: '01012345678, 01087654321',
    messageLabel: '본문',
    defaultMessage: '디버그 패널에서 보낸 문자입니다',
    openComposeSheet: '작성 창 열기',
    loadContacts: '연락처 불러오기',
    operationLabels: {
        sms: 'SMS',
        contacts: '연락처',
    },
};

export const useSmsScreenStrings = defineDebugStrings({ ko, en });
