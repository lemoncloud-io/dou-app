/** Korean copy for the statistics tab. */
export const stats = {
    goals: { title: '목표 대비', hint: '빠르기를 목표와 견줘요. 기간 안에 기록된 측정값 기준이에요.' },
    goal: {
        boot: { name: '앱 시작', what: '앱을 눌러서 첫 화면이 준비될 때까지' },
        roomEntry: { name: '채팅방 입장', what: '채팅방을 눌러서 메시지가 보일 때까지' },
        switch: { name: '클라우드·플레이스 전환', what: '전환을 눌러서 끝날 때까지' },
        fcp: { name: '첫 화면 그리기 (FCP)', what: '웹이 처음 무언가를 그릴 때까지' },
        lcp: { name: '주요 내용 표시 (LCP)', what: '가장 큰 내용이 보일 때까지' },
    },
    verdict: { met: '목표 안', missed: '목표 넘음', none: '목표 없음', noData: '기록 없음' },
    card: {
        atTarget: '{{p}}%가 이 시간 안 · 목표 {{target}}',
        atNoTarget: '{{p}}%가 이 시간 안',
        sample: '{{n}}건 · 중간값 {{median}}',
        noData: '이 기간에 기록이 없어요',
        partial: '최근 기록 일부 기준',
    },
    off: {
        title: '이 기간에는 통계 기록이 없어요',
        why: '통계는 앱이 정해진 비율로 모아 보내요. 아래 조건에 맞는 실행만 기록되니, 조건을 확인하거나 기간을 넓혀 보세요.',
        where: '모으는 곳: iOS·Android 앱 0.29.2 이상, 브라우저에서 연 웹. 그보다 오래된 앱과 데스크톱 앱은 모으지 않아요.',
        rates: '비율: 목표가 있는 기록(앱 시작·전환·FCP·LCP)과 채팅방 입장, 사용량은 모든 실행에서, 나머지 성능 기록은 실행 5번 중 1번꼴로 모아요.',
        firstRun: '앱을 새로 설치한 뒤 첫 실행은 빠지고, 그다음 실행부터 모여요.',
    },
    usage: {
        wideSpan: '서버는 날짜 단위로만 세서, 사용량은 {{from}} 0시부터 {{to}}까지를 센 값이에요.',
        failed: '사용량을 불러오지 못했어요: {{message}}',
        title: '사용량',
        users: '사용자',
        opens: '앱 열기',
        records: '전체 기록',
        daily: '날짜별 사용자 수',
        usersOn: '사용자 {{count}}명',
        note: '사용자 수는 기록을 남긴 사람을 서버가 어림잡아 센 값이고, 날짜는 기록이 서버에 도착한 한국 시간 기준이에요.',
        unsupported: '서버가 아직 사용량을 집계하지 않아요',
        unsupportedHint: '서버에 집계 기능이 배포되면 여기에 보여요.',
    },
};
