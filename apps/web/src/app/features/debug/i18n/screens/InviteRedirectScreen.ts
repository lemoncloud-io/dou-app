import { defineDebugStrings } from '../define';

const en = {
    title: 'Invite link converter',
    description:
        'Converts a share link — cloud (…/s?code=…&api=…&stage=… or …/s?code=…&backend=…) or relay (…/s?code=…, relay when there are no address params) — to an invite link and navigates there.',
    inputLinkLabel: 'Input link',
    inputPlaceholder: 'https://app-dev.chatic.io/s?code=…&api=…&stage=…',
    redirectDomainLabel: 'Redirect domain',
    conversionResultLabel: 'Conversion result',
    convertAndGo: 'Convert and go',
    /**
     * `buildInviteRedirectUrl`/`buildInviteEntryParams` throw plain `Error`s in English (they stay
     * English — see lib/buildInviteRedirectUrl.ts). The screen matches the thrown message against
     * these keys to show table text instead; `unknown` covers anything unrecognised.
     */
    errors: {
        invalidUrl: 'Not a valid URL.',
        missingCode: 'Input link is missing the code parameter.',
        missingApiOrBackend: 'Input link is missing the api or backend parameter.',
        missingStage: 'Input link is missing the stage parameter.',
        unknown: 'Conversion failed.',
    },
};

const ko: typeof en = {
    title: '초대 링크 변환',
    description:
        '공유 링크(클라우드 …/s?code=…&api=…&stage=… 또는 …/s?code=…&backend=… / 릴레이 …/s?code=… — 주소 파라미터 없으면 릴레이)를 초대 링크로 변환해 이동합니다.',
    inputLinkLabel: '입력 링크',
    inputPlaceholder: 'https://app-dev.chatic.io/s?code=…&api=…&stage=…',
    redirectDomainLabel: '리다이렉트 도메인',
    conversionResultLabel: '변환 결과',
    convertAndGo: '변환 후 이동',
    errors: {
        invalidUrl: '유효한 URL이 아닙니다.',
        missingCode: '입력 링크에 code 파라미터가 없습니다.',
        missingApiOrBackend: '입력 링크에 api 또는 backend 파라미터가 없습니다.',
        missingStage: '입력 링크에 stage 파라미터가 없습니다.',
        unknown: '변환에 실패했습니다.',
    },
};

export const useInviteRedirectStrings = defineDebugStrings({ ko, en });

/**
 * Maps the English message a thrown `Error` carries to the matching table key — see the `errors`
 * doc comment above for why the source messages are English.
 */
const ERROR_MESSAGE_TO_KEY: Record<string, keyof typeof en.errors> = {
    'Not a valid URL.': 'invalidUrl',
    'Input link is missing the code parameter.': 'missingCode',
    'Input link is missing the api or backend parameter.': 'missingApiOrBackend',
    'Input link is missing the stage parameter.': 'missingStage',
};

export const inviteRedirectErrorText = (strings: ReturnType<typeof useInviteRedirectStrings>, message: string) =>
    strings.errors[ERROR_MESSAGE_TO_KEY[message] ?? 'unknown'];
