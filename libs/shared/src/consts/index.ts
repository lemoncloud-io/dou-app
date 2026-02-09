/**
 * 에러 타입별 UI 메시지 및 설정
 * ErrorFallback, RouterErrorFallback 컴포넌트에서 사용
 */
export const ERROR_MESSAGES = {
    network: {
        title: '연결 오류',
        description: '서버에 연결할 수 없습니다. 인터넷 연결을 확인해주세요.',
        primaryAction: '다시 시도',
        secondaryAction: '새로고침',
    },
    auth: {
        title: '인증 오류',
        description: '세션이 만료되었습니다. 다시 로그인해주세요.',
        primaryAction: '로그인',
        secondaryAction: '홈으로',
    },
    server: {
        title: '서버 오류',
        description: '서버에 문제가 발생했습니다. 잠시 후 다시 시도해주세요.',
        primaryAction: '다시 시도',
        secondaryAction: '홈으로',
    },
    client: {
        title: '요청 오류',
        description: '요청에 문제가 있습니다. 다시 시도해주세요.',
        primaryAction: '다시 시도',
        secondaryAction: '홈으로',
    },
    unknown: {
        title: '오류 발생',
        description: '예상치 못한 오류가 발생했습니다.',
        primaryAction: '다시 시도',
        secondaryAction: '홈으로',
    },
    notFound: {
        title: '페이지를 찾을 수 없습니다',
        description: '요청하신 페이지가 존재하지 않거나 이동되었습니다.',
        primaryAction: '홈으로',
        secondaryAction: '이전 페이지',
    },
} as const;

export type ErrorMessageType = keyof typeof ERROR_MESSAGES;
