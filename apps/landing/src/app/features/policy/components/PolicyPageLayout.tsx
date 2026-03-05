import { Link } from 'react-router-dom';

import { VersionSelector } from './VersionSelector';

import type { PolicyVersion } from '../constants/policyTypes';

interface PolicyPageLayoutProps {
    children: React.ReactNode;
    title: string;
    subtitle?: string;
    versions: readonly PolicyVersion[];
    currentVersion: string;
    onVersionChange: (version: string) => void;
}

export const PolicyPageLayout = ({
    children,
    title,
    subtitle,
    versions,
    currentVersion,
    onVersionChange,
}: PolicyPageLayoutProps): JSX.Element => {
    return (
        <div
            className="w-full h-screen overflow-y-auto overflow-x-hidden scroll-smooth bg-white"
            style={{ WebkitOverflowScrolling: 'touch' }}
        >
            {/* Logo Section */}
            <div className="w-full border-b border-[#eaeaec]">
                <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-4 sm:py-5">
                    <Link to="/" className="inline-block hover:opacity-80 transition-opacity">
                        <span className="text-[24px] font-bold text-[#222325]">DoU</span>
                    </Link>
                </div>
            </div>

            {/* Page Header */}
            <div className="w-full border-b border-gray-200">
                <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8 sm:py-12">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-6">
                        <div className="flex-1">
                            <h1 className="text-[28px] sm:text-[36px] xl:text-[44px] font-bold text-gray-900">
                                {title}
                            </h1>
                            {subtitle && <p className="mt-2 text-[14px] sm:text-[16px] text-gray-600">{subtitle}</p>}
                        </div>
                        <div className="flex-shrink-0">
                            <VersionSelector
                                versions={versions}
                                currentVersion={currentVersion}
                                onVersionChange={onVersionChange}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <main className="w-full max-w-[1200px] mx-auto px-4 sm:px-6 py-8 sm:py-12 md:py-16 pb-16 sm:pb-20 md:pb-24">
                {children}
            </main>
        </div>
    );
};
