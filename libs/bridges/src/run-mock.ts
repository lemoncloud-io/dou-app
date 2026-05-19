import { MockBridgeAdapter, MockWebBridgeClient } from './web';
import { MockAppBridgeHost } from './app';
import type { RequestType, TypedRequestMessage } from './common';
import * as readline from 'readline';
import type { Ping, Pong } from '@chatic/app-messages';

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

appHost.registerHandler('Ping', async (payload: Ping): Promise<Pong> => {
    // 이제 데이터(payload)만 추출되지 않고 메시지 전체(RequestMessage)가 들어옵니다.
    // 기존 호환성을 위해 message 내부의 payload(또는 data)를 꺼내 사용합니다.
    const pingData = payload.data;
    logger.app(`[MockAppBridgeHost] 'Ping' 수신. payload: ${pingData.payload?.length ?? 0} bytes`);

    // 응답으로 감싸질 결과(result) 데이터를 반환합니다.
    return {
        data: {
            payload: pingData.payload,
        },
    } as Pong;
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
                // 파라미터는 Omit<ExtractReqMessage<K>, 'type'> 형태이므로 동일하게 사용 가능합니다.
                const response = (await webClient.request('Ping', { data: { payload: 'hello' } })) as any;
                logger.web(`✅ 'Pong' 응답 수신:`, response);
            } catch (error) {
                logger.web('❌ 응답 실패:', error);
            }
            break;
        }

        case '2':
            logger.app("Web으로 'OnReceiveNotification' 이벤트를 푸시합니다.");
            // 인터페이스 변경에 따라 분리된 파라미터가 아닌, type이 포함된 전체 객체를 전달합니다.
            appHost.pushEvent({
                type: 'OnReceiveNotification',
                notification: { title: 'Mock Push', body: '테스트 푸시입니다.' },
            } as any);
            break;

        case '3': {
            logger.web("App으로 'Ping' (대용량 문자열) 요청을 보냅니다...");
            try {
                const requestPayload = 'A'.repeat(1024 * 1024); // 1MB
                const startTime = performance.now();

                // response 역시 전체 메시지 규격으로 반환됩니다.
                const response = (await webClient.request('Ping', { data: { payload: requestPayload } })) as any;

                const endTime = performance.now();
                const rtt = (endTime - startTime).toFixed(2);

                // 실제 반환된 구조(응답이 data에 매핑되는지 여부)에 따라 접근 경로가 달라질 수 있습니다.
                const responsePayloadLength = response.payload?.length ?? response.data?.payload?.length ?? 0;
                logger.web(`✅ 응답 완료! 길이: ${responsePayloadLength}, ⏱️ ${rtt}ms`);
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

// 이벤트 구독 테스트 (이제 payload가 아닌 event message 전체를 수신합니다)
webClient.onEvent('OnReceiveNotification', message => {
    logger.web(`✅ "OnReceiveNotification" 이벤트 수신됨! Message:`, message);
});

displayMenu();
