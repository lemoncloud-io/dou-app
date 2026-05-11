import type { ISocketClient } from '../../clients';

/**
 * 특정 도메인에 대한 API를 제공하는 게이트웨이의 기본 인터페이스입니다.
 * 모든 도메인 게이트웨이는 SocketClient 인스턴스를 통해 통신합니다.
 * TODO: 타입은 이후 정해질 예정
 */
export interface SocketGateway {
    /** 게이트웨이가 사용하는 소켓 클라이언트 인스턴스 */
    readonly client: ISocketClient;
    /** 게이트웨이가 담당하는 도메인 이름 (예: 'chat', 'channel') */
    readonly domain: string;
}

/**
 * 도메인 게이트웨이를 생성하는 팩토리 함수의 타입 시그니처입니다.
 * TODO: 타입은 이후 정해질 예정
 *
 * @param domain 생성할 게이트웨이의 도메인 이름
 * @param client 통신에 사용할 SocketClient 인스턴스
 * @returns 생성된 DomainGateway 인스턴스
 */
export type SocketGatewayFactory<T extends SocketGateway> = (domain: T['domain'], client: ISocketClient) => T;
