import { Link } from 'react-router-dom';

const StylingListPage = () => {
    const pages = [
        { path: '/publishing/onboarding', name: '온보딩' },
        { path: '/publishing/search', name: '검색' },
        { path: '/publishing/my-agent', name: '나의 에이전트' },
        { path: '/publishing/agent-form', name: '나의 에이전트-폼' },
        { path: '/publishing/my-chat', name: '나와의 채팅' },
        { path: '/publishing/my-chat-list', name: '나와의 채팅-목록' },
        { path: '/publishing/my-chat-info', name: '나와의 채팅-정보' },
        { path: '/publishing/menu', name: '햄버거 메뉴' },
        { path: '/publishing/my', name: '설정' },
        { path: '/publishing/my-profile', name: '설정-프로필' },
        { path: '/publishing/my-email', name: '설정-이메일 등록' },
        { path: '/publishing/other-chat', name: '친구 채팅' },
        { path: '/publishing/other-chat-info', name: '친구 채팅-정보' },
        { path: '/publishing/other-chat-invite', name: '친구 채팅-초대' },
        { path: '/publishing/qr', name: '친구초대-qr' },
        { path: '/publishing/app-redirect', name: '친구초대-앱 설치 이동' },
    ];

    return (
        <div className="p-4">
            <h1 className="text-lg font-bold mb-4">페이지 목록</h1>
            <ul className="space-y-2">
                {pages.map(page => (
                    <li key={page.path}>
                        <Link to={page.path} className="text-blue-500">
                            {page.name}
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default StylingListPage;
