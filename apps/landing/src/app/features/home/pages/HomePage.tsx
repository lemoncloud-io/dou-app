import { Footer } from '../../../shared/components';

export const HomePage = (): JSX.Element => {
    return (
        <div
            className="w-full h-full flex flex-col overflow-auto overflow-x-hidden scroll-smooth"
            style={{ WebkitOverflowScrolling: 'touch' }}
        >
            {/* Main Content */}
            <main className="flex-1 flex flex-col items-center justify-center px-6">
                <div className="text-center">
                    <h1 className="text-[48px] sm:text-[64px] xl:text-[80px] font-bold text-gray-900 mb-4">DoU</h1>
                    <p className="text-[18px] sm:text-[24px] text-gray-600 mb-8">프라이버시 중심 메시징 서비스</p>
                    <p className="text-[14px] sm:text-[16px] text-gray-500">Coming Soon</p>
                </div>
            </main>

            <Footer />
        </div>
    );
};
