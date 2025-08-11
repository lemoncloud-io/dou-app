import { Image, X } from 'lucide-react';

export const QrScanPage = () => {
    return (
        <div className="flex flex-col min-h-screen bg-background">
            <header className="fixed top-0 w-full bg-white flex items-center justify-between gap-2 py-3 px-4">
                <div className="text-base font-medium truncate w-full ml-6 flex justify-center">코드 스캔</div>
                <button>
                    <X size={24} />
                </button>
            </header>
            <div className="w-full pt-[52px]">
                <div className="aspect-[360/461] bg-chatic-100"></div>
                <div className="flex flex-col items-center">
                    <div className="text-chatic-700 font-medium text-center my-[22px]">
                        QR코드를 스캔하거나
                        <br />
                        QR코드 이미지를 업로드 해주세요
                    </div>
                    <button className="shadow-chatic rounded-[27px] border border-chatic-100 py-[9px] px-[18px] flex items-center gap-[6px] text-[15px] font-medium">
                        <Image className="w-6 h-6" /> 이미지 업로드
                    </button>
                </div>
            </div>
        </div>
    );
};
