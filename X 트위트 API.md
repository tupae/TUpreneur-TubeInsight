X 트위터 API

**1. 기본 동작 방식**

* **엔드포인트:** `POST [https://api.x.com/2/tweets](https://api.x.com/2/tweets)` (v2)
* **인증 방식:**
* 내 웹사이트 관리자 계정 하나로만 글을 올리는 경우: 개발자 포털에서 발급받은 **API Key / Secret**, **Access Token / Secret**(OAuth 1.0a 또는 OAuth 2.0 User Context)을 백엔드 환경 변수에 저장해 호출합니다.

---

## 🔑 [단계별 가이드] X(트위터) API 키 & 액세스 토큰 발급받는 방법

X 공식 개발자 포털(Developer Portal)에서 **무료/종량제 계정 생성부터 쓰기(Write) 권한 토큰 발급까지** 순서대로 따라 하시면 5분 안에 완료됩니다.

---

### Step 1. X 개발자 포털(Developer Portal) 접속 및 가입
1. **[https://developer.x.com/en/portal/dashboard](https://developer.x.com/en/portal/dashboard)** 로 접속합니다.
2. 자동 포스팅을 올릴 **본인의 X(Twitter) 계정**으로 로그인합니다.
3. 최초 접속 시 개발자 프로그램 등록(개발자 PPU 파일럿 계약 및 개발자 정책) 화면이 나타납니다:
   - **X의 데이터와 API를 사용하는 모든 사용 사례 설명란 (Use Case Description)**:
     - 💡 **추천 입력 문구 (아래 영문 복사 후 붙여넣기 추천 - 자동 심사 즉시 통과)**:
       ```text
       I am developing a personal content management and marketing automation tool (TubeInsight) to publish educational video summaries, tech trends, and industry insights to my own personal X account (@taeungpae).

       Key use cases:
       1. Publishing single tweets and sequential thread chains (using POST /2/tweets with in_reply_to_tweet_id) to share weekly insights and discussion questions with my followers.
       2. Managing my own personal posts with human-in-the-loop review before publishing.

       Compliance statement:
       - I will NOT scrape, aggregate, or harvest data from other users.
       - I will NOT resell, redistribute, or monetize any X data or content.
       - I will NOT engage in spamming, mass automation, or algorithmic manipulation.
       - All API interactions strictly comply with the X Developer Agreement and Developer Policy.
       ```
   - 아래 3개 체크박스(재판매 금지, 약관 동의, 계정 종료 규정) 모두 체크 후 **[제출]** 클릭.

---

### Step 2. Project 및 App(애플리케이션) 생성
1. 대시보드 좌측 메뉴에서 **Projects & Apps** > **Overview** 클릭
2. **Add Project** (또는 기본 프로젝트) > **Create App** 클릭
3. 앱 이름(App Name) 입력 (예: `TubeInsight-Publisher-2026` 등 고유한 영문 이름 입력)
4. 앱이 생성되면 일차적으로 화면에 키가 표시됩니다.
   - ⚠️ **잠깐!** 이 단계에서 나온 기본 토큰은 아직 "읽기 전용(Read-only)"이므로, **반드시 아래 Step 3에서 권한을 먼저 변경**해야 합니다.

---

### Step 3. ⚠️ [가장 중요!] 앱 권한을 'Read and Write'로 설정
> **주의:** 기본 권한이 `Read-only`로 되어 있으면 글 작성 시 무조건 `403 Forbidden` 에러가 발생합니다!

1. 좌측 메뉴에서 생성한 앱 이름(예: `TubeInsight-Publisher-2026`)을 클릭하여 앱 상세 페이지로 이동합니다.
2. **Settings** 탭으로 이동 > **User authentication settings** 항목의 **[Set up]** (또는 Edit) 버튼 클릭
3. 아래 설정값을 입력합니다:
   - **App permissions**: 반드시 **`Read and Write`** 선택 (읽기 및 쓰기 권한)
   - **Type of App**: **`Web App, Automated App or Bot`** 선택
   - **App info**:
     - **Callback URI / Redirect URL**: `http://localhost:8989` (임의 입력 가능)
     - **Website URL**: `https://x.com` (또는 본인의 SNS/블로그 주소)
4. 맨 아래 **[Save]** 버튼을 클릭하여 저장합니다.

---

### Step 4. 쓰기(Write) 권한이 부여된 키 & 토큰 새로 발급 (Regenerate)
1. 앱 상단의 **Keys and Tokens** 탭으로 이동합니다.
2. 다음 두 가지 항목의 키를 복사해 안전한 곳에 메모합니다:

#### ① Consumer Keys (API Key & Secret)
- **API Key and Secret** 옆의 **[Regenerate]** 클릭
- 팝업에 뜨는 **API Key**와 **API Key Secret**을 복사합니다.

#### ② Authentication Tokens (Access Token & Secret) 🌟
- **Access Token and Secret** 섹션에서 **[Generate]** (또는 Regenerate) 클릭
- ⚠️ **확인:** 화면에 `Created with Read and Write permissions` 문구가 적혀있는지 꼭 확인하세요!
- 팝업에 뜨는 **Access Token**과 **Access Token Secret**을 복사합니다.

*(선택 사항)* **Bearer Token** 섹션의 [Generate] 버튼을 눌러 **Bearer Token**도 함께 복사해둡니다.

---

### Step 5. TubeInsight `.env` 파일에 저장하기
발급받은 키를 프로젝트의 [`.env`](file:///Users/taeung.pae/Documents/TUpreneur/TubeInsight/.env) 파일에 아래 형식으로 입력하시면 연동이 완료됩니다:

```env
# X (Twitter) API v2 Configuration
TWITTER_API_KEY=여기에_API_Key_입력
TWITTER_API_SECRET=여기에_API_Key_Secret_입력
TWITTER_ACCESS_TOKEN=여기에_Access_Token_입력
TWITTER_ACCESS_TOKEN_SECRET=여기에_Access_Token_Secret_입력
TWITTER_BEARER_TOKEN=여기에_Bearer_Token_입력

# 토큰 발급 전 모의 시뮬레이션을 원하시면 true, 실제 발행 시 false
TWITTER_MOCK=false
```

---

* X(구 트위터) 공식 API v2(`POST [https://api.x.com/2/tweets](https://api.x.com/2/tweets)`)를 실제로 호출할 때 사용하는 **완전한 cURL 요청 예시**와 **실제 성공/실패 응답(Response) 예시**입니다.


**1. 실제 HTTP 요청 예시 (cURL)**

인증 토큰(`Bearer Token` 또는 `OAuth 1.0a User Context`)과 함께 JSON 본문을 전송합니다.

```bash
curl -X POST https://api.x.com/2/tweets \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "웹사이트에서 생성된 자동 리포트입니다.\n자세히 보기: https://mysite.com/report/102",
    "reply_settings": "mentionedUsers"
  }'

```

---

**2. 포스팅 성공 시 응답 (Response 201 Created)**

업로드가 완료되면 생성된 트윗의 고유 ID와 작성된 본문이 반환됩니다.

```json
{
  "data": {
    "id": "1894058291048296448",
    "text": "웹사이트에서 생성된 자동 리포트입니다.\n자세히 보기: https://mysite.com/report/102"
  }
}

```

> **팁:** 반환된 `data.id`를 활용해 웹사이트 DB에 저장해 두면, 추후 웹에서 `[https://x.com/i/status/1894058291048296448](https://x.com/i/status/1894058291048296448)`로 바로가기 링크를 만들거나 다음 타래(Thread)를 이어 붙일 때 `in_reply_to_tweet_id`로 재사용할 수 있습니다.

---

**3. 자주 발생하는 오류 응답 (Error Cases)**

**중복 글 게시 시 (403 Forbidden)**
동일한 내용의 글을 연속으로 포스팅할 경우 스팸 방지 필터에 걸려 거부됩니다.

```json
{
  "errors": [
    {
      "message": "You are not allowed to create a Tweet with duplicate content.",
      "type": "https://api.twitter.com/2/problems/duplicate-content",
      "title": "Forbidden",
      "detail": "You are not allowed to create a Tweet with duplicate content."
    }
  ],
  "title": "Forbidden",
  "type": "about:blank",
  "status": 403
}

```

**권한 부족 시 (403 Forbidden)**
개발자 포털의 앱 설정이 `Read-only`로 되어 있거나 토큰에 쓰기 권한이 없을 때 발생합니다.

```json
{
  "title": "Unauthorized",
  "type": "about:blank",
  "status": 401,
  "detail": "Unauthorized"
}

```

---

**2. 반드시 알아두어야 할 최신 정책 (비용 및 주의점)**

* **유료 종량제(Pay-per-use) 전환:** 기존의 무료 티어(Free tier)는 폐지되었으며, 신규 개발자는 사용한 만큼 크레딧을 충전해 결제하는 **종량제 방식**을 사용합니다.
* **호출 비용:**
* 텍스트/미디어 전송(링크 없음): 요청당 약 **$0.015**
* **URL 링크가 포함된 트윗 전송: 요청당 약 $0.20** (사용하지않음)


* **권한 설정:** 개발자 대시보드(X Developer Portal)에서 앱의 권한을 반드시 `Read and Write`로 설정해야 포스팅이 정상 동작합니다.

