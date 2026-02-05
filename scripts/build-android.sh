#!/bin/bash

# SLP Office 앱 빌드 스크립트
# Android 15 (API 35) 타겟팅
# Signed APK 및 AAB 생성

set -e  # 에러 발생 시 스크립트 중단

# 색상 설정
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 프로젝트 정보
PROJECT_NAME="Chatic"
WORKSPACE_DIR=$(pwd)
ANDROID_DIR="apps/mobile/android/app"

echo -e "${BLUE}📁 Android 프로젝트 디렉토리로 이동: $ANDROID_DIR${NC}"
cd "$ANDROID_DIR"

APP_VERSION=$(grep "versionName" app/build.gradle | sed 's/.*"\(.*\)".*/\1/')
VERSION_CODE=$(grep "versionCode" app/build.gradle | sed 's/.*versionCode \([0-9]*\).*/\1/')

# Keystore 정보 (Office)
KEYSTORE_FILE="chatic-dou.keystore"
KEYSTORE_PASSWORD="PgwLUunFU7kjx2rN"
KEY_ALIAS="chatic-dou"
KEY_PASSWORD="PgwLUunFU7kjx2rN"

# 빌드 디렉토리
BUILD_DIR="build/outputs"
APK_DIR="$BUILD_DIR/apk/prod/release"
AAB_DIR="$BUILD_DIR/bundle/prodRelease"
OUTPUT_DIR="$BUILD_DIR/signed_builds"

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  $PROJECT_NAME 빌드 스크립트${NC}"
echo -e "${BLUE}================================================${NC}"

# Keystore 파일 확인
if [ ! -f "$KEYSTORE_FILE" ]; then
    echo -e "$pwd"
    echo -e "${RED}❌ Error: Keystore 파일을 찾을 수 없습니다: $KEYSTORE_FILE${NC}"
    echo -e "${YELLOW}💡 ${$ANDROID_DIR} 디렉토리에 chatic-dou.keystore 파일이 있는지 확인하세요.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Keystore 파일 확인: $KEYSTORE_FILE${NC}"

# 빌드 시작 시간 기록
BUILD_START=$(date +%s)

echo -e "\n${YELLOW}🧹 이전 빌드 파일 정리...${NC}"
../gradlew clean

# 출력 디렉토리 생성
mkdir -p "$OUTPUT_DIR"

echo -e "\n${YELLOW}📱 Signed APK 빌드 시작...${NC}"
../gradlew assembleProdRelease \
    -Pandroid.injected.signing.store.file="$PWD/$KEYSTORE_FILE" \
    -Pandroid.injected.signing.store.password="$KEYSTORE_PASSWORD" \
    -Pandroid.injected.signing.key.alias="$KEY_ALIAS" \
    -Pandroid.injected.signing.key.password="$KEY_PASSWORD"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Signed APK 빌드 완료!${NC}"

    # APK 파일 확인 및 복사
    GENERATED_APK=$(ls "$APK_DIR"/app*.apk 2>/dev/null | head -1)
    if [ -n "$GENERATED_APK" ] && [ -f "$GENERATED_APK" ]; then
        mkdir -p "$OUTPUT_DIR"
        SIGNED_APK="$OUTPUT_DIR/$(basename "$GENERATED_APK")"
        cp "$GENERATED_APK" "$SIGNED_APK"

        # APK 정보 출력
        APK_SIZE=$(du -h "$SIGNED_APK" | cut -f1)
        echo -e "${GREEN}📁 APK 생성: $(basename "$SIGNED_APK")${NC}"
        echo -e "${GREEN}📏 APK 크기: $APK_SIZE${NC}"
    else
        echo -e "${RED}❌ APK 파일을 찾을 수 없습니다: $APK_DIR${NC}"
    fi
else
    echo -e "${RED}❌ Signed APK 빌드 실패${NC}"
    exit 1
fi

echo -e "\n${YELLOW}📦 Android App Bundle (AAB) 빌드 시작...${NC}"
../gradlew bundleProdRelease \
    -Pandroid.injected.signing.store.file="$PWD/$KEYSTORE_FILE" \
    -Pandroid.injected.signing.store.password="$KEYSTORE_PASSWORD" \
    -Pandroid.injected.signing.key.alias="$KEY_ALIAS" \
    -Pandroid.injected.signing.key.password="$KEY_PASSWORD"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Android App Bundle 빌드 완료!${NC}"

    # AAB 파일 확인 및 복사
    GENERATED_AAB=$(ls "$AAB_DIR"/app*.aab 2>/dev/null | head -1)
    if [ -n "$GENERATED_AAB" ] && [ -f "$GENERATED_AAB" ]; then
        mkdir -p "$OUTPUT_DIR"
        SIGNED_AAB="$OUTPUT_DIR/$(basename "$GENERATED_AAB")"
        cp "$GENERATED_AAB" "$SIGNED_AAB"

        # AAB 정보 출력
        AAB_SIZE=$(du -h "$SIGNED_AAB" | cut -f1)
        echo -e "${GREEN}📁 AAB 생성: $(basename "$SIGNED_AAB")${NC}"
        echo -e "${GREEN}📏 AAB 크기: $AAB_SIZE${NC}"
    else
        echo -e "${RED}❌ AAB 파일을 찾을 수 없습니다: $AAB_DIR${NC}"
    fi
else
    echo -e "${RED}❌ Android App Bundle 빌드 실패${NC}"
    exit 1
fi

# 빌드 완료 시간 계산
BUILD_END=$(date +%s)
BUILD_DURATION=$((BUILD_END - BUILD_START))
BUILD_TIME=$(printf '%02d분 %02d초' $((BUILD_DURATION/60)) $((BUILD_DURATION%60)))

echo -e "\n${GREEN}================================================${NC}"
echo -e "${GREEN}🎉 빌드 완료!${NC}"
echo -e "${GREEN}⏱️  총 빌드 시간: $BUILD_TIME${NC}"
echo -e "${GREEN}📁 출력 디렉토리: $ANDROID_DIR/$OUTPUT_DIR/${NC}"
echo -e "${GREEN}================================================${NC}"

# 생성된 파일 목록 출력
echo -e "\n${BLUE}📋 생성된 파일:${NC}"
ls -la "$OUTPUT_DIR/"

echo -e "\n${YELLOW}💡 사용법:${NC}"
if [ -f "$SIGNED_APK" ]; then
    echo -e "${YELLOW}  APK 설치: adb install $ANDROID_DIR/$OUTPUT_DIR/$(basename "$SIGNED_APK")${NC}"
fi
if [ -f "$SIGNED_AAB" ]; then
    echo -e "${YELLOW}  Google Play: $ANDROID_DIR/$OUTPUT_DIR/$(basename "$SIGNED_AAB") 업로드${NC}"
fi

echo -e "\n${BLUE}🔍 Google Login 테스트:${NC}"
echo -e "${BLUE}  1. 위에서 생성된 Signed APK 사용${NC}"
echo -e "${BLUE}  2. adb install로 설치 후 테스트${NC}"
echo -e "${BLUE}  3. SHA1 인증서는 release 정보만 등록되어 있음${NC}"

cd "$WORKSPACE_DIR"
