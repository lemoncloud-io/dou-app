/**
 * 이벤트 타입 공개 진입점입니다.
 * 실제 정의는 common/socket/domain 파일로 나누어 god module화를 피하고,
 * 기존 `../events/types` import 경로는 이 barrel을 통해 유지합니다.
 */
export * from './domain';
