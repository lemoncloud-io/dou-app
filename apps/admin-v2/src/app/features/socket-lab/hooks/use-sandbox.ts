import { useCallback, useEffect, useRef, useState } from 'react';

import { SandboxController, type ClientSnapshot } from '../runtime/sandbox-controller';

const COLORS = ['#2dd4bf', '#a78bfa', '#f0883e', '#4db8ff'];
const LETTERS = ['A', 'B', 'C', 'D'];
const MAX = 4;

export type MatrixValue = number | 'loss';

export interface Sandbox {
    clients: ClientSnapshot[];
    controllers: Map<string, SandboxController>;
    matrix: Record<string, MatrixValue>;
    showMatrix: boolean;
    canAdd: boolean;
    addClient: () => void;
    removeClient: (id: string) => void;
    disconnectAll: () => void;
    toggleMatrix: () => void;
}

export function useSandbox(endpoint: string): Sandbox {
    const [, setV] = useState(0);
    const rerender = useCallback(() => setV(v => v + 1), []);

    const ctrlRef = useRef<Map<string, SandboxController> | undefined>(undefined);
    if (!ctrlRef.current) ctrlRef.current = new Map();
    const orderRef = useRef<string[]>([]);
    const nRef = useRef(0);
    const endpointRef = useRef(endpoint);
    endpointRef.current = endpoint;

    const [matrix, setMatrix] = useState<Record<string, MatrixValue>>({});
    const [showMatrix, setShowMatrix] = useState(true);

    const buildWsUrl = useCallback(() => {
        const e = `${endpointRef.current ?? ''}`.trim();
        return e ? e + (e.includes('?') ? '&' : '?') + 'v2=' : e;
    }, []);

    const addClient = useCallback(() => {
        const map = ctrlRef.current;
        if (!map || map.size >= MAX) return;
        // 빈 슬롯(A→D 순)에 배정 — 항상 A,B부터 채우고 중간 제거 후 추가해도 문자 중복 없음.
        const used = new Set([...map.values()].map(c => c.letter));
        const slot = LETTERS.findIndex(l => !used.has(l));
        if (slot < 0) return;
        const letter = LETTERS[slot];
        const id = `cl${nRef.current++}-${letter}`;
        const c = new SandboxController({
            id,
            letter,
            color: COLORS[slot],
            wsUrl: buildWsUrl(),
            onRecv: (from, to, ms) => setMatrix(mx => ({ ...mx, [`${from}>${to}`]: Math.round(ms) })),
        });
        c.subscribe(rerender);
        map.set(id, c);
        orderRef.current = [...orderRef.current, id];
        rerender();
    }, [buildWsUrl, rerender]);

    const removeClient = useCallback(
        (id: string) => {
            const map = ctrlRef.current;
            const c = map?.get(id);
            if (!map || !c) return;
            c.dispose();
            map.delete(id);
            orderRef.current = orderRef.current.filter(x => x !== id);
            rerender();
        },
        [rerender]
    );

    const disconnectAll = useCallback(() => {
        ctrlRef.current?.forEach(c => void c.disconnect());
    }, []);

    // 초기 2개 생성 + 언마운트 시 전체 dispose
    useEffect(() => {
        if (ctrlRef.current && ctrlRef.current.size === 0) {
            addClient();
            addClient();
        }
        return () => {
            ctrlRef.current?.forEach(c => c.dispose());
            ctrlRef.current?.clear();
            orderRef.current = [];
        };
    }, [addClient]);

    const map = ctrlRef.current;
    const clients = orderRef.current
        .map(id => map?.get(id))
        .filter((c): c is SandboxController => !!c)
        .map(c => c.snapshot());

    return {
        clients,
        controllers: map ?? new Map(),
        matrix,
        showMatrix: showMatrix && clients.length >= 2,
        canAdd: (map?.size ?? 0) < MAX,
        addClient,
        removeClient,
        disconnectAll,
        toggleMatrix: () => setShowMatrix(v => !v),
    };
}
