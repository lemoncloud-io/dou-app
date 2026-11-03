/**
 * `lib/cost-monitor/display.spec.ts`
 */
import { describe, expect, it } from 'vitest';

import { cloudLabel, ownersOf, tenantKind, tenantTitle } from './display';

import type { Tenant } from './relations';

const tenant = (over: Partial<Tenant>): Tenant => ({ key: 'k', workspaces: [], slots: [], dou: false, ...over });

describe('display', () => {
    it('titles a row by its workspaces, else by its slots', () => {
        expect(
            tenantTitle(
                tenant({
                    workspaces: [
                        { id: '1', name: 'a', dou: false },
                        { id: '2', name: 'b', dou: false },
                    ],
                })
            )
        ).toBe('a · b');
        expect(tenantTitle(tenant({ slots: [{ id: '9', state: 'idle' }] }))).toBe('slot #9');
    });

    it('tells DoU, general and slot-only rows apart', () => {
        expect(tenantKind(tenant({ workspaces: [{ id: '1', name: 'a', dou: true }], dou: true }))).toBe('DoU');
        expect(tenantKind(tenant({ workspaces: [{ id: '1', name: 'a', dou: false }] }))).toBe('general');
        expect(tenantKind(tenant({}))).toBe('slot only');
    });

    it('lists each owner once, by name or by id', () => {
        const ws = [
            { id: '1', name: 'a', dou: false, ownerName: 'Kim' },
            { id: '2', name: 'b', dou: false, ownerName: 'Kim' },
            { id: '3', name: 'c', dou: false, ownerId: 'u3' },
            { id: '4', name: 'd', dou: false },
        ];
        expect(ownersOf(tenant({ workspaces: ws }))).toBe('Kim, #u3');
    });

    it('names a cloud with its status, or by id when it has no name', () => {
        expect(cloudLabel([{ id: '1', name: 'osx', status: 'suspended' }, { id: '2' }])).toBe('osx (suspended) · #2');
        expect(cloudLabel(undefined)).toBe('');
    });
});
