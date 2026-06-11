import * as readline from 'readline';
import type { AppMessageData } from '@chatic/app-messages';
import { AppBridgeHost } from './app';
import { webClient } from './provider';
import { InMemoryAdapter } from './web/adapters';
import { JsonProtocol } from './common';

// --- 기본 설정 ---
const logger = {
    web: (...args: any[]) => console.log('🌐 [Web]', ...args),
    app: (...args: any[]) => console.log('📱 [App]', ...args),
    info: (...args: any[]) => console.log('ℹ️  [Info]', ...args),
    hr: () => console.log('\n' + '-'.repeat(40) + '\n'),
};

const adapter = new InMemoryAdapter();
const appHost = new AppBridgeHost({
    sendToWeb: message => {
        const decoded = JsonProtocol.decode(message);
        if (decoded) {
            adapter.receiveFromApp(decoded as any);
        }
    },
});
adapter.setAppHost(appHost);

// 기존 webClient 싱글톤의 통신 채널을 InMemoryAdapter로 교체하고 시뮬레이션을 설정합니다.
webClient.setAdapter(adapter);
webClient.configureEnvironment({ rttDelayMs: 20 });

// ======================================================================
// AppBridgeHost 핸들러 등록 (테스트 Native 비즈니스 로직)
// ======================================================================
appHost.registerHandler('Ping', async message => {
    // 타입 시스템에 의해 message.data가 PingPayload임이 보장되므로 옵셔널 체이닝(?.) 제거
    const pingPayload = message.data.payload;
    logger.app(`[InMemoryAdapter] 'Ping' 수신. payload 길이: ${pingPayload.length} bytes`);
    // HandlerResponse<'Ping'> 규격에 따라 refId, version 등의 메타데이터 없이 순수 응답만 반환
    return {
        type: 'Pong',
        success: true,
        data: {
            payload: pingPayload,
        },
    };
});
// --- 2. 실행 CLI ---
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});
function displayMenu() {
    logger.hr();
    const menu = `
[강타입(Typed) 기반 브릿지 시뮬레이션]
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
                // 타입 추론에 의해 response는 AppMessageData<'Pong'> 타입이 됩니다. ('any' 캐스팅 제거)
                const response = await webClient.request({
                    type: 'Ping',
                    data: {
                        payload: 'A',
                    },
                });
                logger.web(`✅ 'Pong' 응답 수신:`, response.data);
            } catch (error) {
                logger.web('❌ 응답 실패:', error);
            }
            break;
        }
        case '2':
            logger.app("Web으로 'OnReceiveNotification' 이벤트를 푸시합니다.");
            // App 이벤트 푸시는 AppMessageData<'OnReceiveNotification'> 전체 구조를 요구합니다.
            appHost.pushEvent<'OnReceiveNotification'>({
                type: 'OnReceiveNotification',
                success: true,
                data: {
                    notification: { title: 'Test Push', body: '테스트 푸시입니다.' },
                },
            } as AppMessageData<'OnReceiveNotification'>);
            break;
        case '3': {
            logger.web("App으로 'Ping' (대용량 문자열) 요청을 보냅니다...");
            try {
                const requestPayload = 'A'.repeat(1024 * 1024); // 1MB
                const startTime = performance.now();
                const response = await webClient.request({
                    type: 'Ping',
                    data: {
                        payload: requestPayload,
                    },
                });
                const endTime = performance.now();
                const rtt = (endTime - startTime).toFixed(2);
                // App의 응답 데이터는 'data' 필드에 위치합니다.
                const responsePayloadLength = (response as AppMessageData<'Pong'>).data.payload.length;
                logger.web(` 응답 완료! 길이: ${responsePayloadLength}, ⏱️ ${rtt}ms`);
            } catch (error) {
                logger.web(' 응답 실패:', error);
            }
            break;
        }
        case '4':
            logger.info('브릿지 시뮬레이션 환경을 종료합니다.');
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
logger.info('--- 대화형 Test Bridge Environment 시작 (프로덕션 타입 동기화 모드) ---');
// 이벤트 구독 테스트 (App에서 발송하는 전체 AppMessageData 규격을 수신합니다)
webClient.onEvent('OnReceiveNotification', message => {
    // message는 AppMessageData<'OnReceiveNotification'> 타입으로 자동 추론됩니다.
    logger.web(`✅ "OnReceiveNotification" 이벤트 수신됨! Message:`, message.data);
});
displayMenu();
