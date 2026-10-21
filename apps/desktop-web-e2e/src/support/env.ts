import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The suite's settings. Accounts come from the environment or from `apps/desktop-web-e2e/.env`, which
 * git ignores: these are real dev accounts and their credentials must never be committed.
 */
const ENV_FILE = join(__dirname, '../../.env');
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

export const E2E_PORT = Number(process.env['DESKTOP_E2E_PORT'] ?? 5391);
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;

/** Where the signed-in sessions are kept between the setup project and the scenarios. Under `dist`, never tracked. */
export const AUTH_DIR = join(__dirname, '../../../../dist/.playwright/apps/desktop-web-e2e/.auth');

export interface Account {
    role: 'main';
    email: string;
    password: string;
}

/**
 * Whose saved session a context starts from: `main`, the account every scenario runs as, or `peer`,
 * the other person in the two-person scenarios — a guest the people scenario invites into the sandbox
 * place and signs in on a device of its own.
 */
export type Role = 'main' | 'peer';

const account = (role: Account['role'], prefix: string): Account | undefined => {
    const email = process.env[`${prefix}_EMAIL`];
    const password = process.env[`${prefix}_PASSWORD`];
    return email && password ? { role, email, password } : undefined;
};

export const MAIN_ACCOUNT = account('main', 'DESKTOP_E2E');

/**
 * The phone number the people scenario invites the other person by. The invite is never delivered to
 * it: the scenario reads the link from the server's answer, so a placeholder number does.
 */
export const INVITE_PHONE = process.env['DESKTOP_E2E_INVITE_PHONE'];

export const storageFile = (role: Role) => join(AUTH_DIR, `${role}.storage.json`);
export const sessionFile = (role: Role) => join(AUTH_DIR, `${role}.session.json`);

/**
 * Where the scenarios that change a place may do so — names in the main account's own clouds, given
 * locally like the credentials: a cloud, a place in it where a test channel can be made and deleted,
 * and a place with no conversation yet, which opens on the welcome page. A scenario that needs one
 * skips when it is not set.
 */
export const SANDBOX = {
    cloud: process.env['DESKTOP_E2E_CLOUD'],
    place: process.env['DESKTOP_E2E_PLACE'],
    emptyPlace: process.env['DESKTOP_E2E_EMPTY_PLACE'],
};
