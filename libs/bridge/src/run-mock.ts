import { MockWebBridgeClient } from './web';
import { MockAppBridgeHost } from './app';
import { MockBridgeAdapter } from './web';
import type { RequestMessage } from './common';
import * as readline from 'readline';

type MockReqMap = {
    Ping: { data: {} };
};

type MockResMap = {
    Pong: { data: {} };
};

type MockEvtMap = {
    OnUpdate: { data: { status: string } };
};

// --- 기본 설정 ---
const logger = {
    web: (...args: any[]) => console.log('🌐 [Web]', ...args),
    app: (...args: any[]) => console.log('📱 [App]', ...args),
    info: (...args: any[]) => console.log('ℹ️  [Info]', ...args),
    hr: () => console.log('\\n' + '-'.repeat(40) + '\\n'),
};

// --- 1. 환경 및 연결 구성 ---

// 1a. App -> Web 방향의 통신 채널 (콜백)
const sendToWebChannel = (stringifiedMessage: string) => {
    logger.info(`[Channel] App -> Web 으로 메시지 전달`);
    const message = JSON.parse(stringifiedMessage);
    webAdapter.receiveMessageFromApp(message);
};

// 1b. Web -> App 방향의 통신 채널 (콜백)
const sendToAppChannel = (message: RequestMessage) => {
    logger.info(`[Channel] Web -> App 으로 메시지 전달: ${message.type}`);
    appHost.handleMessage(JSON.stringify(message));
};

// 1c. 제네릭이 적용된 강타입 Mock 객체 인스턴스화
const appHost = new MockAppBridgeHost<MockReqMap, MockResMap, MockEvtMap>({ sendToWeb: sendToWebChannel });
const webAdapter = new MockBridgeAdapter(sendToAppChannel);
const webClient = new MockWebBridgeClient<MockReqMap, MockResMap, MockEvtMap>({ adapter: webAdapter });

// Ping 핸들러 등록
appHost.registerHandler('Ping', async () => {
    logger.app("[MockAppBridgeHost] 'Ping' 요청 수신. 빈 객체로 응답합니다.");
    return {};
});

// --- 2. 실행 CLI ---

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

function displayMenu() {
    logger.hr();
    const menu = `
[강타입(Typed) 기반 Mock 테스트]
Web과 App이 실제 비동기 브릿지처럼 콜백을 통해 통신합니다.

  1. Web -> App 요청 (Ping -> Pong) (Promise)
  2. Web -> App 단방향 요청 (Ping) (void)
  3. App -> Web 이벤트 푸시 (OnUpdate)
  4. 종료 (Exit)

숫자 입력: `;
    rl.question(menu, answer => {
        handleMenuChoice(answer.trim());
    });
}

async function handleMenuChoice(choice: string) {
    switch (choice) {
        case '1':
            logger.web("App으로 'Ping' 요청을 보냅니다...");
            try {
                // 타입 검증: Ping은 {} 페이로드를 요구함
                const response = await webClient.request('Ping', {});
                logger.web(`✅ 최종 응답 수신:`, response.data);
            } catch (error) {
                logger.web('❌ 응답 실패:', error);
            }
            break;
        case '2':
            logger.web("App으로 'Ping' 단방향 메시지를 보냅니다 (응답 대기 없음).");
            // 단방향 요청으로 Ping 전송
            webClient.post('Ping', {});
            break;
        case '3':
            logger.app("Web으로 'OnUpdate' 이벤트를 푸시합니다.");
            // 타입 검증: OnUpdate는 { status: string } 페이로드를 요구함.
            appHost.pushEvent('OnUpdate', { status: 'updated' });
            break;
        case '4':
            logger.info('Mock 환경을 종료합니다.');
            rl.close();
            return;
        default:
            console.log('잘못된 입력입니다.');
            break;
    }
    // 비동기 로그들이 섞이는 것을 방지하기 위해 잠시 대기 후 메뉴 표시
    setTimeout(displayMenu, 100);
}

// --- 실행 ---
logger.info('--- 대화형 Mock Bridge Environment 시작 (제네릭 내재화 모드) ---');

// 타입 검증: OnUpdate 이벤트 구독 시 payload는 자동으로 { status: string } 으로 추론됨
webClient.onEvent('OnUpdate', payload => {
    logger.web(`✅ "OnUpdate" 이벤트 수신됨! Payload:`, payload);
});

displayMenu();
