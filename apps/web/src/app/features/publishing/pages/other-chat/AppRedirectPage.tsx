import { Images } from '@lemon/assets';

export const AppRedirectPage = () => {
    return (
        <div className="h-screen bg-white flex flex-col items-center justify-center text-center">
            <img src={Images.thumbnail} className="w-[100px]" alt="" />
            <div className="mt-[26px] mb-1 text-[20px] font-medium text-chatic-text-800">채틱 앱으로 자동 실행 중</div>
            <p className="text-chatic-text-700">
                앱 미설치 사용자는
                <br />
                스토어 이동 후에 앱 설치를 해주세요
            </p>
        </div>
    );
};
