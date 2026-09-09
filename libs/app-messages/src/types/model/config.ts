// src/types/model/config.ts

/** [요청] 셸의 범용 KV 저장소에 키 하나를 opaque 문자열로 저장한다. 셸은 의미를 모른다(ADR-0079 결정 9). */
export type SaveConfigValuePayload = {
    key: string;
    value: string;
};

/** [요청] 셸의 범용 KV 저장소에서 키 하나를 지운다 — 오버라이드 해제. */
export type ClearConfigValuePayload = {
    key: string;
};

/** [응답] 저장 결과. */
export type OnSaveConfigValuePayload = {
    key: string;
    success: boolean;
};

/** [응답] 삭제 결과. */
export type OnClearConfigValuePayload = {
    key: string;
    success: boolean;
};
