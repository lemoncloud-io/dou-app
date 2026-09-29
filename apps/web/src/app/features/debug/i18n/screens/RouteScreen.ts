import { defineDebugStrings } from '../define';

const en = {
    copyRoute: 'Copy route',
    summary: {
        title: 'Summary',
        depth: {
            label: 'Depth',
            value: (depth: number) => `${depth} ${depth === 1 ? 'entry' : 'entries'}`,
            hint: "Number of history entries this app has pushed. Entries from before the app loaded don't count.",
        },
        currentPosition: {
            label: 'Current position',
            hint: "The index the router stamps on every history entry (history.state.idx). #0 is the app's first screen.",
        },
        canGoBack: {
            label: 'Can go back',
            yes: 'Yes',
            no: 'No',
            hint: "The value the back button actually checks. It's 'Yes' only when the router index is above #0, and 'No' when the index can't be read. When it's 'No' the app doesn't handle back, and the shell decides what happens next.",
        },
        forwardRemaining: {
            label: 'Forward entries remaining',
            value: (count: number) => `${count} ${count === 1 ? 'entry' : 'entries'}`,
            hint: 'Entries you could reach again by going forward after going back. Navigating to a new screen from here discards them.',
        },
        historyLength: {
            // The literal browser API name — identical in both languages.
            label: 'history.length',
            hint: "A browser-global value, so it counts entries from before the app loaded too. It is not the app's depth — back navigation is decided by 'Can go back' above, so this can differ and still be normal.",
        },
        mismatch: {
            label: 'Mismatch',
            value: (depth: number, historyLength: number) => `App stack ${depth} ≠ history.length ${historyLength}`,
            hint: 'The difference between the two is the number of entries from before the app loaded. Happens when a WebView was reused, or the browser tab visited another site first.',
        },
    },
    stack: {
        title: 'Stack (back → forward)',
        description:
            "What's stacked behind you right now. Navigating to a new screen after going back discards the entries ahead.",
        warningLabel: 'Warning',
        warningValue: 'Stack cannot be trusted',
        warningHint:
            "Some code manipulated history directly instead of going through the router. That makes the entry index unreadable, so the stack can't be reconstructed.",
        empty: 'No transitions recorded yet',
        currentSuffix: ' ← current',
        unknownEntry: '(unknown — before reload)',
    },
    trail: {
        title: 'Trail (visit order)',
        description:
            'Screens visited, in chronological order. Screens you went back from still stay listed. Included in feedback reports.',
        empty: 'No visits recorded yet',
        current: 'current',
    },
};

const ko: typeof en = {
    copyRoute: '라우트 복사',
    summary: {
        title: '요약',
        depth: {
            label: '깊이',
            value: (depth: number) => `${depth}칸`,
            hint: '이 앱이 쌓은 히스토리 항목 수입니다. 앱에 들어오기 전 항목은 세지 않습니다.',
        },
        currentPosition: {
            label: '현재 위치',
            hint: '라우터가 히스토리 항목마다 심어두는 번호(history.state.idx)입니다. #0이 앱의 첫 화면입니다.',
        },
        canGoBack: {
            label: '뒤로 갈 수 있음',
            yes: '예',
            no: '아니오',
            hint: "뒤로가기가 실제로 묻는 값입니다. 라우터 인덱스가 #0보다 위여야 '예'이고, 인덱스를 읽을 수 없으면 '아니오'입니다. '아니오'면 앱은 뒤로가기를 처리하지 않고, 그다음은 셸이 정합니다.",
        },
        forwardRemaining: {
            label: '앞으로 남은 항목',
            value: (count: number) => `${count}칸`,
            hint: '뒤로 온 뒤 앞으로가기로 다시 닿을 수 있는 항목 수입니다. 여기서 새 화면으로 이동하면 이 항목들은 버려집니다.',
        },
        historyLength: {
            label: 'history.length',
            hint: "브라우저 전역 값이라 앱에 들어오기 전 항목까지 셉니다. 앱 깊이가 아닙니다 — 뒤로가기는 위의 '뒤로 갈 수 있음'으로 판정하므로 이 값과 달라도 정상입니다.",
        },
        mismatch: {
            label: '불일치',
            value: (depth: number, historyLength: number) => `앱 스택 ${depth}칸 ≠ history.length ${historyLength}`,
            hint: '두 값의 차이가 앱에 들어오기 전 항목 수입니다. 웹뷰를 재사용했거나 브라우저 탭이 다른 사이트를 먼저 방문한 경우입니다.',
        },
    },
    stack: {
        title: '스택 (뒤 → 앞)',
        description: '지금 내 뒤에 쌓여 있는 것. 뒤로 간 뒤 새 화면으로 가면 앞쪽 항목은 버려집니다.',
        warningLabel: '경고',
        warningValue: '스택을 신뢰할 수 없습니다',
        warningHint:
            '라우터를 거치지 않고 history를 직접 조작한 코드가 있습니다. 그러면 항목 번호를 읽을 수 없어 스택을 복원할 수 없습니다.',
        empty: '아직 기록된 전환이 없습니다',
        currentSuffix: ' ← 현재',
        unknownEntry: '(알 수 없음 — 리로드 이전)',
    },
    trail: {
        title: 'Trail (방문 순서)',
        description: '거쳐온 화면을 시간순으로. 뒤로 간 화면도 남습니다. 피드백 리포트에 함께 실립니다.',
        empty: '아직 방문 기록이 없습니다',
        current: '현재',
    },
};

export const useRouteScreenStrings = defineDebugStrings({ ko, en });
