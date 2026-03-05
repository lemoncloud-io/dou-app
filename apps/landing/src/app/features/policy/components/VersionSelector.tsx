import { useState } from 'react';

import type { PolicyVersion } from '../constants/policyTypes';

interface VersionSelectorProps {
    versions: readonly PolicyVersion[];
    currentVersion: string;
    onVersionChange: (version: string) => void;
}

export const VersionSelector = ({ versions, currentVersion, onVersionChange }: VersionSelectorProps): JSX.Element => {
    const [isOpen, setIsOpen] = useState(false);

    const selectedVersionData = versions.find(v => v.version === currentVersion);

    const handleVersionSelect = (version: string): void => {
        onVersionChange(version);
        setIsOpen(false);
    };

    return (
        <div className="relative w-full sm:w-auto">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full sm:w-auto px-4 py-2.5 bg-white border border-[#dfe0e2] rounded-lg text-[14px] font-medium text-[#222325] hover:border-[#babcc0] hover:bg-[#f4f5f5] transition-all flex items-center justify-between gap-2 whitespace-nowrap"
            >
                <span>{selectedVersionData?.version}</span>
                <svg
                    className={`w-4 h-4 text-[#84888f] transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
                    <div className="absolute right-0 z-20 min-w-[180px] mt-1 bg-white border border-[#dfe0e2] rounded-lg shadow-lg overflow-hidden">
                        {versions.map(version => (
                            <button
                                key={version.version}
                                onClick={() => handleVersionSelect(version.version)}
                                className={`w-full px-4 py-3 text-left text-[14px] hover:bg-[#f4f5f5] transition-colors flex items-center justify-between gap-3 ${
                                    version.version === currentVersion
                                        ? 'bg-[#f4f5f5] text-[#222325] font-medium'
                                        : 'text-[#53555b]'
                                }`}
                            >
                                <div className="flex flex-col">
                                    <span className="font-medium text-[#222325]">{version.version}</span>
                                    <span className="text-[12px] text-[#84888f]">{version.effectiveDate}</span>
                                </div>
                                {version.version === currentVersion && (
                                    <span className="px-2 py-0.5 bg-[#c4ff00] text-[#222325] text-[11px] font-semibold rounded">
                                        현재
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};
