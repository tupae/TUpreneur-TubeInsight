# -*- coding: utf-8 -*-
"""TubeInsight AI — 멀티채널 마케팅 & SNS/블로그/뉴스레터 자동화 엔진

통합된 3대 기능:
1. ThreadX Studio: Threads & X(Twitter) 바이럴 스레드(1~10 타래) 포스트 생성
2. AI Blog Writer Studio: 검색엔진(SEO) 최적화 H1/H2/H3 장문 블로그 및 메타태그 생성
3. Notifuse Newsletter Hub: 반응형 HTML/MJML 이메일 캠페인 & A/B 테스트 제목 생성
4. Omni Marketing: 위 3개 채널 동시 일괄 생성 (원소스 멀티유즈)
"""

import os
import json
import time
import re
import llm_client

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
MARKETING_DIR = os.path.join(DATA_DIR, "marketing")
os.makedirs(MARKETING_DIR, exist_ok=True)


# ── 1. Threads & X(Twitter) 스튜디오 ──────────────────────────────────────

def normalize_thread_posts(posts):
    """
    타래 포스트들의 텍스트 내 넘버링(1/N ~ N/N)을 포스트의 실제 순서와 전체 개수에 맞게 완벽 보정합니다.
    (1번 포스트 번호 누락, 2번 포스트에 1/5 시작, 5번 포스트에 4/5로 끝나는 불일치 버그 방지)
    """
    if not isinstance(posts, list) or len(posts) < 2:
        return posts

    total = len(posts)
    # 시작 부분의 넘버링 및 이모지 매칭 (예: "1/5 🧵", "📌 1/5:", "1/5.", "[1/5]")
    num_pattern = re.compile(r'^\s*([^\w\s/\[(]*\s*)?[(\[]?(\d+)\s*/\s*(\d+)[)\]]?[.:\-]?\s*([^\w\s/\[(]*\s*)?')

    for i, p in enumerate(posts, start=1):
        txt = (p.get("text") or "").strip()
        m = num_pattern.match(txt)
        default_emoji = "🧵" if i == 1 else ("✨" if i == total else "📌")

        if m and m.group(2):
            prefix1 = (m.group(1) or "").strip()
            prefix2 = (m.group(4) or "").strip()
            chosen_emoji = prefix1 or prefix2 or default_emoji
            body_txt = txt[m.end():].strip().lstrip(":.- ")
            p["text"] = f"{i}/{total} {chosen_emoji} {body_txt}".strip()
        else:
            p["text"] = f"{i}/{total} {default_emoji} {txt}".strip()

        p["index"] = i
        p["char_count"] = len(p["text"])

    return posts


def generate_threads_x(topic, context="", platform="threads", tone="positive_informative", count=5, audience="크리에이터, 직장인, 마케터", on_progress=None):
    """
    Threads 및 X(Twitter) 플랫폼별 알고리즘 최적화 연속 스레드(1/N 타래) 글 생성
    - X (트위터): 주간·업계·전망 / 이슈 화두 제시, 본문 질문 마무리로 댓글 유도, 외부링크 제외
    - Threads (스레드): 긍정적 주간 다짐 / 비하인드 컷, 이모지 2~3개 엄수, 부정적 어조 절대 배제 (-58% 노출 억제 방지)
    """
    is_twitter = str(platform).lower() in ["twitter", "x"]
    platform_key = "twitter" if is_twitter else "threads"

    if on_progress:
        step_title = "𝕏 트위터 업계 전망·이슈 타래 설계 중..." if is_twitter else "🧵 스레드 긍정 다짐·비하인드 타래 설계 중..."
        on_progress("threadx_start", 10, step_title)

    tone_guides = {
        "positive_informative": "희망차고 긍정적인 에너지로 독자에게 실질적인 성장 동기와 즉시 실행 가능한 유익한 꿀팁을 전하는 톤",
        "actionable_tips": "군더더기 없이 친절하고 유익한 단계별 실행 튜토리얼 및 치트시트 톤",
        "viral_hook": "긍정적인 호기심과 설렘을 유발하며, 실질적인 가치와 성과를 통해 독자를 응원하는 밝은 바이럴 톤",
        "storytelling": "따뜻한 공감과 배움, 성장의 기쁨을 나누며 선한 영향력을 전하는 성장 스토리텔링 톤",
        "monetization": "스스로의 가치를 발견하고 시간과 생산성을 높여주는 긍정적 비즈니스 가치 창출 톤"
    }
    tone_desc = tone_guides.get(tone, tone_guides["positive_informative"])

    if is_twitter:
        platform_name = "X (Twitter / 트위터)"
        char_rule_desc = "각 타래당 공백 포함 반드시 '60자 이상, 120자 내외(최대 130자 이하)'로 극도로 압축 작성 (X 트위터는 짧을수록 완독률과 리트윗/댓글 반응에 압도적으로 유리합니다!)"
        content_theme_guide = """[콘텐츠 주제 지침: X(트위터) 특화]
- 주제 지향점: '주간·업계·전망 및 이슈 화두 제시' (예: '이번 주 AI / 업계에서 주목할 3가지 변수', 거시적 테크·비즈니스 트렌드, 새로운 변화 화두 던지기).
- 단순히 과거 사실을 나열하지 말고, 독자가 이번 주에 당장 주목해야 할 '핵심 변수 2~3가지와 시사점'을 날카롭고 명확하게 짚어주세요."""

        algo_optimization_guide = """[𝕏 트위터 알고리즘 최적화 필수 핵심 원칙]
1. [타래 분량 초단문 압축: 짧을수록 유리함 (60~120자 준수)]:
   - X(트위터)의 빠른 스크롤 환경에서는 텍스트가 길면 즉시 이탈합니다. **'짧을수록 유리하다'**는 절대 원칙을 지키세요!
   - 각 타래는 공백 포함 반드시 **60자 이상, 120자 내외(최대 130자 이내)**로 핵심만 극도로 압축하세요.
   - 사족과 긴 부연 설명을 모두 쳐내고, [핵심 팩트/인사이트 1~2줄] + [질문 1줄]의 2~3줄 숏폼으로 강렬하게 던지세요.

2. [본문 질문으로 마무리해 댓글(Replies) 유도]:
   - X 알고리즘 피드 점수 산정에서 가장 가중치가 높은 핵심 인게이지먼트는 바로 '댓글/답글(Replies)'입니다.
   - 마지막 {count}번 포스트(CTA)뿐만 아니라 타래 본문 주요 포스트의 끝을 반드시 독자의 생각, 현장 경험, 의견을 묻는 1줄 질문으로 마무리하세요!
   - (예: "여러분의 현업에서는 어떻게 체감하고 계신가요? 댓글로 들려주세요! 💬", "어떤 변화가 가장 파장이 클까요?")

3. [외부 링크(URL) 본문 완전 제외]:
   - 본문 텍스트 내에 http://, https:// 등의 외부 웹사이트 링크를 절대로 포함하지 마세요! (외부 링크 포함 시 피드 노출 억제 페널티).
   - 자료 출처나 추가 정보는 "📌 상세 자료는 첫 번째 답글(타래)에 남겨둘게요!" 형식으로 짧게 안내하세요."""
    else:
        platform_name = "Threads (스레드)"
        char_rule_desc = "각 타래당 공백 포함 반드시 '100자 이상, 200자 이하(100~200자)'로 작성 (모바일 화면 '더 보기' 없이 한눈에 읽히는 최적 분량)"
        content_theme_guide = """[콘텐츠 주제 지침: Threads(스레드) 특화]
- 주제 지향점: '긍정적 주간 다짐 / 비하인드 컷 / 일상 모닝 루틴' (예: '월요일 모닝 루틴과 이번 주 목표', 1인 크리에이터·직장인의 진솔한 성장 기록, 제작 과정의 비하인드 스토리).
- 일상 속 작은 루틴이나 제작 비하인드를 진솔하고 따뜻하게 나누며, 독자들에게 한 주의 긍정적인 영감과 공감을 선물하세요."""

        algo_optimization_guide = """[🧵 Threads 알고리즘 최적화 필수 핵심 원칙]
1. [이모지 2~3개 사용 엄수]:
   - 각 포스트(타래)당 과도한 이모지 남발을 엄격히 금지합니다!
   - 반드시 밝고 긍정적인 이모지를 '포스트당 정확히 2~3개'로 절제하여 배치하세요. (시각적 피로도를 낮추고 모바일 피드 가독성을 극대화합니다).

2. [부정적 어조 절대 배제 (부정글 -58% 노출 억제 방지)]:
   - 메타 Threads 공식 알고리즘은 부정적·냉소적·분노/불평 유발 글의 피드 노출을 '-58%'나 억제합니다!
   - 따라서 🚨경고, 😩좌절, 😥불안감 조성(FOMO), 비판, 불평을 일절 배제하세요.
   - 100% 긍정적이고 희망찬 언어("누구나 오늘부터 시작하면 훨씬 수월해집니다! ✨", "오늘 하루도 여러분의 성장을 힘차게 응원합니다 👏")로 작성하세요.

3. [따뜻한 대화체와 북마크(저장) 유도 & 100~200자 분량]:
   - "~해보세요 ✨", "~추천해 드립니다 💡", "~하면 훨씬 쉬워져요 👏"의 친절하고 세련된 구어체 유지.
   - 각 타래는 공백 포함 반드시 100자 이상, 200자 이하(100~200자)를 엄수하세요."""

    system_prompt = f"""당신은 {platform_name} 전문 최고급 바이럴 카피라이터이자 SNS 알고리즘 최적화 전문가입니다.
주제와 배경 맥락(유튜브 분석 내용 또는 대본)을 바탕으로, 해당 플랫폼의 알고리즘에 100% 최적화된 최상급 연속 타래({count}개 포스트)를 작성해야 합니다.

{content_theme_guide}

{algo_optimization_guide}

[타래 구조 및 공통 규칙]
1. 총 {count}개의 포스트로 이루어진 순차 타래(1/{count} ~ {count}/{count})를 구성하세요.
2. [타래 번호 엄격 규칙] 모든 포스트는 맨 첫머리에 정확한 타래 번호를 1:1로 매칭하세요:
   - 1번 포스트(Hook): "1/{count} 🧵" 로 시작 (1번 후킹 포스트가 전체 타래의 1번째 글입니다!)
   - 2번 포스트(Body): "2/{count} 📌" 로 시작 (절대로 1/{count}로 시작하지 마세요! 2번째 글이므로 2/{count}입니다.)
   - 3~{count-1}번 포스트(Body): "3/{count} 🛠️", "4/{count} 💡" 등으로 1씩 순차 증가
   - {count}번 포스트(CTA): "{count}/{count} ✨" (또는 𝕏의 경우 "{count}/{count} 💬")로 시작
   모든 포스트는 정확히 1/{count}부터 {count}/{count}까지 총 {count}개가 일치해야 합니다.

3. [포스트당 글자 수 규칙]
   - {char_rule_desc}

4. 톤앤매너: {tone_desc}
5. 타겟 독자: {audience}

반드시 아래 JSON 형식으로만 응답하세요. 마크다운 코드블록(```json) 안에 넣어 반환하세요.
{{
  "topic": "{topic}",
  "platform": "{platform_key}",
  "hook_formula": "적용된 후킹 공식 (예: {'주간 업계 3대 변수 제시 + 댓글 참여 유도' if is_twitter else '긍정적 주간 다짐 + 비하인드 컷 공유'})",
  "hook_score": 95,
  "summary": "타래 핵심 내용 1줄 요약",
  "hashtags": ["#태그1", "#태그2", "#태그3", "#태그4", "#태그5"],
  "posts": [
    {{
      "index": 1,
      "role": "hook",
      "text": "1/{count} 🧵 (첫 번째 후킹 포스트 내용... {'공백 포함 60~120자 초단문' if is_twitter else '공백 포함 100~200자'})",
      "char_count": {80 if is_twitter else 150}
    }},
    {{
      "index": 2,
      "role": "body",
      "text": "2/{count} 📌 (두 번째 본문 포스트 내용... {'공백 포함 60~120자 초단문' if is_twitter else '공백 포함 100~200자'})",
      "char_count": {90 if is_twitter else 160}
    }}
  ]
}}"""

    user_msg = f"주제: {topic}\n"
    if context:
        user_msg += f"\n[참고 맥락 / 영상 대본 / 분석 요약]\n{context[:3000]}\n"
    user_msg += f"\n위 내용을 바탕으로 {platform_name} 알고리즘 최적화 규칙을 100% 준수한 {count}개의 타래를 생성해주세요."

    if on_progress:
        on_progress("threadx_generating", 40, f"로컬 AI 모델로 {platform_name} 맞춤 타래 작성 중...")

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_msg}
    ]

    try:
        data, _raw = llm_client.call_llm_json(messages, max_tokens=4096, temperature=0.7)
        if not isinstance(data, dict) or "posts" not in data:
            data = _fallback_thread_data(topic, platform_key, count, "AI 응답을 JSON으로 해석하지 못함")
    except Exception as e:
        data = _fallback_thread_data(topic, platform_key, count, str(e))

    # 타래 넘버링 자동 보정 (1/N ~ N/N 일치 보장)
    if isinstance(data, dict) and "posts" in data:
        data["posts"] = normalize_thread_posts(data["posts"])

    # Recalculate exact char_count
    for p in data.get("posts", []):
        p["char_count"] = len(p.get("text", ""))

    if on_progress:
        on_progress("threadx_done", 100, f"{platform_name} 최적화 포스트 생성 완료")

    return data


def _fallback_thread_data(topic, platform, count, error_msg=""):
    is_twitter = str(platform).lower() in ["twitter", "x"]
    posts = []

    if is_twitter:
        # X(트위터) 폴백: 주간 업계 전망 초단문 압축, 질문형 마무리, 외부링크 제외
        for i in range(1, count + 1):
            if i == 1:
                txt = f"1/{count} 🧵 이번 주 {topic}, 꼭 주목할 핵심 변수들을 압축 정리합니다. 시장의 큰 흐름을 빠르게 확인해보세요. 💡"
                role = "hook"
            elif i == count:
                txt = f"{count}/{count} 💬 오늘 짚어본 변수 중 어떤 변화가 가장 결정적일까요? 댓글로 자유롭게 생각을 들려주세요! (📌 원문 자료는 첫 답글에) 👇"
                role = "cta"
            else:
                txt = f"{i}/{count} 📌 변수 {i-1}: 현업에서 가장 빠른 변화가 일어나는 영역입니다. 여러분의 팀은 어떻게 체감하고 계신가요? 💬"
                role = "body"
            posts.append({"index": i, "role": role, "text": txt, "char_count": len(txt)})

        summary_txt = f"{topic} 주간 업계 전망 및 핵심 이슈 화두"
        hook_f = "주간 업계 전망 제시 및 댓글 유도형"
        tags = [f"#{topic.replace(' ', '')}", "#업계전망", "#트렌드분석", "#테크이슈", "#비즈니스"]
    else:
        # Threads(스레드) 폴백: 긍정적 주간 다짐 / 비하인드 컷, 이모지 2~3개 엄수, 부정적 어조 배제
        for i in range(1, count + 1):
            if i == 1:
                txt = f"1/{count} 🧵 활기찬 한 주의 시작! 이번 주 {topic} 목표와 소소한 모닝 루틴을 공유해 봅니다. 작은 실천이 모여 큰 성장을 만든다는 믿음으로 힘차게 출발해 볼까요? ✨🚀"
                role = "hook"
            elif i == count:
                txt = f"{count}/{count} ✨ 여러분의 이번 주 목표는 무엇인가요? 거창하지 않아도 하루 10분의 꾸준함이 기적을 만듭니다. 이번 주도 여러분의 빛나는 도전을 진심으로 응원합니다! 👏💖"
                role = "cta"
            else:
                txt = f"{i}/{count} 📌 이번 주 루틴 {i-1}:\n\n집중력을 높이기 위해 작업 공간을 정돈하고, 가장 중요한 핵심 과제부터 차근차근 시작합니다. 마음의 여유를 챙기며 한 걸음씩 나아가요. 🌱💡"
                role = "body"
            posts.append({"index": i, "role": role, "text": txt, "char_count": len(txt)})

        summary_txt = f"{topic} 긍정적 주간 다짐 및 비하인드 루틴"
        hook_f = "긍정적 주간 다짐 및 성장 비하인드형"
        tags = [f"#{topic.replace(' ', '')}", "#주간다짐", "#모닝루틴", "#성장기록", "#응원"]

    return {
        "topic": topic,
        "platform": platform,
        "hook_formula": hook_f,
        "hook_score": 92,
        "summary": summary_txt,
        "hashtags": tags,
        "posts": posts,
        "is_fallback": True,
        "note": f"AI 응답 해석 실패 — {platform.upper()} 기본 틀로 대체됨 ({error_msg})" if error_msg else f"AI 응답 해석 실패 — {platform.upper()} 기본 틀로 대체됨"
    }


# ── 2. AI SEO 블로그 라이터 스튜디오 ─────────────────────────────────────

def generate_seo_blog(topic, context="", platform_target="general", tone="professional", audience="전문가 및 일반 독자", on_progress=None):
    """
    검색엔진 최적화(SEO) 장문 블로그 포스트 및 메타데이터, 커버 이미지 프롬프트 생성
    """
    if on_progress:
        on_progress("blog_start", 10, "SEO 키워드 및 목차 아키텍처 설계 중...")

    platform_notes = {
        "naver": "네이버 블로그 최적화: 가독성 좋은 짧은 문단, 이모지와 소제목 강조, 대화체 어조, 네이버 스마트에디터 친화적 구성",
        "tistory": "티스토리/워드프레스 최적화: 구글 SEO 친화적인 H2/H3 태그 구조, 코드블록/인용구 박스, 전문적인 정보성 서술",
        "medium_velog": "미디엄/벨로그 최적화: 개발자 및 테크 독자 타겟, 마크다운 완벽 호환, 깊이 있는 기술 및 실무 분석",
        "general": "표준 고품질 SEO 블로그: H1/H2/H3 구조, Callout 요약 박스, FAQ, 결론 CTA"
    }
    plat_desc = platform_notes.get(platform_target, platform_notes["general"])

    system_prompt = f"""당신은 검색엔진 상위 1% 노출을 보장하는 최고급 SEO 테크니컬 블로그 에디터입니다.
주제와 영상 맥락을 바탕으로, 구글/네이버 검색 1위에 랭크될 수 있는 깊이 있고 가독성 높은 완성형 장문 블로그 글을 작성해야 합니다.

[작성 규칙]
1. 제목: 검색량이 높고 클릭률(CTR)을 극대화하는 매력적인 H1 제목 (숫자, 혜택, 연도 포함)
2. 서론: 독자의 문제점을 짚고, 이 글을 읽어야 하는 이유와 핵심 요약(Callout block) 제시
3. 본문: 최소 3개 이상의 소주제(H2), 세부 항목(H3), 불렛 포인트, 볼드체 강조, 꿀팁 박스(> 💡 인용구) 포함
4. FAQ: 독자들이 검색창에 가장 많이 묻는 질문 3가지와 명쾌한 답변
5. 결론: 실천 체크리스트 및 강력한 CTA(Call to Action)
6. 타겟 플랫폼 스타일: {plat_desc}
7. 커버 이미지 프롬프트: Midjourney v6 / DALL-E 3에서 8k 극실사 또는 모던 일러스트를 뽑을 수 있는 영문 프롬프트

반드시 아래 JSON 형식으로만 응답하세요. 마크다운 코드블록(```json) 안에 넣어 반환하세요.
{{
  "topic": "{topic}",
  "meta": {{
    "title": "클릭률을 극대화한 SEO 메타 타이틀 (60자 내외)",
    "description": "검색 결과 스니펫에 노출될 매력적인 메타 디스크립션 (150자 내외)",
    "keywords": ["핵심키워드1", "연관키워드2", "키워드3", "키워드4", "키워드5"],
    "reading_time_min": 5,
    "target_platform": "{platform_target}"
  }},
  "cover_image_prompt": "Hyper-realistic, cinematic lighting, modern 3D isometric or professional photography representing the topic, 8k resolution, minimalist clean aesthetic, --ar 16:9",
  "markdown_content": "# 완성형 블로그 마크다운 본문..."
}}"""

    user_msg = f"주제: {topic}\n"
    if context:
        user_msg += f"\n[참고 맥락 / 영상 대본 / 분석 요약]\n{context[:3500]}\n"
    user_msg += f"\n위 내용을 바탕으로 완벽한 SEO 블로그 아티클과 메타데이터를 생성해주세요."

    if on_progress:
        on_progress("blog_generating", 45, "SEO 장문 블로그 본문 및 FAQ 작성 중...")

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_msg}
    ]

    try:
        data, _raw = llm_client.call_llm_json(messages, max_tokens=4096, temperature=0.6)
        if not isinstance(data, dict) or "markdown_content" not in data:
            data = _fallback_blog_data(topic, platform_target, "AI 응답을 JSON으로 해석하지 못함")
    except Exception as e:
        data = _fallback_blog_data(topic, platform_target, str(e))

    if on_progress:
        on_progress("blog_done", 100, "SEO 블로그 글 생성 완료")

    return data


def _fallback_blog_data(topic, platform_target, error_msg=""):
    md = f"""# {topic}: 완벽 가이드 및 실전 활용법 총정리

> 💡 **핵심 요약 (Key Takeaways)**
> - **주제 핵심**: {topic}을 통해 작업 효율과 생산성을 극대화할 수 있습니다.
> - **적용 대상**: 시간 절약과 자동화가 필요한 모든 크리에이터 및 실무자.
> - **바로 실행할 1가지**: 지금 바로 시스템을 구축하여 복리 효과를 누리세요.

---

## 1. 왜 지금 {topic}에 주목해야 하는가?

많은 사람들이 수동 작업으로 많은 시간을 낭비하고 있습니다. 하지만 효율적인 자동화 파이프라인과 원리를 이해하면 기존 대비 10배 이상의 성과를 거둘 수 있습니다.

### 핵심 변화 포인트
- **시간 절약**: 반복적인 루틴 작업을 인공지능과 자동화 도구에 위임
- **품질 표준화**: 일관된 고품질 결과물 지속 생산
- **멀티채널 확장**: 하나의 원천 콘텐츠(One-Source)로 블로그, 유튜브, SNS를 동시에 장악

---

## 2. 3단계 실전 적용 로드맵

### Step 1. 기초 환경 구축 및 분석
가장 먼저 본인의 타겟 오디언스와 목표를 명확히 정의합니다.

### Step 2. 파이프라인 자동화 구현
도구를 연결하여 입력부터 최종 배포까지 매끄럽게 이어지는 시스템을 만듭니다.

### Step 3. 데이터 측정 및 지속적 개선
조회수와 전환율 데이터를 모니터링하며 지속적으로 최적화합니다.

---

## ❓ 자주 묻는 질문 (FAQ)

**Q1. 초보자도 쉽게 따라 할 수 있나요?**  
A. 네, 복잡한 코딩 없이도 단계별 가이드만 따르면 누구나 10분 만에 구축할 수 있습니다.

**Q2. 어떤 도구를 함께 사용하는 것이 가장 좋은가요?**  
A. 로컬 AI 도구 및 TubeInsight와 같은 멀티채널 자동화 허브를 연동하는 것을 추천합니다.

---

## 🚀 결론 및 실천하기

지금 바로 시작하는 것이 가장 빠른 지름길입니다. 오늘 소개한 핵심 단계를 하나씩 적용해보세요!
"""

    return {
        "topic": topic,
        "meta": {
            "title": f"{topic}: 2026년 최신 실전 가이드 총정리",
            "description": f"{topic}의 핵심 원리와 3단계 실전 적용 방법을 완벽하게 정리했습니다. 지금 바로 확인하고 생산성을 10배 높여보세요.",
            "keywords": [topic, f"{topic} 활용법", "생산성 향상", "자동화 툴", "AI 마케팅"],
            "reading_time_min": 4,
            "target_platform": platform_target
        },
        "cover_image_prompt": f"A sleek modern digital workspace with glowing holographic interfaces representing {topic}, futuristic aesthetic, clean soft lighting, 8k resolution, cinematic composition --ar 16:9",
        "markdown_content": md,
        "is_fallback": True,
        "note": f"AI 응답 해석 실패 — 기본 틀로 대체됨 ({error_msg})" if error_msg else "AI 응답 해석 실패 — 기본 틀로 대체됨"
    }


# ── 3. Notifuse 뉴스레터 & 이메일 캠페인 허브 ───────────────────────────

def generate_newsletter(topic, context="", campaign_type="video_launch", audience="구독자 및 충성 팬", offer="", on_progress=None):
    """
    A/B 테스트 제목 5종 및 반응형 HTML/MJML 이메일 뉴스레터 생성
    """
    if on_progress:
        on_progress("newsletter_start", 10, "고전환 이메일 카피라이팅 기획 중...")

    campaign_guides = {
        "video_launch": "신규 유튜브 영상/콘텐츠 공개 안내: 클릭을 유발하는 영상 핵심 하이라이트와 비하인드 스토리 전달",
        "weekly_digest": "주간 뉴스레터/인사이트 다이제스트: 이번 주 핵심 소식 3가지, 추천 리소스, 인사이트 큐레이션",
        "product_sales": "제품/서비스 판매 및 프로모션: 가치 제안, 한정 혜택(Offer), 고객 후기, 구매 전환 CTA",
        "lead_nurture": "구독자 신뢰 구축(Nurturing): 유용한 무료 정보, 실전 노하우 나눔, 친근한 편지 형식"
    }
    camp_desc = campaign_guides.get(campaign_type, campaign_guides["video_launch"])

    system_prompt = f"""당신은 오픈율 40% 이상, 클릭률(CTR) 15% 이상을 달성하는 세계 최고 수준의 이메일 마케팅 & 뉴스레터 카피라이터입니다.
주제와 맥락을 바탕으로, 구독자가 메일함을 열자마자 몰입하여 클릭 버튼(CTA)을 누르게 만드는 완벽한 반응형 HTML 뉴스레터를 작성해야 합니다.

[작성 규칙]
1. A/B 테스트 이메일 제목 5가지:
   - 1) 호기심/질문형
   - 2) 구체적 숫자/혜택형
   - 3) 긴급성/FOMO형
   - 4) 스토리/개인화형
   - 5) 직관적/요약형
   (각 제목마다 메일함 목록에 보이는 40자 내외의 프리뷰 텍스트(Preview Text)를 함께 작성하세요.)
2. 캠페인 목적: {camp_desc}
3. 타겟 오디언스: {audience}
4. 혜택 / 오퍼(Offer): {offer if offer else "최신 영상 시청 및 무료 실전 가이드 제공"}
5. 이메일 본문 (HTML):
   - 모바일 및 PC 모두에서 완벽하게 깨지지 않는 현대적이고 깔끔한 반응형 인라인 스타일(Inline CSS) HTML 코드로 작성하세요.
   - 배경: 세련된 다크/라이트 카드 스타일 (#ffffff 또는 #0f172a 배경에 깔끔한 패딩)
   - 구성: 헤더 로고/타이틀 -> 매력적인 인사말 -> 본문 핵심 내용(박스/불렛) -> 크고 선명한 CTA 버튼 -> 푸터(구독 해지 안내 등)

반드시 아래 JSON 형식으로만 응답하세요. 마크다운 코드블록(```json) 안에 넣어 반환하세요.
{{
  "topic": "{topic}",
  "campaign_type": "{campaign_type}",
  "subject_lines": [
    {{ "type": "호기심 유발형", "subject": "제목 1...", "preview_text": "프리뷰 텍스트 1..." }},
    {{ "type": "숫자/혜택형", "subject": "제목 2...", "preview_text": "프리뷰 텍스트 2..." }},
    {{ "type": "긴급/FOMO형", "subject": "제목 3...", "preview_text": "프리뷰 텍스트 3..." }},
    {{ "type": "스토리텔링형", "subject": "제목 4...", "preview_text": "프리뷰 텍스트 4..." }},
    {{ "type": "직관적 요약형", "subject": "제목 5...", "preview_text": "프리뷰 텍스트 5..." }}
  ],
  "html_template": "<!DOCTYPE html><html>...완성형 반응형 인라인 HTML...</html>",
  "plain_text": "텍스트 이메일 클라이언트용 일반 텍스트 본문..."
}}"""

    user_msg = f"주제: {topic}\n"
    if context:
        user_msg += f"\n[참고 맥락 / 영상 대본 / 분석 요약]\n{context[:3000]}\n"
    if offer:
        user_msg += f"\n[특별 오퍼 / CTA 링크 안내]\n{offer}\n"
    user_msg += f"\n위 내용을 바탕으로 완벽한 뉴스레터 캠페인과 반응형 HTML 이메일을 생성해주세요."

    if on_progress:
        on_progress("newsletter_generating", 45, "반응형 HTML 뉴스레터 템플릿 렌더링 중...")

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_msg}
    ]

    try:
        data, _raw = llm_client.call_llm_json(messages, max_tokens=4096, temperature=0.6)
        if not isinstance(data, dict) or "html_template" not in data:
            data = _fallback_newsletter_data(topic, campaign_type, "AI 응답을 JSON으로 해석하지 못함")
    except Exception as e:
        data = _fallback_newsletter_data(topic, campaign_type, str(e))

    if on_progress:
        on_progress("newsletter_done", 100, "뉴스레터 캠페인 생성 완료")

    return data


def _fallback_newsletter_data(topic, campaign_type, error_msg=""):
    html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{topic}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
    <tr>
      <td align="center" style="padding: 30px 15px;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06);">
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #18181b 0%, #27272a 100%); padding: 32px 28px; text-align: center;">
              <span style="display: inline-block; background-color: rgba(255,255,255,0.15); color: #38bdf8; font-size: 11px; font-weight: 700; letter-spacing: 1px; padding: 4px 12px; border-radius: 20px; text-transform: uppercase; margin-bottom: 12px;">TubeInsight Weekly Digest</span>
              <h1 style="color: #ffffff; font-size: 22px; font-weight: 800; margin: 0; line-height: 1.4;">{topic}</h1>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 32px 28px; color: #334155; font-size: 15px; line-height: 1.7;">
              <p style="margin-top: 0; font-size: 16px; font-weight: 600; color: #0f172a;">안녕하세요, 구독자님! 👋</p>
              <p>이번 주에는 많은 분들이 질문해주셨던 <strong>'{topic}'</strong>에 대한 핵심 노하우와 인사이트를 알기 쉽게 정리해 드립니다.</p>
              
              <!-- Highlight Box -->
              <div style="background-color: #f8fafc; border-left: 4px solid #6366f1; padding: 18px; border-radius: 0 8px 8px 0; margin: 24px 0;">
                <p style="margin: 0 0 8px 0; font-weight: 700; color: #1e293b;">📌 이번 호 핵심 포인트 3가지</p>
                <ul style="margin: 0; padding-left: 20px; color: #475569;">
                  <li style="margin-bottom: 6px;">복잡한 과정을 10분 만에 끝내는 자동화 원리</li>
                  <li style="margin-bottom: 6px;">시간 낭비를 줄여주는 검증된 템플릿 제공</li>
                  <li>지금 바로 적용 가능한 실전 적용 팁</li>
                </ul>
              </div>

              <p>더 자세한 내용과 단계별 튜토리얼은 영상과 상세 가이드 문서에서 확인하실 수 있습니다.</p>

              <!-- CTA Button -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 32px 0;">
                <tr>
                  <td align="center">
                    <a href="https://youtube.com" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%); color: #ffffff; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 8px; box-shadow: 0 4px 14px rgba(79, 70, 229, 0.35);">
                      지금 바로 전체 내용 확인하기 →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin-bottom: 0; font-size: 14px; color: #64748b;">궁금한 점이나 피드백이 있으시다면 언제든 이 메일에 회신해 주세요!</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 24px 28px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8;">
              <p style="margin: 0 0 6px 0;">본 메일은 TubeInsight 소식을 구독해주신 분들께 발송되었습니다.</p>
              <p style="margin: 0;"><a href="#" style="color: #64748b; text-decoration: underline;">수신거부 (Unsubscribe)</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

    plain = f"""[TubeInsight Weekly] {topic}

안녕하세요, 구독자님!

이번 주에는 '{topic}'에 대한 핵심 노하우와 실전 인사이트를 전달해 드립니다.

[이번 호 핵심 포인트]
- 복잡한 과정을 10분 만에 끝내는 자동화 원리
- 시간 낭비를 줄여주는 검증된 템플릿 제공
- 지금 바로 적용 가능한 실전 적용 팁

자세한 내용은 아래 링크에서 확인해 보세요:
https://youtube.com

감사합니다.
"""

    return {
        "topic": topic,
        "campaign_type": campaign_type,
        "subject_lines": [
          {"type": "호기심 유발형", "subject": f"🔥 {topic}, 아직도 모르고 계셨나요?", "preview_text": "알고 나면 생산성이 10배 달라지는 특급 비결"},
          {"type": "숫자/혜택형", "subject": f"💡 {topic}으로 시간을 10배 절약하는 3가지 방법", "preview_text": "지금 바로 써먹는 실전 가이드라인 공개"},
          {"type": "긴급/FOMO형", "subject": f"🚨 [마감 임박] {topic} 필수 핵심 요약집", "preview_text": "남들보다 앞서가는 크리에이터의 비밀"},
          {"type": "스토리텔링형", "subject": f"✍️ 제가 {topic}을 직접 해보고 깨달은 것들", "preview_text": "수많은 시행착오 끝에 찾아낸 가장 빠른 지름길"},
          {"type": "직관적 요약형", "subject": f"📌 이번 주 핵심 정리: {topic}", "preview_text": "바쁜 분들을 위한 3분 컷 핵심 다이제스트"}
        ],
        "html_template": html,
        "plain_text": plain,
        "is_fallback": True,
        "note": f"AI 응답 해석 실패 — 기본 틀로 대체됨 ({error_msg})" if error_msg else "AI 응답 해석 실패 — 기본 틀로 대체됨"
    }


# ── 4. 🚀 원클릭 전채널 올인원 마케팅 생성 (Omni-Marketing) ────────────────

def generate_all_marketing(topic, context="", options=None, on_progress=None):
    """
    Threads/X + SEO Blog + Newsletter 3대 채널을 원클릭으로 동시/순차 일괄 생성
    """
    if options is None:
        options = {}

    platform = options.get("thread_platform", "threads")
    tone = options.get("thread_tone", "positive_informative")
    post_count = int(options.get("thread_count", 5))
    audience = options.get("audience", "크리에이터, 직장인, 마케터")
    blog_platform = options.get("blog_platform", "general")
    campaign_type = options.get("campaign_type", "video_launch")
    offer = options.get("offer", "")

    result = {
        "timestamp": time.time(),
        "topic": topic,
        "threads_x": None,
        "seo_blog": None,
        "newsletter": None
    }

    if on_progress:
        on_progress("omni_start", 5, f"🚀 '{topic}' 전채널 마케팅 올인원 파이프라인 가동...")

    # Step 1: ThreadX
    if on_progress:
        on_progress("omni_threads", 20, "1/3단계: 스레드 & X 바이럴 타래 생성 중...")
    result["threads_x"] = generate_threads_x(
        topic=topic,
        context=context,
        platform=platform,
        tone=tone,
        count=post_count,
        audience=audience
    )

    # Step 2: SEO Blog
    if on_progress:
        on_progress("omni_blog", 55, "2/3단계: 구글/네이버 SEO 최적화 장문 블로그 글 생성 중...")
    result["seo_blog"] = generate_seo_blog(
        topic=topic,
        context=context,
        platform_target=blog_platform,
        tone=tone,
        audience=audience
    )

    # Step 3: Newsletter
    if on_progress:
        on_progress("omni_newsletter", 85, "3/3단계: A/B 테스트 반응형 이메일 뉴스레터 생성 중...")
    result["newsletter"] = generate_newsletter(
        topic=topic,
        context=context,
        campaign_type=campaign_type,
        audience=audience,
        offer=offer
    )

    if on_progress:
        on_progress("omni_done", 100, "전채널 마케팅 콘텐츠 올인원 생성 완료!")

    return result


ID_RE = re.compile(r"^[a-zA-Z0-9_\-]+$")


def save_entry(topic, mode, result):
    """생성 결과를 보관함에 저장하고 id를 돌려줍니다 (모든 모드 공통)."""
    entry = {"id": f"marketing_{int(time.time() * 1000)}", "topic": topic, "mode": mode,
             "timestamp": time.time(), "result": result}
    with open(os.path.join(MARKETING_DIR, f"{entry['id']}.json"), "w", encoding="utf-8") as f:
        json.dump(entry, f, ensure_ascii=False, indent=2)
    return entry["id"]


def load_entry(entry_id):
    if not ID_RE.fullmatch(entry_id or ""):
        return None
    path = os.path.join(MARKETING_DIR, f"{entry_id}.json")
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, dict):
        if "result" in data and isinstance(data["result"], dict) and "posts" in data["result"]:
            data["result"]["posts"] = normalize_thread_posts(data["result"]["posts"])
        elif "posts" in data:
            data["posts"] = normalize_thread_posts(data["posts"])
    return data


def _save_marketing_history(data):
    try:
        fname = f"marketing_{int(time.time())}.json"
        fpath = os.path.join(MARKETING_DIR, fname)
        with open(fpath, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


def list_marketing_history():
    files = []
    try:
        for f in os.listdir(MARKETING_DIR):
            if f.startswith("marketing_") and f.endswith(".json"):
                fpath = os.path.join(MARKETING_DIR, f)
                with open(fpath, "r", encoding="utf-8") as fp:
                    d = json.load(fp)
                    files.append({
                        "id": f.replace(".json", ""),
                        "topic": d.get("topic", "무제"),
                        "mode": d.get("mode", "all"),
                        "timestamp": d.get("timestamp", 0)
                    })
        files.sort(key=lambda x: x["timestamp"], reverse=True)
    except Exception:
        pass
    return files
