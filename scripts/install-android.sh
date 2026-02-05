#!/bin/bash

# Chatic DoU
# 설치 및 테스트 스크립트

set -e

# 색상 설정
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PACKAGE_NAME="io.chatic.dou"
MAIN_ACTIVITY="io.chatic.dou.MainActivity"

echo -e "${BLUE}📱 Chatic DoU 및 테스트${NC}"

# 연결된 디바이스 확인
echo -e "\n${YELLOW}🔍 연결된 디바이스 확인...${NC}"
adb devices

# APK 파일 찾기
APK_FILE=""
ANDROID_DIR="apps/mobile/android"
BUILD_OUTPUT_DIR="$ANDROID_DIR/app/build/outputs"
SIGNED_BUILDS_DIR="$BUILD_OUTPUT_DIR/signed_builds"

# 1. 빌드 스크립트로 생성된 signed 파일 먼저 찾기
if [ -d "$SIGNED_BUILDS_DIR" ] && [ -n "$(ls $SIGNED_BUILDS_DIR/app*.apk 2>/dev/null)" ]; then
    APK_FILE=$(ls $SIGNED_BUILDS_DIR/app*.apk | head -1)
# 2. Gradle 빌드 결과 디렉토리에서 custom 파일명 찾기
elif [ -n "$(ls $BUILD_OUTPUT_DIR/apk/prod/release/app*.apk 2>/dev/null)" ]; then
    APK_FILE=$(ls $BUILD_OUTPUT_DIR/apk/prod/release/app*.apk | head -1)
# 3. 기본 APK 파일 찾기
elif [ -f "$BUILD_OUTPUT_DIR/apk/prod/release/app-prod-release.apk" ]; then
    APK_FILE="$BUILD_OUTPUT_DIR/apk/prod/release/app-prod-release.apk"
else
    echo -e "${RED}❌ APK 파일을 찾을 수 없습니다${NC}"
    echo -e "${YELLOW}💡 먼저 ./scripts/build_slp_office.sh를 실행하세요${NC}"
    exit 1
fi

echo -e "\n${GREEN}📁 APK 파일: $APK_FILE${NC}"

# 기존 앱 제거 (선택사항)
read -p "기존 앱을 제거하시겠습니까? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}🗑️  기존 앱 제거 중...${NC}"
    adb uninstall "$PACKAGE_NAME" 2>/dev/null || echo -e "${YELLOW}⚠️  기존 앱이 설치되어 있지 않습니다${NC}"
fi

# APK 설치
echo -e "\n${YELLOW}📲 APK 설치 중...${NC}"
adb install "$APK_FILE"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ 설치 완료!${NC}"

    # 앱 실행
    read -p "앱을 실행하시겠습니까? (Y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        echo -e "${YELLOW}🚀 앱 실행 중...${NC}"
        adb shell am start -n "$PACKAGE_NAME/$MAIN_ACTIVITY"
        echo -e "${GREEN}✅ 앱이 실행되었습니다${NC}"

        # 로그 확인
        read -p "실시간 로그를 확인하시겠습니까? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${BLUE}📊 실시간 로그 (Ctrl+C로 중단)${NC}"
            adb logcat | grep -E "(chatic|dou|DoU)"
        fi
    fi
else
    echo -e "${RED}❌ 설치 실패${NC}"
    exit 1
fi

echo -e "\n${BLUE}💡 유용한 명령어:${NC}"
echo -e "${BLUE}  로그 확인: adb logcat | grep -E \"(chatic|dou|DoU)\"${NC}"
echo -e "${BLUE}  앱 재실행: adb shell am start -n $PACKAGE_NAME/$MAIN_ACTIVITY${NC}"
echo -e "${BLUE}  앱 데이터 삭제: adb shell pm clear $PACKAGE_NAME${NC}"
echo -e "${BLUE}  앱 제거: adb uninstall $PACKAGE_NAME${NC}"
echo -e "\n${BLUE}🔧 디버깅:${NC}"
echo -e "${BLUE}  패키지 정보: adb shell dumpsys package $PACKAGE_NAME${NC}"
echo -e "${BLUE}  앱 권한 확인: adb shell dumpsys package $PACKAGE_NAME | grep permission${NC}"
