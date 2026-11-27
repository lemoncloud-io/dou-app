import { session } from 'electron';
import { grantsPermission } from './permissions';

export const bindPermissionRequests = (): void => {
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback, details) => {
        callback(grantsPermission(permission, details.requestingUrl));
    });
};
