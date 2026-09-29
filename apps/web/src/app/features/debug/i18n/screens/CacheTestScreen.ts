import { defineDebugStrings } from '../define';

/**
 * `addLog`'s tag argument is localized here (`log.tags.*`) except for the `SQL_SAVE` / `SQL_FETCH` /
 * `SQL_CLEAR` constants, which are identical in both languages and stay inline in the component —
 * same for the `updateStats` operation labels that only combine a tag with a protocol name
 * (`SaveTestRecord`, `FetchTestRecord`): those names are protocol values and stay in English, so
 * only the tag word itself needs a `ko`/`en` pair (`log.concurrency.opLabel`, `log.stress.opLabel`).
 */

const en = {
    log: {
        tags: {
            telemetry: 'Telemetry',
            explorer: 'Explorer',
            concurrencyCheck: 'ConcurrencyCheck',
            stress: 'Stress',
            init: 'Init',
        },
        resetStats: 'System performance metrics have been reset.',
        explorer: {
            loaded: (count: number) => `Loaded ${count} SQLite test records.`,
            loadFailed: (message: string) => `Failed to load record list: ${message}`,
            enterKey: 'Enter a key for the record to add.',
            manualAddRequest: (key: string, value: string) => `Manual add request: '${key}' -> '${value}'`,
            saved: (key: string, durationMs: number) => `Saved record '${key}' (${durationMs.toFixed(1)}ms)`,
            saveFailed: (message: string) => `Failed to save record: ${message}`,
            manualAddOpLabel: 'Explorer:SaveTestRecord(manual add)',
            inlineEditRequest: (key: string, value: string) => `Inline edit request: '${key}' = '${value}'`,
            updated: (key: string, durationMs: number) => `Updated record '${key}' (${durationMs.toFixed(1)}ms)`,
            updateFailed: (message: string) => `Failed to update record: ${message}`,
            inlineEditOpLabel: 'Explorer:SaveTestRecord(inline edit)',
        },
        sqlSave: {
            bulkSaving: (count: number) => `Bulk-generating and saving ${count} unique records to the SQLite table...`,
            bulkSaved: (count: number, durationMs: number, perRecordMs: string) =>
                `Bulk-saved ${count} records successfully. Elapsed: ${durationMs.toFixed(1)}ms (${perRecordMs}ms/record)`,
            bulkSaveError: (durationMs: number, message: string) =>
                `Error during bulk save: ${durationMs.toFixed(1)}ms. Error: ${message}`,
        },
        sqlFetch: {
            fetching: 'Fetching all records from the SQLite database...',
            loaded: (count: number, durationMs: number, perRecordMs: string | number) =>
                `Loaded ${count} records. Elapsed: ${durationMs.toFixed(1)}ms (${perRecordMs}ms/record)`,
            fetchFailed: (durationMs: number, message: string) =>
                `Fetch failed: ${durationMs.toFixed(1)}ms. Error: ${message}`,
        },
        sqlClear: {
            clearing: "Clearing all records from the SQLite 'test_records' table...",
            cleared: (durationMs: number) => `SQLite table cleared successfully. Took: ${durationMs.toFixed(1)}ms`,
            clearFailed: (durationMs: number, message: string) =>
                `Clear operation failed: ${durationMs.toFixed(1)}ms. Error: ${message}`,
        },
        concurrency: {
            sending: (count: number, key: string) =>
                `Sending ${count} consecutive writes to key '${key}' in parallel (Promise.all)...`,
            waiting: 'Waiting for the parallel promises to resolve...',
            checking: (key: string) => `Writes complete. Checking the final persisted value of '${key}' in the DB...`,
            verified: (key: string, value: string) =>
                `🏆 Verification passed! The final value of '${key}' is '${value}' as expected. The native AsyncMutexQueue serialized the concurrent requests perfectly.`,
            raceDetected: (expected: string, actual: string) =>
                `⚠️ Race condition detected. Expected '${expected}' but the DB's actual value was corrupted to '${actual}'.`,
            verifyFailed: (message: string) => `Verification failed: ${message}`,
            opLabel: (count: number) => `ConcurrencyCheck:SaveTestRecord*${count}+FetchTestRecord`,
        },
        stress: {
            sending: (count: number, strategy: string) =>
                `Sending a total of ${count} load requests to the bridge using the ${strategy.toUpperCase()} strategy...`,
            complete: (elapsedMs: number, rps: number, successRate: number, avgMs: number, stddevMs: number) =>
                `Load test complete! Total time: ${elapsedMs.toFixed(0)}ms. Throughput: ${rps} req/s. Success rate: ${successRate}%. Average RTT: ${avgMs}ms (σ=${stddevMs}ms).`,
            aborted: (elapsedMs: number, message: string) =>
                `Load test aborted: ${elapsedMs.toFixed(0)}ms. Error: ${message}`,
            opLabel: (count: number, strategy: string) => `Stress:SaveTestRecord*${count}(${strategy})`,
        },
        init: {
            loaded: (env: string) => `Real-time telemetry dashboard loaded. Environment: ${env}`,
            envHybrid: 'hybrid app WebView',
            envBrowser: 'plain web browser',
        },
    },
    dbStatus: {
        sectionTitle: 'Live DB status',
        mobileAppLink: 'Mobile app link',
        connected: 'Connected (WebView)',
        notConnected: 'Not connected (plain browser)',
        deliveryGuarantee: 'Delivery guarantee',
        deliveryGuaranteeValue: 'Serialized queue (Active)',
        totalOperations: 'Total operations',
        avgRttLatency: 'Average RTT latency',
        rttStdDeviation: 'RTT std deviation',
        throughput: 'Throughput (ops/s)',
        failureCount: 'Failure count',
        benchmarkSuccessRate: 'Benchmark success rate',
        sqliteTargetTable: 'SQLite target table',
    },
    slowest: {
        sectionTitle: 'Top 10 slowest requests (by full RTT)',
        sampleCount: 'Sample count',
        avgRttMean: 'Average RTT (mean)',
        minRtt: 'Min RTT',
        maxRtt: 'Max RTT',
        empty: "No runs recorded yet. Run a performance scenario and they'll be tallied automatically.",
        runLog: 'Run log (slowest first)',
        resetStats: 'Reset stats',
    },
    tabs: {
        sectionTitle: 'Monitoring tab',
        scenarios: 'Performance scenarios',
        explorer: 'Record explorer',
        logs: (count: number) => `Live logs (${count})`,
    },
    scenario1: {
        title: 'Scenario 1: Bulk data performance',
        description:
            "Measures native SQLite's elapsed time and average throughput under frequent bulk write and read operations.",
        countLabel: 'Number of records to test',
        chip: (count: number) => `${count} records`,
        bulkSave: 'Bulk save',
        bulkLoad: 'Bulk load',
        clearAll: 'Clear all',
    },
    scenario2: {
        title: 'Scenario 2: Concurrent write consistency & mutex check',
        description:
            'Sends hundreds of concurrent write requests to the same key (Promise.all), and verifies that the final saved record exactly matches the last requested value — sequential consistency.',
        keyLabel: 'Test table key',
        countLabel: 'Concurrent write count (N)',
        writeCountOption: (count: number) => `${count} consecutive writes`,
        running: 'Verifying serialized write-queue ordering...',
        passed: 'Sequential consistency verified (passed)',
        failed: 'Sequential consistency corrupted (failed)',
        expectedLabel: 'Expected final value:',
        actualLabel: 'Actual DB value:',
        elapsedLabel: 'Elapsed:',
        runButton: 'Run consistency check',
    },
    scenario3: {
        title: 'Scenario 3: Hybrid bridge saturation stress test',
        description:
            'Floods the WebView bridge with thousands of concurrent operations across different routing strategies to test response speed and queuing stability under saturation.',
        totalRequestsLabel: 'Total requests to send',
        bridgeLoadOption: (count: number) => `${count} bridge load requests`,
        strategyLabel: 'Load distribution strategy',
        strategyParallel: 'All at once, parallel (Promise.all)',
        strategyChunked: 'Chunked in groups (50 at a time)',
        strategySequential: 'Single sequential send (waterfall)',
        sendProgress: 'Send progress',
        report: 'Stress benchmark report',
        totalTime: 'Total time',
        throughput: 'Throughput',
        successRate: 'Success rate',
        avgRtt: 'Average RTT',
        rttStdDeviation: 'RTT std deviation',
        slowestTop1: 'Slowest request (Top1)',
        top10Title: 'Top 10 slowest requests (single-request RTT during flood)',
        startButton: 'Start bridge saturation test',
    },
    explorerTab: {
        title: 'SQLite live record explorer',
        description:
            "A data control panel to browse every record in the mobile device's SQLite `test_records` table, and edit or add them individually.",
        addNewTitle: 'Manually add a new test record',
        keyPlaceholder: 'Enter key...',
        valuePlaceholder: 'Enter value...',
        addButton: 'Add',
        filterPlaceholder: 'Live filter by key or value...',
        refreshTitle: 'Refresh list',
        loading: 'Loading SQLite DB...',
        noData: 'No data.',
        noDataHint: 'Insert data first, using the manual add form or a performance scenario tab.',
        emptyValue: '(empty)',
        saveTitle: 'Save changes',
        cancelTitle: 'Cancel',
        editTitle: 'Edit value',
        lastChanged: 'Last changed',
    },
    logsTab: {
        title: (count: number) => `Live telemetry log (${count})`,
        clear: 'Clear log stream',
        resetStats: 'Reset rolling stats',
        emptyLine1: 'No measurement data or event history yet.',
        emptyLine2: 'Run a performance scenario or a record action.',
    },
};

const ko: typeof en = {
    log: {
        tags: {
            telemetry: '텔레메트리',
            explorer: '익스플로러',
            concurrencyCheck: '동시성_검증',
            stress: '스트레스',
            init: '초기화',
        },
        resetStats: '시스템 성능 분석 지표가 초기화되었습니다.',
        explorer: {
            loaded: count => `총 ${count}개의 SQLite 테스트 데이터를 로드했습니다.`,
            loadFailed: message => `레코드 목록 로드 실패: ${message}`,
            enterKey: '추가할 레코드의 Key를 입력해주세요.',
            manualAddRequest: (key, value) => `수동 레코드 추가 요청: '${key}' -> '${value}'`,
            saved: (key, durationMs) => `레코드 '${key}' 저장 성공 (${durationMs.toFixed(1)}ms)`,
            saveFailed: message => `레코드 저장 실패: ${message}`,
            manualAddOpLabel: '익스플로러:SaveTestRecord(수동 추가)',
            inlineEditRequest: (key, value) => `인라인 레코드 수정 요청: '${key}' = '${value}'`,
            updated: (key, durationMs) => `레코드 '${key}' 수정 성공 (${durationMs.toFixed(1)}ms)`,
            updateFailed: message => `레코드 수정 실패: ${message}`,
            inlineEditOpLabel: '익스플로러:SaveTestRecord(인라인 수정)',
        },
        sqlSave: {
            bulkSaving: count => `SQLite 테이블에 고유 데이터 ${count}개를 벌크 생성 및 저장 중...`,
            bulkSaved: (count, durationMs, perRecordMs) =>
                `성공적으로 ${count}개의 데이터를 벌크 저장했습니다. 경과 시간: ${durationMs.toFixed(1)}ms (${perRecordMs}ms/레코드)`,
            bulkSaveError: (durationMs, message) =>
                `벌크 저장 중 오류 발생: ${durationMs.toFixed(1)}ms. 에러: ${message}`,
        },
        sqlFetch: {
            fetching: 'SQLite 데이터베이스에서 전체 데이터 조회를 실행 중...',
            loaded: (count, durationMs, perRecordMs) =>
                `총 ${count}개의 레코드를 로드했습니다. 경과 시간: ${durationMs.toFixed(1)}ms (${perRecordMs}ms/레코드)`,
            fetchFailed: (durationMs, message) => `조회 실패: ${durationMs.toFixed(1)}ms. 에러: ${message}`,
        },
        sqlClear: {
            clearing: "SQLite 'test_records' 테이블의 모든 레코드를 비우는 중...",
            cleared: durationMs => `SQLite 테이블을 성공적으로 초기화했습니다. 소요 시간: ${durationMs.toFixed(1)}ms`,
            clearFailed: (durationMs, message) => `초기화 작업 실패: ${durationMs.toFixed(1)}ms. 에러: ${message}`,
        },
        concurrency: {
            sending: (count, key) => `동일 키 '${key}'에 대해 ${count}회 연속 쓰기 명령을 병렬 전송(Promise.all) 중...`,
            waiting: '병렬 Promise들의 반환을 대기 중...',
            checking: key => `연속 쓰기 완료. DB에 최종적으로 영속화된 '${key}'의 값을 확인 중...`,
            verified: (key, value) =>
                `🏆 검증 성공! '${key}'의 최종값은 예상대로 '${value}'입니다. 네이티브 AsyncMutexQueue가 동시 요청을 완벽히 직렬화하여 처리했습니다.`,
            raceDetected: (expected, actual) =>
                `⚠️ 레이스 컨디션 감지. 예상치 '${expected}' 이지만 DB 실젯값은 '${actual}'로 훼손되었습니다.`,
            verifyFailed: message => `검증 실패: ${message}`,
            opLabel: count => `동시성_검증:SaveTestRecord*${count}+FetchTestRecord`,
        },
        stress: {
            sending: (count, strategy) =>
                `${strategy.toUpperCase()} 전략으로 총 ${count}회의 부하 요청을 브릿지에 전달 중...`,
            complete: (elapsedMs, rps, successRate, avgMs, stddevMs) =>
                `부하 테스트 완료! 총 소요 시간: ${elapsedMs.toFixed(0)}ms. 처리량: ${rps} req/s. 성공률: ${successRate}%. 평균 RTT: ${avgMs}ms (σ=${stddevMs}ms).`,
            aborted: (elapsedMs, message) => `부하 테스트 중단: ${elapsedMs.toFixed(0)}ms. 에러: ${message}`,
            opLabel: (count, strategy) => `스트레스:SaveTestRecord*${count}(${strategy})`,
        },
        init: {
            loaded: env => `실시간 텔레메트리 대시보드가 로드되었습니다. 환경: ${env}`,
            envHybrid: '하이브리드 앱 웹뷰',
            envBrowser: '일반 웹 브라우저',
        },
    },
    dbStatus: {
        sectionTitle: '실시간 DB 상태 정보',
        mobileAppLink: '모바일 앱 연동',
        connected: '연결됨 (WebView)',
        notConnected: '미연결 (일반 브라우저)',
        deliveryGuarantee: '통신 보증',
        deliveryGuaranteeValue: '직렬화 큐 (Active)',
        totalOperations: '총 실행 수',
        avgRttLatency: '평균 RTT 지연시간',
        rttStdDeviation: 'RTT 표준편차',
        throughput: '처리량 (ops/s)',
        failureCount: '실패 수',
        benchmarkSuccessRate: '벤치마크 성공 비율',
        sqliteTargetTable: 'SQLite 대상 테이블',
    },
    slowest: {
        sectionTitle: '느린 요청 TOP 10 (전체 RTT 기준)',
        sampleCount: '샘플 수',
        avgRttMean: '평균 RTT (mean)',
        minRtt: '최소 RTT',
        maxRtt: '최대 RTT',
        empty: '아직 측정된 실행 기록이 없습니다. 성능 시나리오를 실행하면 자동으로 집계됩니다.',
        runLog: '실행 기록 (느린 순)',
        resetStats: '통계 초기화',
    },
    tabs: {
        sectionTitle: '모니터링 탭 선택',
        scenarios: '성능 시나리오',
        explorer: '레코드 익스플로러',
        logs: count => `실시간 로그 (${count})`,
    },
    scenario1: {
        title: '시나리오 1: 대용량 데이터 성능 측정',
        description:
            '대량의 데이터 쓰기 및 조회 처리를 빈번히 수행할 때 네이티브 SQLite의 소요 시간 및 평균 처리량(throughput)을 측정합니다.',
        countLabel: '테스트 대상 레코드 개수',
        chip: count => `${count}개 레코드`,
        bulkSave: '대량 저장',
        bulkLoad: '대량 로드',
        clearAll: '전체 초기화',
    },
    scenario2: {
        title: '시나리오 2: 동시 쓰기 정합성 및 Mutex 검증',
        description:
            '동일한 키에 대해 수백 개의 빈번한 쓰기 요청을 동시에 전송(Promise.all)하고, 최종 저장된 레코드가 마지막으로 요청된 값과 정확히 일치하는지 순차 정합성을 검증합니다.',
        keyLabel: '테스트 테이블 키',
        countLabel: '동시 쓰기 횟수 (N)',
        writeCountOption: count => `${count}회 연속 쓰기`,
        running: '직렬화 쓰기 큐 순서 제어 검증 중...',
        passed: '순차 정합성 검증 완료 (통과)',
        failed: '순차 일관성 훼손 오류 (실패)',
        expectedLabel: '예상 최종값:',
        actualLabel: 'DB 실제값:',
        elapsedLabel: '소요 시간:',
        runButton: '순차 정합성 일관성 검증하기',
    },
    scenario3: {
        title: '시나리오 3: 하이브리드 브릿지 포화 스트레스 테스트',
        description:
            '웹뷰 브릿지를 통해 서로 다른 라우팅 방식으로 수천 개의 동시 작업을 쏟아부어 포화 상태에서의 반응 속도와 대기 전송 안정성을 테스트합니다.',
        totalRequestsLabel: '총 요청 전송 수',
        bridgeLoadOption: count => `${count}회 브릿지 부하 전송`,
        strategyLabel: '부하 분배 전송 방식',
        strategyParallel: '일시 병렬 전송 (Promise.all)',
        strategyChunked: '그룹 청크 분할 (50개씩 지연)',
        strategySequential: '단일 동기식 순차 전송 (Waterfall)',
        sendProgress: '부하 전송 진행도',
        report: '스트레스 벤치마크 분석 보고',
        totalTime: '총 소요 시간',
        throughput: '처리량',
        successRate: '전송 성공률',
        avgRtt: '평균 RTT',
        rttStdDeviation: 'RTT 표준편차',
        slowestTop1: '느린 요청 (Top1)',
        top10Title: '느린 요청 TOP 10 (Flood 단건 RTT)',
        startButton: '브릿지 포화 스트레스 테스트 기동',
    },
    explorerTab: {
        title: 'SQLite 실시간 레코드 익스플로러',
        description:
            '모바일 기기 SQLite `test_records` 테이블 내부의 모든 레코드를 조회하고 직접 개별적으로 수정 및 추가할 수 있는 데이터 제어 패널입니다.',
        addNewTitle: '신규 테스트 레코드 수동 추가',
        keyPlaceholder: '키 (Key) 입력...',
        valuePlaceholder: '값 (Value) 입력...',
        addButton: '추가',
        filterPlaceholder: '키 또는 값 실시간 필터 검색...',
        refreshTitle: '목록 새로고침',
        loading: 'SQLite DB 조회 중...',
        noData: '데이터가 없습니다.',
        noDataHint: '수동 추가 폼 또는 성능 시나리오 탭에서 데이터를 먼저 삽입하세요.',
        emptyValue: '(빈 값)',
        saveTitle: '수정사항 저장',
        cancelTitle: '취소',
        editTitle: '값 수정',
        lastChanged: '마지막 변경',
    },
    logsTab: {
        title: count => `텔레메트리 실시간 분석 로그 (${count})`,
        clear: '로그 스트림 비우기',
        resetStats: '롤링 통계 초기화',
        emptyLine1: '측정 데이터 및 이벤트 히스토리가 비어 있습니다.',
        emptyLine2: '성능 시나리오 또는 레코드 제어를 실행하세요.',
    },
};

export const useCacheTestStrings = defineDebugStrings({ ko, en });
