import type { ClientSocketV2 } from '@lemoncloud/chatic-sockets-lib';

/**
 * v2 웹소켓 클라이언트의 상위 계층 인터페이스입니다.
 * ClientSocketV2를 확장하여 동일한 규격을 사용하도록 합니다.
 */
export interface ISocketClient extends ClientSocketV2 {}
