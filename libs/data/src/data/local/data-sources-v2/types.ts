import { logger } from '@chatic/bridges';

import type { DataContext, DataContextProvider } from '../../repositories-v2/types';
import { stableHash } from '../storages';

export type LocalDataSourceV2ContextOverride = Partial<DataContext>;
export type LocalDataSourceV2Unsubscribe = () => void;
export type LocalDataSourceV2Callback<T> = (value: T) => void;

export interface ILocalDataSourceV2<TItem, TListQuery, TListResult> {
    cacheRead(id: string, contextOverride?: LocalDataSourceV2ContextOverride): Promise<TItem | null>;
    cacheReadList(query: TListQuery, contextOverride?: LocalDataSourceV2ContextOverride): Promise<TListResult | null>;

    observeItem(
        id: string,
        callback: LocalDataSourceV2Callback<TItem | null>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): LocalDataSourceV2Unsubscribe;
    observeList(
        query: TListQuery,
        callback: LocalDataSourceV2Callback<TListResult | null>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): LocalDataSourceV2Unsubscribe;

    cacheWrite(item: Partial<TItem>, contextOverride?: LocalDataSourceV2ContextOverride): Promise<void>;
    cacheWriteMany(items: Array<Partial<TItem>>, contextOverride?: LocalDataSourceV2ContextOverride): Promise<void>;
    cacheDelete(id: string, contextOverride?: LocalDataSourceV2ContextOverride): Promise<void>;
    cacheDeleteMany(ids: string[], contextOverride?: LocalDataSourceV2ContextOverride): Promise<void>;
    cacheClear(contextOverride?: LocalDataSourceV2ContextOverride): Promise<void>;
}

/**
 * Observers that resolved to the same key, plus the one query they all need.
 *
 * The key is built from the query's own parameters, so same key means same query means same
 * result — the group runs it ONCE per re-emit and hands the value to every callback. Before this,
 * each observer ran its own copy: three mounted `useMyJoins` consumers observing one channel meant
 * three identical reads, and on native each read is a bridge round trip that queues behind the
 * others (measured 4 reads per write).
 *
 * This only holds while a key fully determines its query. A data source that lets a field reach
 * storage without putting it in the key would collapse two different reads into one wrong answer.
 */
interface ObserverGroup {
    query: () => Promise<unknown>;
    callbacks: Map<number, (value: never) => void>;
    /**
     * 이 그룹이 마지막으로 읽어낸 값, 그리고 아직 읽는 중이라면 그 진행 중인 읽기.
     *
     * 신규 구독자에게 저장소를 다시 읽히지 않기 위한 것입니다. 그룹핑만으로는 재emit 때만 합쳐졌고
     * **마운트는 각자 자기 쿼리를 돌았습니다** — 채팅방 진입 한 번에 훅 여러 개가 붙으면서 그 수만큼
     * 왕복이 났습니다. 같은 키는 같은 쿼리라는 전제가 재emit에서 성립한다면 마운트에서도 성립합니다.
     *
     * `hasValue`가 따로 있는 이유: `value`가 `null`/`undefined`인 것("행이 없다")과 아직 한 번도 안
     * 읽은 것은 다르고, 전자는 그대로 전달해야 하는 유효한 답입니다.
     *
     * **낡은 값을 줄 위험은 어디까지인가.** 구독자가 살아 있는 동안은 재emit이 올 때마다
     * 갱신되고, 마지막 구독자가 떠나도 그룹은 잠시 유예로 남는다(`RETIRED_GROUP_TTL_MS`) —
     * 단, 유예 중에 이 키에 해당하는 쓰기가 오면 재조회 대신 **그룹째 버려지므로**(`flush`),
     * 유예에서 되살아난 구독자가 볼 수 있는 값도 "마지막 구독자가 보던 것과 같고 그 뒤로
     * 아무 쓰기도 없었던" 값뿐입니다. 따라서 신규 구독자가 볼 수 있는 최악은 여전히 **기존
     * 구독자들이 보던 것과 똑같은 값**이고, 새 구독자 하나가 남들보다 앞선 값을 보는 불일치도
     * 이 규칙 덕분에 생기지 않습니다.
     *
     * 뒤집어 말하면 재emit 라우팅(`getAffectedListPrefixes`)에 빠뜨린 경로가 있으면 그 낡음이 더
     * 오래 보입니다. 그건 여기서 감출 문제가 아니라 그 라우팅에서 고칠 문제입니다.
     */
    value?: unknown;
    hasValue: boolean;
    pending?: Promise<unknown>;
}

/**
 * 마지막 구독자가 떠난 그룹을 값과 함께 붙잡아 두는 시간.
 *
 * 화면 전환은 구독을 파괴했다가 곧바로 재생성한다 — 방↔홈 한 사이클이 홈의 그룹 전부를
 * 지우고 다시 읽게 만들었고, 네이티브에서는 그 읽기 하나하나가 브릿지 왕복이었다. 이 유예
 * 동안 돌아온 재구독자는 저장소 대신 그룹의 값을 즉시 받는다. 값이 낡을 위험은 없다:
 * 유예 중인 그룹에 해당하는 쓰기가 오면 재조회하는 대신 그룹째 버린다(`flush`) — 듣는 이
 * 없는 재조회는 낭비이고, 남겨둔 값은 오답이 되기 때문이다. 즉 유예 그룹의 값은 언제나
 * "마지막 구독자가 보던 것과 같고, 그 뒤로 아무 쓰기도 없었던" 값이다.
 */
const RETIRED_GROUP_TTL_MS = 60_000;

/** 유예 그룹 수 상한 — 초과 시 가장 오래된 것부터 버린다. 값(페이지)을 들고 있으므로 무한정 쌓지 않는다. */
const MAX_RETIRED_GROUPS = 256;

/** Node에서만 존재하는 unref로 유예 타이머가 프로세스 종료를 붙잡지 않게 한다(브라우저는 no-op). */
const unrefTimer = (timer: ReturnType<typeof setTimeout>): void => {
    (timer as { unref?: () => void }).unref?.();
};

/**
 * 첫 쿼리 실패 후 재시도까지의 간격 (ADR-0059).
 *
 * 첫 쿼리가 실패하면(네이티브 브릿지 타임아웃·일시 오류) 콜백이 한 번도 불리지 않아 화면이
 * 빈 채로 고착됐고, 다음 쓰기 리이밋이나 재구독 전까지 회복 경로가 없었다 — 2026-08-14 폭주
 * 감사의 "프리뷰 영구 공백". 1초 뒤 한 번만 다시 읽는다: 실패의 주원인이 순간 혼잡이라 한
 * 번이면 대부분 회복되고, 지속 장애에서 루프를 돌면 그 재시도가 곧 혼잡의 연료가 된다 —
 * 그 경우는 기존 회복 경로(쓰기 리이밋·재구독)에 맡긴다.
 */
const INITIAL_QUERY_RETRY_DELAY_MS = 1_000;

export abstract class BaseLocalDataSourceV2 {
    private nextObserverId = 0;
    private readonly itemObservers = new Map<string, ObserverGroup>();
    private readonly listObservers = new Map<string, ObserverGroup>();
    private readonly pendingItemKeys = new Set<string>();
    private readonly pendingListPrefixes = new Set<string>();
    /**
     * 유예 중인(구독자 0) 그룹의 만료 타이머. 키는 두 레지스트리를 통틀어 유일하다(아이템 키는
     * `|item|` 세그먼트를 가진다). 삽입 순서 = 유예 시작 순서이므로 상한 초과 시 첫 엔트리가
     * 곧 가장 오래된 것이다.
     */
    private readonly retiredGroups = new Map<
        string,
        { registry: Map<string, ObserverGroup>; timer: ReturnType<typeof setTimeout> }
    >();
    private emitAllItems = false;
    private emitAllLists = false;
    private emitTimer: NodeJS.Timeout | null = null;

    protected constructor(protected readonly contextProvider: DataContextProvider) {}

    protected getContext(contextOverride?: LocalDataSourceV2ContextOverride): DataContext {
        return {
            ...this.contextProvider.getContext(),
            ...contextOverride,
        };
    }

    protected getUid(contextOverride?: LocalDataSourceV2ContextOverride): string {
        return this.getContext(contextOverride).uid || 'default';
    }

    protected getCid(contextOverride?: LocalDataSourceV2ContextOverride): string {
        return this.getContext(contextOverride).cid || 'default';
    }

    protected getSid(contextOverride?: LocalDataSourceV2ContextOverride): string | undefined {
        return this.getContext(contextOverride).sid;
    }

    protected getScopeKey(contextOverride?: LocalDataSourceV2ContextOverride): string {
        const context = this.getContext(contextOverride);
        // Scope hashing keeps observers isolated per cid/sid/uid tuple.
        return stableHash({
            cid: context.cid || 'default',
            sid: context.sid || '',
            uid: context.uid || 'default',
        });
    }

    protected createListObserverKey(
        parts: Array<string | number | boolean | undefined>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): string {
        const normalized = parts.map(part => String(part ?? '__all__')).join('|');
        return `${this.getScopeKey(contextOverride)}|${normalized}`;
    }

    /**
     * 캐시에서 읽은 행들을 id로 색인합니다.
     *
     * 병합 쓰기가 이걸 반드시 거쳐야 하는 이유: `CacheStorage.loadMany`는 **없는 id를 결과에서
     * 빼기 때문에** 반환 배열이 요청한 id 배열과 길이도 순서도 다릅니다. 예전처럼 `existing[index]`로
     * 짝을 맞추면 중간에 캐시에 없는 항목이 하나 있는 순간 그 뒤 전부가 남의 기존 행과 병합됩니다 —
     * 조용히 데이터를 섞는 실패라 눈에 늦게 띕니다.
     */
    protected indexById<T extends { id?: string }>(items: T[]): Map<string, T> {
        const byId = new Map<string, T>();
        for (const item of items) {
            if (item?.id) byId.set(item.id, item);
        }
        return byId;
    }

    protected assertRequiredString(value: string | undefined, fieldName: string): string {
        if (typeof value === 'string' && value.trim().length > 0) {
            return value;
        }
        throw new Error(`[LocalDataSourceV2] ${fieldName} is required.`);
    }

    /**
     * 아이템 옵저버 레지스트리 키. 리스트 키와 마찬가지로 scope를 포함합니다.
     *
     * 예전에는 raw `id`가 그대로 키였습니다. 그런데 그룹은 **첫 등록자의 query 클로저를 재사용**하므로
     * (`registerObserver`), 다른 cid/uid에서 같은 id를 관찰하면 뒤에 붙은 쪽이 앞선 scope의 데이터를
     * 받았습니다. 클라우드를 바꿔도 같은 id의 행이 존재하는 도메인에서 조용히 남의 데이터를 보여주는
     * 실패입니다.
     *
     * scope 정의는 `getScopeKey`가 소유하므로 하위 클래스의 재정의(ChannelLocalDataSourceV2가 sid를
     * 빼는 것)가 여기에도 그대로 적용됩니다 — 관찰과 재emit이 같은 함수를 지나므로 둘이 어긋날 수
     * 없습니다.
     */
    private createItemObserverKey(id: string, contextOverride?: LocalDataSourceV2ContextOverride): string {
        return `${this.getScopeKey(contextOverride)}|item|${id}`;
    }

    protected observeItemQuery<T>(
        id: string,
        query: () => Promise<T>,
        callback: LocalDataSourceV2Callback<T>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): LocalDataSourceV2Unsubscribe {
        return this.registerObserver(
            this.itemObservers,
            this.createItemObserverKey(id, contextOverride),
            query,
            callback
        );
    }

    protected observeListQuery<T>(
        key: string,
        query: () => Promise<T>,
        callback: LocalDataSourceV2Callback<T>
    ): LocalDataSourceV2Unsubscribe {
        return this.registerObserver(this.listObservers, key, query, callback);
    }

    private registerObserver<T>(
        registry: Map<string, ObserverGroup>,
        key: string,
        query: () => Promise<T>,
        callback: LocalDataSourceV2Callback<T>
    ): LocalDataSourceV2Unsubscribe {
        const observerId = ++this.nextObserverId;
        // 유예 중이던 그룹이면 되살린다 — 값이 살아 있으므로 아래 1번 분기가 저장소 없이 답한다.
        this.cancelRetirement(key);
        const group: ObserverGroup = registry.get(key) ?? {
            query: query as () => Promise<unknown>,
            callbacks: new Map(),
            hasValue: false,
        };
        group.callbacks.set(observerId, callback as (value: never) => void);
        registry.set(key, group);

        // The first emit goes to the newcomer alone — the others already have this value, and
        // re-delivering it would re-render every consumer on the key whenever one more mounts.
        //
        // 어디서 값을 얻느냐가 셋으로 갈립니다. 저장소를 새로 읽는 건 마지막 경우뿐입니다:
        //  1. 그룹이 이미 값을 갖고 있으면 그걸 그대로 준다 — 재emit이 같은 값을 나눠주는 것과 같은
        //     근거이고, 값이 낡았다면 다음 flush가 모두에게 새 값을 보냅니다.
        //  2. 같은 키의 읽기가 진행 중이면 그 Promise에 붙는다 — 마운트가 몰리는 순간(한 화면의 훅
        //     여러 개)이 정확히 여기 해당합니다.
        //  3. 둘 다 아니면(그 키의 첫 구독자) 읽는다.
        if (group.hasValue) {
            void this.safeNotify(async () => callback(group.value as T));
        } else if (group.pending) {
            const pending = group.pending;
            void this.safeNotify(async () => callback((await pending) as T));
        } else {
            const pending = query();
            group.pending = pending;
            void this.safeNotify(async () => {
                try {
                    const value = await pending;
                    // 이 그룹이 여전히 레지스트리의 현역일 때만 값을 심습니다. 읽는 동안 마지막
                    // 구독자가 떠났어도 그룹은 유예로 남아 있으므로(값을 심어두면 유예 내
                    // 재구독이 그대로 받습니다), 여기서 걸러지는 건 유예 만료/무효화로 정말
                    // 제거된 그룹뿐입니다 — 그 키가 새로 등록되면 새 객체를 받습니다.
                    if (registry.get(key) === group) {
                        group.value = value;
                        group.hasValue = true;
                    }
                    callback(value);
                } catch (error) {
                    // 실패를 삼키기만 하면 이 키의 모든 대기자가 무소식으로 남는다(빈 화면 고착).
                    // 한 번만 늦게 다시 읽는다 — INITIAL_QUERY_RETRY_DELAY_MS 참조.
                    this.scheduleInitialQueryRetry(registry, key, group);
                    throw error;
                } finally {
                    if (group.pending === pending) group.pending = undefined;
                }
            });
        }

        return () => {
            const current = registry.get(key);
            if (!current) return;
            current.callbacks.delete(observerId);
            if (current.callbacks.size === 0) {
                // 즉시 지우지 않고 유예로 넘긴다 — 화면 전환의 파괴/재생성 사이클에서 값이
                // 살아남아 재구독이 저장소(네이티브: 브릿지 왕복)를 건너뛴다.
                this.retireGroup(registry, key);
            }
        };
    }

    /**
     * 실패한 첫 쿼리의 1회 지연 재시도. 그 사이 그룹이 값을 얻었거나(재emit 성공), 다른 읽기가
     * 진행 중이거나, 유예 만료/무효화로 제거됐으면 아무것도 하지 않는다. 성공 시 값을 심고
     * **현재 대기 중인 모든 콜백**에 전달한다 — 첫 시도의 pending에 합류했던 구독자들도 그
     * 실패로 무소식이 된 상태라, 개별 경로가 아니라 그룹 전체에 줘야 빠짐이 없다.
     */
    private scheduleInitialQueryRetry(registry: Map<string, ObserverGroup>, key: string, group: ObserverGroup): void {
        const timer = setTimeout(() => {
            if (registry.get(key) !== group || group.hasValue || group.pending) return;
            const retry = group.query();
            group.pending = retry;
            void this.safeNotify(async () => {
                try {
                    const value = await retry;
                    if (registry.get(key) === group) {
                        group.value = value;
                        group.hasValue = true;
                    }
                    for (const callback of group.callbacks.values()) {
                        (callback as (value: unknown) => void)(value);
                    }
                } finally {
                    if (group.pending === retry) group.pending = undefined;
                }
            });
        }, INITIAL_QUERY_RETRY_DELAY_MS);
        unrefTimer(timer);
    }

    /** 유예 시작: TTL 만료 시 제거를 예약하고, 상한을 넘으면 가장 오래된 유예 그룹을 먼저 버린다. */
    private retireGroup(registry: Map<string, ObserverGroup>, key: string): void {
        this.cancelRetirement(key);
        if (this.retiredGroups.size >= MAX_RETIRED_GROUPS) {
            const oldestKey = this.retiredGroups.keys().next().value;
            if (oldestKey !== undefined) this.dropRetired(oldestKey);
        }
        const timer = setTimeout(() => this.dropRetired(key), RETIRED_GROUP_TTL_MS);
        unrefTimer(timer);
        this.retiredGroups.set(key, { registry, timer });
    }

    /** 유예 취소(재구독) — 그룹은 레지스트리에 그대로 남는다. */
    private cancelRetirement(key: string): void {
        const retired = this.retiredGroups.get(key);
        if (!retired) return;
        clearTimeout(retired.timer);
        this.retiredGroups.delete(key);
    }

    /** 유예 그룹 제거(만료·상한·쓰기 무효화) — 값째로 버려 다음 구독이 새로 읽게 한다. */
    private dropRetired(key: string): void {
        const retired = this.retiredGroups.get(key);
        if (!retired) return;
        clearTimeout(retired.timer);
        this.retiredGroups.delete(key);
        retired.registry.delete(key);
    }

    /**
     * `contextOverride`는 관찰 시점과 **같은 scope 키**를 만들기 위해 필요합니다. 쓰기와 관찰이 다른
     * scope를 계산하면 재emit이 아무도 깨우지 않고 화면이 낡은 채로 남습니다.
     */
    protected scheduleItemReemit(ids: string[], contextOverride?: LocalDataSourceV2ContextOverride, delay = 50): void {
        if (ids.length === 0) return;
        for (const id of ids) {
            if (id) this.pendingItemKeys.add(this.createItemObserverKey(id, contextOverride));
        }
        this.scheduleFlush(delay);
    }

    protected scheduleListReemit(prefixes: string[], delay = 50): void {
        if (prefixes.length === 0) return;
        for (const prefix of prefixes) {
            if (prefix) this.pendingListPrefixes.add(prefix);
        }
        this.scheduleFlush(delay);
    }

    protected scheduleFullReemit(delay = 50): void {
        this.emitAllItems = true;
        this.emitAllLists = true;
        this.scheduleFlush(delay);
    }

    private scheduleFlush(delay: number): void {
        if (this.emitTimer) {
            clearTimeout(this.emitTimer);
        }
        this.emitTimer = setTimeout(() => {
            void this.flush();
            this.emitTimer = null;
        }, delay);
    }

    private async flush(): Promise<void> {
        // Collect GROUPS, not individual observers: one query per key, however many are listening.
        // 유예 중인(구독자 0) 그룹이 걸리면 재조회 대신 그룹째 버린다 — 듣는 이 없는 재조회는
        // 낭비이고, 값을 남겨두면 유예 내 재구독이 이 쓰기 이전의 답을 받는다. 버려두면 그
        // 재구독은 첫 구독처럼 새로 읽으므로 낡은 값이 구조적으로 존재하지 않는다.
        const groups: ObserverGroup[] = [];
        const collect = (key: string, group: ObserverGroup): void => {
            if (group.callbacks.size === 0) this.dropRetired(key);
            else groups.push(group);
        };

        if (this.emitAllItems) {
            for (const [key, group] of [...this.itemObservers.entries()]) collect(key, group);
        } else {
            for (const key of this.pendingItemKeys) {
                const group = this.itemObservers.get(key);
                if (group) collect(key, group);
            }
        }

        if (this.emitAllLists) {
            for (const [key, group] of [...this.listObservers.entries()]) collect(key, group);
        } else {
            for (const [key, group] of [...this.listObservers.entries()]) {
                const shouldEmit = Array.from(this.pendingListPrefixes).some(prefix => key.startsWith(prefix));
                if (shouldEmit) collect(key, group);
            }
        }

        this.pendingItemKeys.clear();
        this.pendingListPrefixes.clear();
        this.emitAllItems = false;
        this.emitAllLists = false;

        await Promise.all(Array.from(new Set(groups)).map(group => this.notifyGroup(group)));
    }

    /** Runs a group's query once and delivers the value to everyone listening on that key. */
    private async notifyGroup(group: ObserverGroup): Promise<void> {
        let value: unknown;
        try {
            value = await group.query();
        } catch (error) {
            logger.error('CACHE', '[LocalDataSourceV2] observer query failed', { error });
            return;
        }
        // 재emit 결과도 그룹에 기억시킵니다. 이렇게 해야 이후에 같은 키로 붙는 구독자가 저장소를
        // 다시 읽지 않고 최신 값을 받습니다 — 기억하지 않으면 낡은 값을 주거나(더 나쁨) 마운트마다
        // 다시 읽는 원래 문제로 돌아갑니다. 실패한 재emit은 기록하지 않습니다(위에서 return).
        group.value = value;
        group.hasValue = true;
        for (const callback of group.callbacks.values()) {
            try {
                (callback as (value: unknown) => void)(value);
            } catch (error) {
                // One observer throwing must not stop the others, but it is still an app bug —
                // keep it in the buffer so it shows up as a breadcrumb on whatever report follows.
                logger.error('CACHE', '[LocalDataSourceV2] observer notify failed', { error });
            }
        }
    }

    private async safeNotify(task: () => Promise<void>): Promise<void> {
        try {
            await task();
        } catch (error) {
            logger.error('CACHE', '[LocalDataSourceV2] observer notify failed', { error });
        }
    }
}
