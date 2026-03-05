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
                className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-3 bg-white border-2 border-indigo-500 rounded-[20px] text-[14px] sm:text-[16px] font-semibold text-gray-800 hover:bg-gray-50 transition-colors flex items-center justify-between gap-3"
            >
                <span>
                    {selectedVersionData?.version} ({selectedVersionData?.effectiveDate})
                </span>
                <svg
                    className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
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
                    <div className="absolute z-20 w-full mt-2 bg-white border-2 border-indigo-500 rounded-[20px] shadow-lg overflow-hidden">
                        {versions.map(version => (
                            <button
                                key={version.version}
                                onClick={() => handleVersionSelect(version.version)}
                                className={`w-full px-4 sm:px-6 py-2 sm:py-3 text-left text-[14px] sm:text-[16px] hover:bg-gray-50 transition-colors ${
                                    version.version === currentVersion
                                        ? 'bg-indigo-50 text-indigo-600 font-semibold'
                                        : 'text-gray-700'
                                }`}
                            >
                                {version.version} ({version.effectiveDate})
                                {version.version === currentVersion && (
                                    <span className="ml-2 text-[12px]">현재 버전</span>
                                )}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};
