import type { Messages } from './messages';

const MANIFEST = 'public/.well-known/chatic-app.json';

export const ko: Messages = {
    title: 'Chatic 앱 검사',
    groups: {
        manifest: '매니페스트',
        permissions: '권한',
        code: '코드',
        bundle: '번들',
        start: '시작',
        backAndClose: '뒤로가기와 닫기',
        display: '테마',
        lifecycle: '숨김과 복귀',
        actions: '버튼',
        cloudData: '클라우드 데이터',
    },
    rules: {
        'manifest/missing': {
            problem: () => '매니페스트가 없습니다',
            fix: () => `${MANIFEST}를 만들고 manifestVersion 1, 이름, 페이지가 쓰는 권한을 넣으세요`,
        },
        'manifest/invalid': {
            problem: () => '매니페스트를 읽을 수 없습니다',
            fix: () => 'JSON 객체로 쓰고, permissions는 목록으로 쓰세요',
        },
        'manifest/version': {
            problem: () => '매니페스트의 manifestVersion이 맞지 않습니다',
            fix: () => '"manifestVersion": 1로 쓰세요',
        },
        'manifest/name': {
            problem: () => '매니페스트에 쓸 수 있는 이름이 없습니다',
            fix: () => '"name"을 1~100자로 쓰세요',
        },
        'manifest/unknown-field': {
            problem: field => `앱은 매니페스트의 "${field}" 항목을 읽지 않습니다`,
            fix: () => '지우거나 철자를 고치세요(manifestVersion, name, permissions, display, orientation)',
        },
        'manifest/unknown-permission': {
            problem: permission => `"${permission}" 권한은 앱이 모릅니다`,
            fix: () => '지우거나 철자를 고치세요',
        },
        'manifest/display': {
            problem: () => '매니페스트의 "display" 값을 앱이 모릅니다',
            fix: () => '"clean", "titled", "immersive" 중 하나를 쓰세요',
        },
        'manifest/orientation': {
            problem: () => '매니페스트의 "orientation" 값을 앱이 모릅니다',
            fix: () => '"any", "portrait", "landscape" 중 하나를 쓰세요',
        },
        'manifest/unused-permission': {
            problem: permission => `"${permission}" 권한을 요청하지만 쓰지 않습니다`,
            fix: permission => `매니페스트의 permissions에서 "${permission}" 권한을 지우세요`,
        },
        'manifest/missing-permission': {
            problem: permission => `"${permission}" 권한이 필요한 기능을 쓰는데 요청하지 않았습니다`,
            fix: permission => `매니페스트의 permissions에 "${permission}" 권한을 넣으세요`,
        },
        'code/unknown-data-method': {
            problem: method => `${method} 메서드는 앱이 페이지에 열어 주지 않습니다`,
            fix: () => 'SDK README에 있는 메서드만 쓰세요. 다른 것은 앱이 거절합니다',
        },
        'code/local-storage': {
            problem: () => '페이지가 localStorage에 데이터를 둡니다. 휴대폰이 지울 수 있습니다',
            fix: () => '대신 apps.storage를 쓰세요',
        },
        'code/os-theme': {
            problem: () => '페이지가 앱이 아니라 휴대폰의 다크 모드를 따릅니다',
            fix: () => 'apps.context.theme과 apps.onContextChange를 쓰세요',
        },
        'code/history-routing': {
            problem: () => '페이지가 브라우저 기록으로 화면을 옮깁니다',
            fix: () => '화면은 메모리 안의 목록으로 두고 apps.onBack을 쓰세요',
        },
        'code/popup': {
            problem: () => '페이지가 팝업을 열거나 window.opener를 씁니다. 앱에서는 페이지가 바뀌어 버립니다',
            fix: () => '링크는 apps.openUrl로, 로그인은 리다이렉트로 하세요',
        },
        'code/version-compare': {
            problem: () => '페이지가 버전 숫자를 비교합니다',
            fix: () => '기능이 있는지 apps.supports(…)로 물어보세요',
        },
        'code/error-message': {
            problem: () => '페이지가 오류 메시지 글자로 판단합니다',
            fix: () => '대신 error.code를 확인하세요',
        },
        'bundle/missing': {
            problem: () => '페이지가 아직 빌드되지 않았습니다',
            fix: () => '빌드(npm run build)한 뒤 다시 검사하세요',
        },
        'bundle/layout': {
            problem: () => '빌드 폴더 맨 위에 index.html이나 매니페스트가 없습니다',
            fix: () => `매니페스트를 ${MANIFEST}에 두고 다시 빌드하세요`,
        },
        'bundle/build-output-only': {
            problem: () => '빌드 폴더에 빌드 결과가 아닌 파일(소스, 맵, 숨김 파일)이 있습니다',
            fix: () => '지우거나 빌드에서 소스 맵을 끄세요',
        },
        'bundle/mock': {
            problem: () => '앱 대역(mock)이 빌드된 페이지에 들어 있습니다',
            fix: () => 'if (import.meta.env.DEV) { … } 안에서만 설치하세요',
        },
    },
    issues: {
        threw: {
            problem: issue => `페이지가 오류로 멈췄습니다: ${issue.detail ?? ''}`,
            fix: '오류를 잡고 error.code를 확인하세요',
        },
        reported: {
            problem: issue => `페이지가 오류를 보고했습니다: ${issue.detail ?? ''}`,
            fix: '어디서 나는지 찾아 처리하세요',
        },
        'not-ready': {
            problem: issue => `페이지에 준비 표시(${issue.detail ?? 'ready'})가 끝내 나타나지 않았습니다`,
            fix: '페이지가 시작되는지 확인하거나, 시나리오 파일의 "ready"를 고치세요',
        },
        'could-not-run': {
            problem: issue => `이 검사를 돌리지 못했습니다: ${issue.detail ?? ''}`,
            fix: '시나리오 파일과 빌드를 확인하세요',
        },
        'never-connected': {
            problem: () => '페이지가 앱에 연결하지 않습니다',
            fix: '페이지가 시작될 때 await connect()를 한 번 부르세요',
        },
        'no-data-connect': {
            problem: () => '클라우드 데이터 권한을 요청하지만 연결하지 않습니다',
            fix: '읽기 전에 await apps.data.connect()를 부르거나, 클라우드 데이터 권한을 지우세요',
        },
        'root-back-taken': {
            problem: () => '첫 화면에서도 Android 뒤로가기를 페이지가 쥐고 있어서, 뒤로가기로 닫을 수 없습니다',
            fix: '첫 화면에서는 apps.onBack(null)을 부르세요',
        },
        'selector-missing': {
            problem: issue => `${issue.screen ?? '단계'}: 페이지에서 ${issue.detail ?? '버튼'} 요소를 찾지 못했습니다`,
            fix: 'chatic-apps.scenarios.ts의 선택자나 버튼을 고치세요',
        },
        'screen-no-back': {
            problem: issue => `${issue.screen}: 이 화면에서 Android 뒤로가기를 누르면 페이지 전체가 닫힙니다`,
            fix: '화면이 열려 있는 동안 apps.onBack(back)을 부르세요',
        },
        'back-closed': {
            problem: issue => `${issue.screen}: Android 뒤로가기가 이전 화면 대신 페이지를 닫았습니다`,
            fix: '화면이 열려 있는 동안 apps.onBack(back)을 부르세요',
        },
        'back-still-taken': {
            problem: issue => `${issue.screen}: 첫 화면으로 돌아온 뒤에도 페이지가 Android 뒤로가기를 쥐고 있습니다`,
            fix: '첫 화면으로 돌아오면 apps.onBack(null)을 부르세요',
        },
        'stream-left': {
            problem: issue => `${issue.screen}: 화면을 떠난 뒤에도 실시간 업데이트 ${issue.count}개가 계속 돕니다`,
            fix: '화면이 닫힐 때 구독마다 stop()을 부르세요',
        },
        'listener-left': {
            problem: issue => `${issue.screen}: 화면을 떠난 뒤에도 이벤트 리스너 ${issue.count}개가 남습니다`,
            fix: '화면이 닫힐 때 removeEventListener로 지우세요',
        },
        'interval-left': {
            problem: issue => `${issue.screen}: 화면을 떠난 뒤에도 타이머 ${issue.count}개가 계속 돕니다`,
            fix: '화면이 닫힐 때 clearInterval을 부르세요',
        },
        'root-back-not-closing': {
            problem: () => '첫 화면에서 Android 뒤로가기를 눌러도 페이지가 닫히지 않습니다',
            fix: '첫 화면에서는 apps.onBack(null)을 부르고, 브라우저 기록을 쌓지 마세요',
        },
        'close-not-closing': {
            problem: () => '페이지를 닫을 수 없습니다',
            fix: 'onCloseRequest에서 true를 돌려주거나, 저장 안 된 작업이 있을 때만 쓰세요',
        },
        'theme-ignored': {
            problem: () => '앱의 테마가 바뀌어도 페이지가 바뀌지 않습니다',
            fix: 'apps.onContextChange에서 테마를 적용하세요',
        },
        'no-save-on-hide': {
            problem: () => '앱이 페이지를 숨길 때 저장하지 않습니다',
            fix: "document.visibilityState가 'hidden'이 되면 apps.storage에 저장하세요",
        },
        'asked-again': {
            problem: () => '사용자가 클라우드 데이터를 거절했는데 페이지가 다시 묻습니다',
            fix: 'CONSENT_REFUSED가 오면 왜 필요한지 설명하고 멈추세요',
        },
        'cloud-streams-open': {
            problem: issue => `사용자가 클라우드를 바꾼 뒤에도 실시간 업데이트 ${issue.count}개가 계속 돕니다`,
            fix: 'apps.data.onCloudChanged에서 구독을 멈추세요',
        },
        'cloud-ignored': {
            problem: () => '사용자가 다른 클라우드로 옮겨도 페이지가 반응하지 않습니다',
            fix: 'apps.data.onCloudChanged에서 안내를 보이거나 apps.finish()를 부르세요',
        },
        'cloud-retries': {
            problem: () => '사용자가 다른 클라우드로 옮긴 뒤에도 페이지가 계속 데이터를 요청합니다',
            fix: 'apps.data.onCloudChanged에서 읽기를 멈추세요. 더는 답이 오지 않습니다',
        },
        'big-list': {
            problem: issue => `${issue.screen}: 목록이 길면 페이지가 요소 ${issue.count}개를 그립니다`,
            fix: '화면에 보이는 행만 들고 그리세요',
        },
        'no-retry': {
            problem: issue => `${issue.detail} 읽기가 너무 잦다고 거절되자 페이지가 포기했습니다`,
            fix: 'RATE_LIMITED가 오면 error.details.retryAfterMs만큼 기다렸다 다시 하세요',
        },
    },
    passed: '✓ 넘길 준비가 됐습니다.',
    failed: count => `✗ 고칠 것 ${count}개.`,
    noScenarioFile:
        '화면 이동 검사는 건너뛰었습니다: 화면마다 뒤로가기와 정리를 검사하려면 chatic-apps.scenarios.ts를 두세요.',
    notBuilt: '동작 검사는 건너뛰었습니다: 먼저 페이지를 빌드하세요.',
    talksTo: hosts => `페이지가 통신하는 곳: ${hosts} — 각각 무엇을 받는지 확인하세요.`,
    bundle: (files, kilobytes) => `번들: 파일 ${files}개, ${kilobytes} KB.`,
    detailsHint: '줄마다 어떤 규칙인지 보려면 --details를 붙이세요.',
    bundled: (file, files) => `✓ 파일 ${files}개를 ${file}에 묶었습니다. 넘길 zip은 이것입니다.`,
    bundleFailed: reason => `✗ 페이지를 묶지 못했습니다: ${reason}`,
};
