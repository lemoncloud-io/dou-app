/**
 * Korean translations for mobile native UI
 * This is the source of truth - web JSON should match these keys
 */
export const ko = {
    app: {
        exitDialog: {
            title: '앱 종료',
            message: '앱을 종료하시겠습니까?',
            cancel: '취소',
            confirm: '종료',
        },
        updateDialog: {
            title: '업데이트 안내',
            message: '새로운 버전이 출시되었습니다. 최신 기능을 사용하려면 업데이트해 주세요.',
            update: '업데이트',
            later: '나중에',
        },
    },
    loader: {
        processing: '처리 중입니다...',
        paymentProcessing: '결제 처리 중...',
    },
    deepLink: {
        errorTitle: '초대 링크를 열 수 없어요',
        errorMessage: '링크가 만료되었거나 유효하지 않습니다.',
        goHome: '홈으로 이동',
    },
} as const;
