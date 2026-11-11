/** Korean copy for the errors tab. */
export const errors = {
    summary: {
        count: '에러',
        users: '영향받은 사용자',
        incidents: '사건 종류',
        trendLabel: '시간대별 에러 수',
    },
    source: {
        rows: '이 기간의 에러를 빠짐없이 받아 와서 셌어요.',
        rowsPartial: '서버 집계를 받지 못해 최근 {{n}}건으로만 셌어요. 실제로는 더 많을 수 있어요.',
        server: '건수와 사용자 수는 서버가 기간 전체를 센 값이에요. 사건별 사용자 수와 처음·마지막 시각은 받아 온 최근 기록 기준이에요.',
        serverWide:
            '서버는 날짜 단위로만 세서, 건수와 사용자 수는 {{from}} 0시부터 {{to}}까지를 센 값이에요. 사건별 사용자 수와 처음·마지막 시각은 받아 온 최근 기록 기준이에요.',
    },
    group: {
        title: '사건별 에러',
        hint: '같은 종류의 에러를 하나로 묶었어요. 많이 일어난 순서예요. 누르면 사례를 볼 수 있어요.',
        count: '{{n}}건',
        users: '사용자 {{n}}명',
        usersAtLeast: '사용자 {{n}}명 이상',
        first: '처음',
        last: '마지막',
        sparkLabel: '기간 안 발생 추이',
    },
    cases: {
        title: '사례',
        hint: '최근 순이에요. 사용자를 눌러 그때 무슨 일이 있었는지 이어서 볼 수 있어요.',
        rawTag: '원문 태그',
        back: '사건 목록으로',
        empty: '이 기간에 이 사건의 사례가 없어요',
        userTimeline: '이 사용자의 그때 기록',
    },
    empty: {
        title: '이 기간에 에러가 없어요',
        hint: '운영/개발 서버가 맞는지도 확인해 보세요.',
    },
};
