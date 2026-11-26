import { describeOwner, isOn } from '../engine';
import type { ModuleSet, RuntimeModules } from '../engine';

import * as connection from '../api/connection';
import * as data from '../api/data';
import * as push from '../api/push';
import * as report from '../api/report';
import * as session from '../api/session';
import * as settings from '../api/settings';
import * as sync from '../api/sync';
import { GROUP_MODULES } from './types';
import type { RuntimeGroupName, RuntimeGroups, RuntimeOf } from './types';

const GROUPS: RuntimeGroups = { session, connection, data, sync, push, report, settings };

export const groupIsOn = (group: RuntimeGroupName, modules: ModuleSet): boolean => {
    const owner = GROUP_MODULES[group];
    return owner === null || isOn(modules, owner);
};

export const runtimeOf = <M extends RuntimeModules>(modules: ModuleSet): RuntimeOf<M> => {
    const handle = {};
    for (const group of Object.keys(GROUPS) as RuntimeGroupName[]) {
        const on = groupIsOn(group, modules);
        Object.defineProperty(handle, group, {
            enumerable: on,
            get: () => {
                if (on) return GROUPS[group];
                throw new Error(
                    `[runtime] runtime.${group} is not in this runtime — it belongs to ${describeOwner(GROUP_MODULES[group] as NonNullable<(typeof GROUP_MODULES)[RuntimeGroupName]>)}, ` +
                        'and the runtime was started without it'
                );
            },
        });
    }
    return Object.freeze(handle) as RuntimeOf<M>;
};
