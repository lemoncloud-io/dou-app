import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

const ENV_FILE = join(__dirname, '../../.env');
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

const readEnvFile = (file: string): Record<string, string | undefined> =>
    existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {};

export const sharedServeEnv = (): Record<string, string> => {
    const own = readEnvFile(join(__dirname, '../../../desktop-web/.env'));
    const shared = readEnvFile(join(__dirname, '../../../../.env.serve'));
    return Object.fromEntries(
        Object.entries(shared).filter((entry): entry is [string, string] => !own[entry[0]] && !!entry[1])
    );
};

export const E2E_PORT = Number(process.env['DESKTOP_E2E_PORT'] ?? 5391);
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;

export const AUTH_DIR = join(__dirname, '../../../../dist/.playwright/apps/desktop-web-e2e/.auth');

export interface Account {
    role: 'main';
    email: string;
    password: string;
}

export type Role = 'main' | 'peer';

const account = (role: Account['role'], prefix: string): Account | undefined => {
    const email = process.env[`${prefix}_EMAIL`];
    const password = process.env[`${prefix}_PASSWORD`];
    return email && password ? { role, email, password } : undefined;
};

export const MAIN_ACCOUNT = account('main', 'DESKTOP_E2E');

export const INVITE_PHONE = process.env['DESKTOP_E2E_INVITE_PHONE'];

export const storageFile = (role: Role) => join(AUTH_DIR, `${role}.storage.json`);
export const sessionFile = (role: Role) => join(AUTH_DIR, `${role}.session.json`);

export const SANDBOX = {
    cloud: process.env['DESKTOP_E2E_CLOUD'],
    place: process.env['DESKTOP_E2E_PLACE'],
    emptyPlace: process.env['DESKTOP_E2E_EMPTY_PLACE'],
};
