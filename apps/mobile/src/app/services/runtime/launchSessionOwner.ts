import Config from 'react-native-config';

import { openSessionOwnerFile } from './runtimeStorageFiles';
import { readDefaultSessionOwner, readSessionOwnerChoice, unswitchedSessionOwnerChoice } from './sessionOwner';
import type { SessionOwner, SessionOwnerChoice, SessionOwnerFile } from './sessionOwner';

const unswitchedSessionOwnerChoiceOf = (file: SessionOwnerFile): SessionOwnerChoice =>
    unswitchedSessionOwnerChoice(Config.VITE_ENV, Config.VITE_SESSION_OWNER_DEFAULT, readDefaultSessionOwner(file));

export const unswitchedSessionOwner = (file: SessionOwnerFile): SessionOwner =>
    unswitchedSessionOwnerChoiceOf(file).owner;

let choice: SessionOwnerChoice | null = null;

export const launchSessionOwner = (): SessionOwner => launchSessionOwnerChoice().owner;

export const launchSessionOwnerChoice = (): SessionOwnerChoice => {
    if (choice === null) {
        try {
            const file = openSessionOwnerFile();
            choice = readSessionOwnerChoice(file, unswitchedSessionOwnerChoiceOf(file));
        } catch {
            choice = { owner: 'web', source: 'unreadable' };
        }
    }
    return choice;
};

let answered: SessionOwner | null = null;

export const recordAnsweredSessionOwner = (next: SessionOwner): void => {
    answered = next;
};

export const settledSessionOwner = (): SessionOwner | undefined =>
    launchSessionOwner() === 'web' ? 'web' : (answered ?? undefined);
