import { Smartphone } from 'lucide-react';

import { useDeviceInfo } from '@chatic/device-utils';

import type { AppPermissionType } from '@chatic/app-messages';

import { useDebugOperation } from '../../hooks';
import { CopyRow } from '../../components/CopyRow';
import { buildDeviceInfoRows } from '../../lib';
import { appBridge } from '../../../../bridge';
import { useDeviceInfoScreenStrings } from '../../i18n/screens/DeviceInfoScreen';

/**
 * OS pickers and permission prompts, moved off the app's Device Test screen (ADR-0080 decision 11).
 *
 * Every one of these is an existing bridge command — the web client simply had not exposed the
 * picker four. `MICROPHONE` needed the contract's `AppPermissionType` widened, which was a
 * type-only change: the app's `PERMISSION_MAP` already had it (see that union's note).
 */
const PERMISSIONS: readonly AppPermissionType[] = ['CAMERA', 'PHOTO_LIBRARY', 'CONTACTS', 'MICROPHONE'];

/** Device/version identity injected by the native shell — single source, replaces the
 *  old DebugPage card and the RuntimeOverlay device tab. Tap a row to copy. */
export const DeviceInfoScreen = () => {
    const { versionInfo, deviceInfo } = useDeviceInfo();
    // `fire` covers `openSettings`/`openShareSheet`, which are `post` based and answer nothing.
    const { result, run, fire } = useDebugOperation();
    const strings = useDeviceInfoScreenStrings();

    return (
        <div className="p-4">
            <p className="mb-4 text-[13px] text-muted-foreground">web v{versionInfo?.webVersion ?? '?'}</p>

            <div className="rounded-[18px] bg-card px-4 py-3 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none">
                <div className="mb-2 flex items-center gap-2">
                    <Smartphone size={16} className="text-muted-foreground" />
                    <span className="text-[13px] font-semibold text-foreground">{strings.deviceInfoTitle}</span>
                </div>
                <dl className="flex flex-col gap-1.5">
                    {buildDeviceInfoRows(deviceInfo, strings.rows).map(row => (
                        <CopyRow key={row.label} label={row.label} value={row.value} copyValue={row.copyValue} />
                    ))}
                </dl>
            </div>

            <div className="mt-4 rounded-[18px] bg-card px-4 py-3 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none">
                <span className="text-[13px] font-semibold text-foreground">{strings.actions.title}</span>
                <p className="mt-1 text-[12px] text-muted-foreground">{strings.actions.hint}</p>

                <div className="mt-3 flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() =>
                            void run(
                                strings.operations.camera,
                                () => appBridge.openCamera({ mediaType: 'photo' }),
                                'OpenCamera'
                            )
                        }
                        className="rounded-md border border-border px-2 py-1 text-xs"
                    >
                        {strings.actions.camera}
                    </button>
                    <button
                        type="button"
                        onClick={() =>
                            void run(
                                strings.operations.photoLibrary,
                                () => appBridge.openPhotoLibrary({ selectionLimit: 1, mediaType: 'photo' }),
                                'OpenPhotoLibrary'
                            )
                        }
                        className="rounded-md border border-border px-2 py-1 text-xs"
                    >
                        {strings.actions.photos}
                    </button>
                    <button
                        type="button"
                        onClick={() =>
                            void run(
                                strings.operations.file,
                                () => appBridge.openDocument({ allowMultiSelection: true }),
                                'OpenDocument'
                            )
                        }
                        className="rounded-md border border-border px-2 py-1 text-xs"
                    >
                        {strings.actions.file}
                    </button>
                    <button
                        type="button"
                        onClick={() =>
                            void run(strings.operations.contacts, () => appBridge.getContacts(), 'GetContacts')
                        }
                        className="rounded-md border border-border px-2 py-1 text-xs"
                    >
                        {strings.actions.contacts}
                    </button>
                    <button
                        type="button"
                        onClick={() =>
                            void run(
                                strings.operations.nativeClipboard,
                                () => appBridge.copyToClipboard('debug'),
                                'CopyToClipboard'
                            )
                        }
                        className="rounded-md border border-border px-2 py-1 text-xs"
                    >
                        {strings.actions.writeClipboard}
                    </button>
                    <button
                        type="button"
                        onClick={() => fire(strings.operations.openOsSettings, () => appBridge.openSettings())}
                        className="rounded-md border border-border px-2 py-1 text-xs"
                    >
                        {strings.actions.osSettings}
                    </button>
                    <button
                        type="button"
                        onClick={() =>
                            fire(strings.operations.shareSheet, () => appBridge.openShareSheet('https://chatic.io'))
                        }
                        className="rounded-md border border-border px-2 py-1 text-xs"
                    >
                        {strings.actions.shareSheet}
                    </button>
                </div>

                <p className="mt-3 text-[12px] text-muted-foreground">{strings.permissionsTitle}</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                    {PERMISSIONS.map(permission => (
                        <button
                            key={permission}
                            type="button"
                            onClick={() =>
                                void run(permission, () => appBridge.requestPermission(permission), 'RequestPermission')
                            }
                            className="rounded-md border border-border px-2 py-1 text-xs"
                        >
                            {permission}
                        </button>
                    ))}
                </div>

                {result && <p className="mt-3 break-all font-mono text-[12px] text-muted-foreground">{result}</p>}
            </div>
        </div>
    );
};
