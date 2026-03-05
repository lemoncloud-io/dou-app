export interface Feature {
    id: string;
    title: string;
    description: string;
}

export const features: Feature[] = [
    {
        id: 'place',
        title: '플레이스란? 초대기반의 안전한 대화 공간',
        description: '모임이나 프로젝트 단위로 공간을 만들어 그안에서 안전하게 대화를 나눠요',
    },
    {
        id: 'invite',
        title: '초대 기반의 안전한 대화',
        description: '채팅방을 만들고 초대 링크를 통해 입장한 친구들만 채팅방에 참여할 수 있어요',
    },
    {
        id: 'security',
        title: '철저한 정보 보안',
        description: '초대링크를 통해서 참여가능, 초대받은 사람들과 안전하게 대화하세요',
    },
    {
        id: 'private',
        title: '프라이빗 커뮤니티',
        description: '최대 5개의 대화공간과, 5개의 채팅방으로 필요한 사람들과 필요한 이야기를 나눠요',
    },
];
