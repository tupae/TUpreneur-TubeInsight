# TubeInsight — 유튜브 채널 기획 · 영상 분석 · 8초 씬 기획 · 영상 자동 제작 · 멀티채널 마케팅 자동화 (v0.4.0)

> **"유튜브 링크 하나로 채널 브랜딩부터 8초 씬 영상 제작, Threads · X(Twitter) · SEO 블로그 · 뉴스레터까지 원클릭 자동화"**

TubeInsight는 로컬 AI(LM Studio / Ollama)와 클라우드 API를 결합하여 1인 크리에이터 및 마케터를 위해 개발된 올인원 영상 기획·제작·마케팅 자동화 시스템입니다.

---

## 🚀 파이프라인 단계별 개요

| 단계 | 탭 명칭 | 주요 기능 | 주요 기술 / 도구 |
|---|---|---|---|
| **00** | **채널 세팅** | 채널 컨셉·페르소나·콘텐츠 필러·채널명/바이오 기획 및 관리 | 로컬 AI (LM Studio / Ollama) |
| **01** | **영상 분석** | 벤치마킹 유튜브 영상 분석 (자막·댓글·후킹 공식·타임라인 추출) | `yt-dlp` + 로컬 AI |
| **02** | **기획 · 나레이션** | 8초 씬별 대본, AI 영상/이미지 프롬프트, 씬별 음성(MP3) 자동 합성 | 로컬 AI + Edge-TTS / Qwen Voice Clone |
| **03** | **제작 · 업로드** | 이미지·클립 합성, 자막 렌더링, 오디오 덕킹 영상(MP4) 생성 및 유튜브 업로드 | `ffmpeg` + Gemini API + YouTube Data API v3 |
| **04** | **마케팅 & SNS** | One-Source Multi-Use: Threads 타래, X(Twitter) 타래, SEO 장문 블로그, 반응형 HTML 뉴스레터 | Threads Graph API, X API v2 & 무료 웹인텐트 |

---

## 🛠️ 주요 기능 상세

### 1. 🎯 00 채널 세팅 (Channel Builder)
* 유튜브 채널의 핵심 정체성(Identity), 목표 타깃 페르소나, 3대 콘텐츠 기둥(Pillar) 수립.
* 클릭률을 높이는 채널명 3종, 핸들(@), 소개 바이오(Bio), 시청자 웰컴 메시지 자동 생성 및 저장 관리.

### 2. 📊 01 영상 분석 (Video Analyzer)
* 유튜브 URL 입력 시 자막, 메타데이터, 댓글 여론을 즉시 크롤링 및 분석.
* 5단계 스토리 전개 구조, 초반 3초 후킹 공식, 시청 지속 요인 분석 리포트 제공.
* 분석 데이터 로컬 캐싱(`data/analyses/`)으로 재사용 지원.

### 3. 🎬 02 기획 · 나레이션 (Scene Generator)
* 벤치마킹 분석을 적용한 신규 주제 8초 씬(Scene) 단위 영상 기획서 자동 작성.
* 씬별 나레이션 글자 수·시간(초) 모니터링 및 8초 초과 시 자동 경고.
* Runway, Kling, Luma 등 AI 비디오 프롬프트 및 나노바나나(NanoBanana) 레드라인 이미지 프롬프트 생성.
* Edge-TTS 및 Qwen 보이스 클로닝 음성 합성 지원.

### 4. 🎞️ 03 제작 · 업로드 (Video Producer & Uploader)
* 씬별 이미지/비디오 클립 + 나레이션 오디오 + 외곽선 한글 자막 자동 합성 (`ffmpeg`).
* AI 영상의 배경음/효과음을 살려주는 나레이션 자동 오디오 덕킹(Audio Ducking) 처리.
* YouTube Data API v3를 통한 원클릭 유튜브 업로드.

### 5. 🌐 04 마케팅 & SNS (Omni Marketing Hub)
* **𝕏 (Twitter) 특화 바이럴 타래**:
  * 알고리즘 최적화: 초단문 60~120자, 외부링크 본문 제외, 질문 댓글(Replies) 인게이지먼트 극대화.
  * **X 공식 API v2 연동**: 1/N ~ N/N 순차 체이닝(in_reply_to_tweet_id) 연속 발행.
  * **100% 무료 웹인텐트 도우미**: 종량제 크레딧 결제 없이 공식 X 작성창의 `[+]` 타래 엮기 기능을 활용하여 비용 0원으로 5단 타래를 1분 만에 완성.
* **🧵 Threads 특화 바이럴 타래**:
  * 알고리즘 최적화: 100~200자 모바일 가독성, 이모지 2~3개 절제, 긍정 톤앤매너(-58% 노출 페널티 차단).
  * **Meta Threads 공식 API 연동**: 원클릭 연속 타래 체이닝 발행.
* **📝 SEO 블로그 라이터**:
  * 4대 플랫폼 맞춤: 네이버 블로그(친근한 대화체/C-Rank), 구글 표준 SEO, 티스토리/워드프레스(HTML 시맨틱), 미디엄/벨로그(기술 인사이트).
* **✉️ 반응형 HTML 뉴스레터**:
  * A/B 테스트용 고전환 이메일 제목 5선 (오픈율 극대화).
  * 모바일/PC 반응형 인라인 CSS HTML 템플릿 실시간 렌더링 및 다운로드.

---

## 📂 프로젝트 폴더 구조

```
TubeInsight/
├── server.py               # 메인 백엔드 웹 서버 (FastAPI/Uvicorn, 포트 8989)
├── llm_client.py           # 로컬 LLM (LM Studio / Ollama) 통신 클라이언트
├── channel_builder.py      # [00 채널 세팅] 채널 브랜딩 기획 모듈
├── analyze.py              # [01 영상 분석] 유튜브 데이터 수집 (yt-dlp) & AI 분석
├── generator.py            # [02 기획·나레이션] 8초 씬별 대본 및 프롬프트 기획
├── tts_engine.py           # 나레이션 음성 합성 엔진 (Edge-TTS / Qwen-TTS)
├── producer.py             # [03 제작] ffmpeg 영상 합성 & Gemini 이미지 생성
├── uploader.py             # [03 업로드] YouTube Data API v3 업로더
├── marketing.py            # [04 마케팅] Threads·X·블로그·뉴스레터 생성 엔진
├── threads_client.py       # Meta Threads 공식 Graph API 연동 클라이언트
├── twitter_client.py       # X(Twitter) 공식 API v2 연동 클라이언트
├── index.html              # 프론트엔드 메인 UI
├── app.js                  # 프론트엔드 비즈니스 로직 및 인터랙션
├── style.css               # 커스텀 스타일시트
├── requirements.txt        # Python 의존성 목록
├── run.command / run.bat   # macOS / Windows 간편 실행 스크립트
├── .env.example            # 환경 변수 설정 템플릿
├── X 트위트 API.md          # X Developer Portal 5단계 토큰 발급 가이드
├── Thread API.md           # Meta Threads 토큰 발급 가이드
├── vendor/                 # 오프라인 로컬 JS 라이브러리 (Lucide, Tailwind 등)
└── data/                   # 데이터 저장소 (.gitignore 적용)
    ├── analyses/           # 영상 분석 결과 JSON 및 리포트
    ├── channels/           # 기획된 채널 프로필 데이터
    ├── plans/              # 8초 씬 영상 기획서 JSON/MD
    ├── audio/              # 생성된 나레이션 MP3
    ├── renders/            # 완성된 영상 MP4 및 렌더링 소스
    ├── marketing/          # 마케팅 타래 및 블로그 생성 보관함
    └── youtube/            # YouTube OAuth 인증 파일
```

---

## ⚙️ 빠른 시작 가이드

### 1. 환경 요구사항
* **Python 3.10 이상** (3.11 권장)
* **로컬 LLM (둘 중 하나 실행)**:
  * **LM Studio** (포트 `1234`): 한국어 지원 모델 (예: `gemma-2-9b-it`, `qwen2.5-7b-instruct` 등) 로드 후 로컬 서버 Start
  * **Ollama** (포트 `11434`): `ollama run gemma3` 또는 `ollama run qwen2.5:7b`

### 2. 설치
```bash
# 가상환경 생성 및 의존성 설치
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 3. 환경 변수 설정
```bash
cp .env.example .env
```
필요에 따라 `.env` 파일에 API 키를 설정합니다 (기본 무료 로컬 AI 및 무료 X 웹인텐트 기능은 API 키 없이도 즉시 동작합니다):
* `GEMINI_API_KEY`: 클라우드 AI 이미지 생성 (선택)
* `THREADS_USER_ID` / `THREADS_ACCESS_TOKEN`: Threads 자동 포스팅 (선택)
* `TWITTER_API_KEY` ~ `TWITTER_ACCESS_TOKEN`: X API v2 자동 포스팅 (선택, 종량제 크레딧 필요)

### 4. 실행
```bash
# 터미널 실행
python server.py

# 또는 간편 실행
# macOS: run.command 더블클릭
# Windows: run.bat 더블클릭
```
브라우저에서 **`http://localhost:8989`** 에 접속합니다.

---

## 🚀 Vercel 배포 및 원격 접속 가이드

TubeInsight는 Vercel의 초고속 글로벌 Edge CDN과 개인 컴퓨터의 고성능 자원(GPU · 로컬 AI · ffmpeg)을 유기적으로 결합하는 **하이브리드 배포 아키텍처**를 지원합니다.

### 1. 배포 아키텍처 및 런타임 정보
* **프론트엔드 (Vercel)**: `index.html`, `app.js`, `style.css` 등 정적 UI가 Vercel의 글로벌 CDN에 배포되어 어디서나 모바일/태블릿/PC로 접속할 수 있습니다.
* **백엔드 엔진 (로컬 PC)**: 영상 합성(`ffmpeg`), 자막 추출(`yt-dlp`), 로컬 AI(`LM Studio`/`Ollama`), 영상 파일 저장은 내 컴퓨터에서 안전하게 처리됩니다.
* **통신 연동**: 무료 **Cloudflare Tunnel**을 통해 Vercel UI와 로컬 백엔드가 안전한 HTTPS로 실시간 암호화 통신합니다.

---

### 2. Vercel 대시보드를 통한 배포 단계 (원클릭 Git 연동)

1. [Vercel 공식 홈페이지](https://vercel.com)에 로그인합니다.
2. **Add New...** 버튼을 클릭하고 **Project**를 선택합니다.
3. 본인의 GitHub `TUpreneur-TubeInsight` 저장소를 찾아 **Import** 버튼을 클릭합니다.
4. **Configure Project** 화면에서:
   - **Framework Preset**: `Other` (정적 사이트로 자동 감지)
   - **Root Directory**: `./` (기본값)
   - `.vercelignore`가 설정되어 있으므로 파이썬 빌드 오류 없이 순수 정적 웹으로 즉시 빌드됩니다.
5. **Deploy** 버튼을 클릭합니다. 배포 완료 후 제공되는 `https://your-project.vercel.app` 주소로 접속합니다.

---

### 3. Vercel 웹 화면과 내 컴퓨터 연결 (무료 10초 완성)

1. **로컬 백엔드 실행**:
   내 컴퓨터에서 `python server.py` (또는 `run.command` 더블클릭)를 실행합니다.
2. **무료 Cloudflare 터널 열기**:
   - `tunnel.command` 더블클릭 (macOS)  
   - 또는 터미널에서 다음 명령어 1줄 실행:
     ```bash
     npx cloudflared tunnel --url http://localhost:8989
     ```
   - 터미널 출력에 나타나는 `https://xxx.trycloudflare.com` 형태의 주소를 복사합니다.
3. **Vercel 웹 UI에 등록**:
   - Vercel 주소(`https://your-project.vercel.app`)에 접속합니다.
   - 상단 헤더의 **[🔗 로컬 서버]** 또는 **[백엔드 연결 필요]** 버튼을 클릭합니다.
   - 복사한 터널 주소를 붙여넣고 **[연결 테스트 & 저장]**을 누르면 끝! (초록색 🟢 연결됨으로 즉시 활성화)

---

## 🔒 보안 및 개인정보 보호 안내
* `.env` 및 OAuth 토큰(`data/youtube/client_secret.json`, `token.json` 등)은 `.gitignore`에 의해 깃허브 원격 저장소에 절대 커밋되지 않도록 보호됩니다.
* 로컬 AI 모델(LM Studio / Ollama)을 사용하므로 영상 기획 대본과 채널 데이터가 외부 서버로 유출되지 않고 로컬 PC에서 안전하게 처리됩니다.
* Vercel 배포 시에도 영상 데이터와 로컬 AI 작업은 내 컴퓨터 내부에서만 처리되므로 완벽한 개인정보 보안을 유지합니다.

---

## 📄 라이선스
본 프로젝트는 개인 학습, 기획 보조 및 비즈니스 콘텐츠 자동화를 위한 오픈소스 도구입니다. 유튜브 데이터 크롤링 및 외부 API 사용 시 각 플랫폼의 서비스 약관을 준수하시기 바랍니다.
