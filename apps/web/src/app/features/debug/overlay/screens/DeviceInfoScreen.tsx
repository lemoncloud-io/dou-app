import { Copy, Smartphone } from 'lucide-react';

import { useDeviceInfo } from '@chatic/device-utils';

import { buildDeviceInfoRows, copyText } from '../../lib';

/** Device/version identity injected by the native shell — single source, replaces the
 *  old DebugPage card and the RuntimeOverlay device tab. Tap a row to copy. */
export const DeviceInfoScreen = () => {
    const { versionInfo, deviceInfo } = useDeviceInfo();

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
        </div>
    );
};
