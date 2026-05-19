import { MockWebBridgeClient } from './web';
import { MockAppBridgeHost } from './app';
import { MockBridgeAdapter } from './web';
import type { TypedRequestMessage, RequestType } from './common';
import * as readline from 'readline';

// --- 기본 설정 ---
const logger = {
    web: (...args: any[]) => console.log('🌐 [Web]', ...args),
    app: (...args: any[]) => console.log('📱 [App]', ...args),
    info: (...args: any[]) => console.log('ℹ️  [Info]', ...args),
    hr: () => console.log('\n' + '-'.repeat(40) + '\n'),
};

// --- 1. 환경 및 연결 구성 ---

// 1a. App -> Web 방향의 통신 채널 (콜백)
const sendToWebChannel = (stringifiedMessage: string) => {
    logger.info(`[Channel] App -> Web 으로 메시지 전달`);
    const message = JSON.parse(stringifiedMessage);
    webAdapter.receiveMessageFromApp(message);
};

// 1b. Web -> App 방향의 통신 채널 (콜백)
const sendToAppChannel = (message: TypedRequestMessage<RequestType>) => {
    logger.info(`[Channel] Web -> App 으로 메시지 전달: ${message.type}`);
    appHost.handleMessage(JSON.stringify(message));
};

// 1c. 제네릭이 내재화된 강타입 Mock 객체 인스턴스화
const appHost = new MockAppBridgeHost({ sendToWeb: sendToWebChannel });
const webAdapter = new MockBridgeAdapter(sendToAppChannel);
const webClient = new MockWebBridgeClient({ adapter: webAdapter });

// ======================================================================
// AppBridgeHost 핸들러 등록 (Mock Native 비즈니스 로직)
// ======================================================================

// 일반 Ping 테스트 핸들러 (빈 객체 왕복)
appHost.registerHandler('Ping', async () => {
    logger.app("[MockAppBridgeHost] 'Ping' 요청 수신. 'Pong'으로 응답합니다.");
    // PongPayload 반환 (빈 객체)
    return {};
});

// 대용량 LongPing 테스트 핸들러 (대규모 문자열 왕복)
appHost.registerHandler('LongPing', async payload => {
    logger.app(`[MockAppBridgeHost] 'LongPing' 수신 완료. (요청 데이터 길이: ${payload.payload.length} bytes)`);

    // 네이티브에서 1MB 크기의 응답 데이터를 생성하여 반환
    const responsePayload = 'B'.repeat(1024 * 1024 * 1);

    // LongPongPayload 반환
    return { payload: responsePayload };
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

  1. Web -> App 기본 핑퐁 테스트 (Ping) [Promise 반환]
  2. App -> Web 이벤트 푸시 (OnReceiveNotification)
  3. Web -> App 대용량 핑퐁 테스트 (LongPing) [1MB 왕복]
  4. 종료 (Exit)

숫자 입력: `;
    rl.question(menu, answer => {
        handleMenuChoice(answer.trim());
    });
}

async function handleMenuChoice(choice: string) {
    switch (choice) {
        case '1': {
            logger.web("App으로 'Ping' 요청을 보냅니다...");
            try {
                const startTime = performance.now();
                // 타입 검증: 빈 객체 전송, PongPayload 구조 수신
                const response = await webClient.request('Ping', { payload: '' });
                const endTime = performance.now();
                const rtt = (endTime - startTime).toFixed(2);
                logger.web(`✅ 'Pong' 최종 응답 수신:`, response, `(⏱️ 왕복 시간: ${rtt}ms)`);
            } catch (error) {
                logger.web('❌ 응답 실패:', error);
            }
            break;
        }

        case '2':
            logger.app("Web으로 'OnReceiveNotification' 이벤트를 푸시합니다.");
            // 타입 검증: OnReceiveNotification은 { notification: {...} } 페이로드를 요구함.
            appHost.pushEvent('OnReceiveNotification', {
                notification: { title: 'Mock Push', body: '테스트 푸시입니다.' },
            });
            break;

        case '3': {
            logger.web("App으로 'LongPing' (대용량 응답 대기) 요청을 보냅니다...");
            try {
                const requestPayload = 'A'.repeat(1024 * 1024); // 1MB 크기 요청 데이터 생성
                const startTime = performance.now();

                // 타입 검증: LongPingPayload({ payload: string }) 전송, LongPongPayload 수신
                const response = await webClient.request('LongPing', { payload: requestPayload });

                const endTime = performance.now();
                const rtt = (endTime - startTime).toFixed(2);

                logger.web(
                    `✅ 대용량 'LongPong' 응답 수신 성공! (응답 데이터 길이: ${response.payload.length} bytes, ⏱️ 왕복 시간: ${rtt}ms)`
                );
            } catch (error) {
                logger.web('❌ 응답 실패:', error);
            }
            break;
        }

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
logger.info('--- 대화형 Mock Bridge Environment 시작 (프로덕션 타입 동기화 모드) ---');

// 이벤트 구독 테스트
webClient.onEvent('OnReceiveNotification', payload => {
    logger.web(`✅ "OnReceiveNotification" 이벤트 수신됨! Payload:`, payload);
});

displayMenu();
