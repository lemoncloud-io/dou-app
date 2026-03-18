import type { PolicyContent } from './policyTypes';

export const CHILD_POLICY_CONTENT: PolicyContent = {
    title: '운영정책 및 아동 보호 표준',
    subtitle: 'DoU - Privacy Messenger 아동 안전 정책',
    currentVersion: 'v1.1',
    versions: [
        {
            version: 'v1.1',
            effectiveDate: '2026-03-18',
            sections: [
                {
                    title: '개요',
                    content:
                        'DoU - Privacy Messenger(이하 "서비스")는 이용자의 프라이버시 보호를 최우선으로 하며, 동시에 안전한 모바일 생태계를 위해 아동 및 청소년 보호를 위한 엄격한 표준을 준수합니다.',
                },
                {
                    title: '1. 아동 성적 학대 및 착취(CSAE) 금지',
                    content:
                        'DoU - Privacy Messenger는 아동 성적 학대 및 착취(Child Sexual Abuse Editorial/Material) 콘텐츠에 대해 무관용 원칙을 적용합니다.\n\n• 금지 행위\n  - 아동 성착취물(CSAM)의 생성, 업로드, 전송, 공유 또는 저장\n  - 아동 성착취물로 유도하는 링크의 게시 및 유통\n  - 성적인 목적으로 아동에게 접근하는 행위(Grooming)\n\n• 정책 적용 범위\n  본 정책은 서비스 내 모든 채팅방, 초대 시스템, 프로필 등 DoU - Privacy Messenger의 모든 영역에 예외 없이 적용됩니다.',
                },
                {
                    title: '2. 정책 위반 시 조치 사항',
                    content:
                        '아동 안전 정책을 위반하는 행위가 확인될 경우, DoU - Privacy Messenger는 다음과 같은 강력한 조치를 취합니다.\n\n• 즉각적인 계정 제재\n  위반 사실이 확인된 사용자의 계정은 사전 고지 없이 즉시 영구 정지됩니다.\n\n• 데이터 삭제\n  위반과 관련된 모든 콘텐츠는 서버에서 즉시 삭제되며, 어떠한 경우에도 복구되지 않습니다.\n\n• 법적 신고\n  관련 법령에 따라 아동 성적 학대 관련 위반 사항은 사법 기관 및 국제 아동 보호 기구에 즉시 신고하며 수사에 적극 협조합니다.',
                },
                {
                    title: '3. 정상 작동 및 접근성',
                    content:
                        'DoU - Privacy Messenger의 아동 보호 표준은 모든 이용자가 상시 확인할 수 있도록 공개되며, 오류 없이 정상적으로 로드되어야 합니다. 서비스 운영진은 본 표준이 실제 서비스 운영에 엄격히 반영되도록 지속적으로 모니터링합니다.',
                },
                {
                    title: '4. 문의 및 신고',
                    content:
                        '서비스 이용 중 아동 안전 위반 사례를 발견하거나 관련 문의가 있는 경우 아래의 채널로 연락해주시기 바랍니다.\n\n• 담당: 서비스 운영 팀\n• 문의처: app@lemoncloud.io',
                },
            ],
        },
    ],
} as const;
