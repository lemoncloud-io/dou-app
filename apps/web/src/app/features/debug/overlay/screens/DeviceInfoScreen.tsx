import { Copy, Smartphone } from 'lucide-react';

import { useDeviceInfo } from '@chatic/device-utils';

import type { AppPermissionType } from '@chatic/app-messages';

import { useDebugOperation } from '../../hooks';
import { buildDeviceInfoRows, copyText } from '../../lib';
import { appBridge } from '../../../../bridge';

/**
 * OS pickers and permission prompts, moved off the app's Device Test screen (ADR-0080 결정 11).
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

    return (
        <div className="p-4">
            <p className="mb-4 text-[13px] text-muted-foreground">web v{versionInfo?.webVersion ?? '?'}</p>

            <div className="rounded-[18px] bg-card px-4 py-3 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none">
                <div className="mb-2 flex items-center gap-2">
                    <Smartphone size={16} className="text-muted-foreground" />
                    <span className="text-[13px] font-semibold text-foreground">Device Info</span>
                </div>
                <dl className="flex flex-col gap-1.5">
                    {buildDeviceInfoRows(deviceInfo).map(row => (
                        <button
                            key={row.label}
                            type="button"
                            onClick={() => copyText(row.copyValue)}
                            className="flex items-start justify-between gap-2 text-left"
                        >
                            <dt className="w-[92px] shrink-0 text-[12px] text-muted-foreground">{row.label}</dt>
                            <dd className="flex-1 break-all text-[12px] font-medium text-foreground">{row.value}</dd>
                            {row.copyValue && <Copy size={13} className="mt-0.5 shrink-0 text-muted-foreground" />}
                        </button>
                    ))}
                </dl>
            </div>

            <div className="mt-4 rounded-[18px] bg-card px-4 py-3 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none">
                <span className="text-[13px] font-semibold text-foreground">조작</span>
                <p className="mt-1 text-[12px] text-muted-foreground">앱이 OS 창을 띄우고 결과를 돌려줍니다</p>

                <div className="mt-3 flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => void run('카메라', () => appBridge.openCamera({ mediaType: 'photo' }))}
                        className="rounded-md border border-border px-2 py-1 text-xs"
                    >
                        카메라
                    </button>
                    <button
                        type="button"
                        onClick={() =>
                            void run('앨범', () =>
                                appBridge.openPhotoLibrary({ selectionLimit: 1, mediaType: 'photo' })
                            )
                        }
                        className="rounded-md border border-border px-2 py-1 text-xs"
                    >
                        앨범
                    </button>
                    <button
                        type="button"
                        onClick={() => void run('파일', () => appBridge.openDocument({ allowMultiSelection: true }))}
                        className="rounded-md border border-border px-2 py-1 text-xs"
                    >
                        파일
                    </button>
                    <button
                        type="button"
                        onClick={() => void run('연락처', () => appBridge.getContacts())}
                        className="rounded-md border border-border px-2 py-1 text-xs"
                    >
                        연락처
                    </button>
                    <button
                        type="button"
                        onClick={() => void run('네이티브 클립보드', () => appBridge.copyToClipboard('debug'))}
                        className="rounded-md border border-border px-2 py-1 text-xs"
                    >
                        클립보드 쓰기
                    </button>
                    <button
                        type="button"
                        onClick={() => fire('OS 설정 열기', () => appBridge.openSettings())}
                        className="rounded-md border border-border px-2 py-1 text-xs"
                    >
                        OS 설정
                    </button>
                    <button
                        type="button"
                        onClick={() => fire('공유 시트', () => appBridge.openShareSheet('https://chatic.io'))}
                        className="rounded-md border border-border px-2 py-1 text-xs"
                    >
                        공유 시트
                    </button>
                </div>

                <p className="mt-3 text-[12px] text-muted-foreground">권한</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                    {PERMISSIONS.map(permission => (
                        <button
                            key={permission}
                            type="button"
                            onClick={() => void run(permission, () => appBridge.requestPermission(permission))}
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
