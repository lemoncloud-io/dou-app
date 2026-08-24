import { useCallback } from 'react';
import { ingestLogEntry } from '@chatic/logger';
import type { WebMessageData } from '@chatic/app-messages';

export const useLogHandler = () => {
    const handleSendLog = useCallback(async (message: WebMessageData<'SendLog'>) => {
        const { level = 'info', tag, message: logMessage, data, error, timestamp, source, ...context } = message.data;

        // Ingest as-is (ADR-0047): the original tag, occurrence timestamp and
        // source survive the bridge instead of being rewritten to WEBVIEW /
        // receive-time, and data+error ride together (no more either/or).
        // `timestamp` is absent for pre-ADR-0047 web builds — fall back to
        // receive time so legacy payloads keep working.
        // The id and occurrence-time context are spread first so the explicit
        // fields below always win. Keeping the id is what lets the uploader
        // drain this buffer without turning one web log into two documents.
        ingestLogEntry({
            ...context,
            level,
            tag: tag ?? 'WEBVIEW',
            message: logMessage,
            data,
            error,
            timestamp: timestamp ?? Date.now(),
            source: source ?? 'web',
        });

        // 응답을 보내지 않습니다. 웹의 로그 전달자(`createNativeForwarder`)는 `WebBridgeClient`를
        // 우회해 refId 없이 올려보내므로, `OnSendLog`가 내려가도 매칭될 pending이 없어 리스너 없는
        // 이벤트로 폐기됩니다. 그런데 그 폐기되는 응답 한 건마다 UI 스레드의 evaluateJavascript가
        // 한 번 돌고, 그건 캐시 왕복이 쓰는 자원과 같습니다. 캐시 계측이 느린 호출마다 경고를 내는
        // 구조라 정체가 시작되면 로그 건수가 캐시 요청 건수만큼 늘어나므로, 이 낭비가 정체를
        // 증폭시키는 쪽으로 작동했습니다.
    }, []);

    return {
        handleSendLog,
    };
};
