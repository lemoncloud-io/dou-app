import { Link } from 'react-router-dom';

export const Footer = (): JSX.Element => (
    <footer className="w-full bg-[#1f1f1f]">
        <div className="max-w-[1440px] mx-auto flex flex-col items-center py-16 px-6 md:px-10">
            {/* Logo */}
            <h2 className="text-white text-[24px] font-bold mb-4">DoU</h2>

            {/* Company Name */}
            <p className="text-[#b4b5bf] text-[16px] font-medium tracking-[-0.8px] mb-6">레몬클라우드</p>

            {/* Company Info */}
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-[14px] text-[#b4b5bf] tracking-[-0.7px] mb-4">
                <span>대표자 : 김동혁</span>
                <span className="hidden sm:inline">|</span>
                <span>이메일 : app@lemoncloud.io</span>
            </div>

            {/* Links */}
            <div className="flex gap-6 text-[14px] text-[#b4b5bf] mb-8">
                <Link to="/policy/terms" className="hover:text-white transition-colors">
                    이용약관
                </Link>
                <Link to="/policy/privacy" className="hover:text-white transition-colors">
                    개인정보처리방침
                </Link>
            </div>

            {/* Copyright */}
            <p className="text-[12px] text-[#70727d] text-center">Copyrightⓒ2025 LEMONCLOUD. All rights reserved.</p>
        </div>
    </footer>
);
