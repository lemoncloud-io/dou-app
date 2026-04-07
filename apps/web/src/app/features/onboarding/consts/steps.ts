import { Images } from '@chatic/assets';

export interface OnboardingStep {
    id: string;
    title: string;
    description: string;
    image: string;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
    {
        id: 'personal-community',
        title: '퍼스널 커뮤니티',
        description: '최대 5개의 대화공간과, 5개의 채팅방으로\n필요한 사람들과 필요한 이야기를 나눠요',
        image: Images.onboardingStep1,
    },
    {
        id: 'safe-space',
        title: '안전한 대화 공간',
        description: '초대 링크를 받은 친구끼리\n안전하게 대화가 가능해요.',
        image: Images.onboardingStep2,
    },
    {
        id: 'group-communication',
        title: '그룹 소통',
        description: '최대 100명의 적정 규모로 더 집중된\n대화와 활발한 참여가 가능해요.',
        image: Images.onboardingStep3,
    },
    {
        id: 'memo-space',
        title: '나에게 보내는 메모 공간',
        description: '할 일 정리, 빠른 기록까지\n나만 보는 개인 메모 공간을 활용해요.',
        image: Images.onboardingStep4,
    },
];
