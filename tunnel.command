#!/usr/bin/env bash
# TubeInsight 외부 접속 터널 실행 스크립트 (Cloudflare Tunnel)
# 터미널 창을 열고 무료 HTTPS 터널 주소를 생성합니다.

cd "$(dirname "$0")"

echo "=========================================================="
echo " 🌐 TubeInsight 외부 접속용 Cloudflare 터널 생성기"
echo "=========================================================="
echo ""
echo " 1) 내 컴퓨터의 TubeInsight 서버(포트 8989)가 실행 중인지 확인하세요."
echo " 2) 아래 명령이 시작되면 약 5초 후 'https://xxx.trycloudflare.com' 주소가 생성됩니다."
echo " 3) 해당 주소를 복사하여 Vercel 웹 화면 상단의 [🔗 백엔드 연결]에 입력하세요."
echo ""
echo " 종료하려면 Ctrl+C 를 누르세요."
echo "----------------------------------------------------------"
echo ""

# npx cloudflared 실행
npx -y cloudflared tunnel --url http://localhost:8989
