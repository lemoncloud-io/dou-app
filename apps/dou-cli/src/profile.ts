import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export const DEFAULT_PROFILE = join(homedir(), '.dou', 'default');

export const resolveProfile = (profile: string | undefined): string => resolve(profile ?? DEFAULT_PROFILE);

export const nodeDataDirectory = (profile: string): string => join(profile, 'node');
