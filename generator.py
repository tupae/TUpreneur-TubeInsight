# 분석 데이터 기반 신규 콘텐츠 기획 — 8초 씬 대본 · AI 영상 프롬프트 · 나노바나나 레드라인 이미지 프롬프트
import os
import re
import json
import time
import glob

import llm_client

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
PLANS_DIR = os.path.join(DATA_DIR, "plans")
ANALYSES_DIR = os.path.join(DATA_DIR, "analyses")
KNOWLEDGE_DIR = os.path.join(DATA_DIR, "knowledge")
DOCS_DIR = os.path.join(BASE_DIR, "docs")
SHORTS_SCRIPT_DOCS = {
    "건축쇼츠": os.path.join(DOCS_DIR, "building-shorts-script.md"),
    "테크쇼츠": os.path.join(DOCS_DIR, "tech-shorts-script.md"),
    "경제쇼츠": os.path.join(DOCS_DIR, "biz-shorts-script.md"),
}
SHORTS_PROMPT_DOCS = {
    "건축쇼츠": os.path.join(DOCS_DIR, "building-shorts-prompt.md"),
    "테크쇼츠": os.path.join(DOCS_DIR, "tech-shorts-prompt.md"),
    "경제쇼츠": os.path.join(DOCS_DIR, "biz-shorts-prompt.md"),
}
# 기존 레거시 호환 경로
SHORTS_SCRIPT_PATH = SHORTS_SCRIPT_DOCS["건축쇼츠"]
KNOWLEDGE_SHORTS_PATH = SHORTS_PROMPT_DOCS["건축쇼츠"]
os.makedirs(KNOWLEDGE_DIR, exist_ok=True)
os.makedirs(PLANS_DIR, exist_ok=True)

DEFAULT_REFERENCE_ID = "ws1Clj0vOAM"
SCENE_SECONDS = 8          # 기본값 — 기획별로 scene_seconds 로 덮어씀 (쇼츠 8초 / 미드폼 15초 / 롱폼 20초)
CHUNK_SIZE = 8             # 씬이 많을 때 LLM 호출을 나누는 단위 (출력 잘림 방지)


def narration_bounds(secs):
    """씬 길이(초)에 맞는 나레이션 글자 수 (하한, 상한, 경고 기준).
    쇼츠(8초 씬) 60~65자 기준을 미드폼/롱폼(10초, 15초)에도 일관되게 적용하여 오디오 갭을 방지합니다."""
    if secs <= 8:
        return 58, 68, 82
    elif secs <= 10:
        return 70, 80, 95
    elif secs <= 15:
        return 100, 118, 140
    return int(secs * 7.0), int(secs * 8.0), int(secs * 9.5)

STAGE_NAMES = [
    ("도입", "The Setup — 기대를 심고 곧바로 반전으로 시선을 붙잡음"),
    ("갈등", "The Crisis — 문제의 스케일과 본질을 구체적 수치로 보여줌"),
    ("난제", "The Dilemma — 왜 쉽게 해결할 수 없는지 딜레마 제시"),
    ("반전", "The Response — 역발상 해법과 구체적 근거"),
    ("여운", "The Critique — 현실에 대한 통찰과 질문으로 마무리"),
]

DEFAULT_REDLINE_STYLE = {
    "base": "photorealistic 3D architectural scale model render, miniature diorama cube, matte grey concrete and clay materials, exposed geological soil and rock cutaway strata, soft studio lighting, soft ambient occlusion",
    "figures": "miniature faceless white mannequin workers in white protective suits",
    "annotation": "vibrant thin architectural red engineering annotation overlay (#FF0000), 3D dimension bounding lines with corner arrowheads, thin red dotted leader lines with circular endpoint dots, thin red wireframe structural accent lines",
    "color_palette": "monochrome matte grey and concrete tones with high-contrast vivid red line graphics",
    "render_quality": "octane render, unreal engine 5 architectural visualization, crisp technical manual diorama aesthetic"
}
DEFAULT_REDLINE_CONSTRAINTS = [
    "모든 텍스트는 큰따옴표로 지정된 정확한 철자로 상단에 크고 선명하게 렌더링 (예: '지하 50층 비밀', '극한의 압력과')",
    "지정한 텍스트 및 주석 외 어떤 무의미한 글자나 기호, 외계어도 넣지 말 것 (지정한 텍스트 외 글자 금지)",
    "모든 빨간색 주석선(치수선, 지시선, 액센트선)은 선명한 빨간색(#FF0000)으로 대상을 정확히 가리킬 것",
    "배경 및 피사체는 모노크롬 매트 그레이/클레이 건축 모델 디오라마 스타일을 엄격히 유지할 것"
]


ASPECT_GUIDE = {
    "16:9": "16:9 가로 롱폼 — 와이드 시네마틱 구도, 좌우 여백을 활용한 단면·부감 컷어웨이",
    "9:16": "9:16 세로 쇼츠 — 피사체를 화면 중앙 세로축에 배치, 상단은 훅 문구·하단은 자막 공간을 비워 둠, high-angle/isometric",
}


# ── 유틸 ────────────────────────────────────────────────────────────────

def _llm(messages, max_tokens=4096):
    return llm_client.call_llm(messages, max_tokens=max_tokens, temperature=0.75)


def _llm_json(messages, max_tokens=4096):
    return llm_client.call_llm_json(messages, max_tokens=max_tokens, temperature=0.5)


def _time_range(i, secs=SCENE_SECONDS):
    s, e = (i - 1) * secs, i * secs
    return f"{s // 60:02d}:{s % 60:02d} ~ {e // 60:02d}:{e % 60:02d}"


def stage_plan(num_scenes):
    """씬 수에 맞춰 5단계 플롯을 씬 번호 구간으로 배분합니다. 예) 6씬 → 1 / 2 / 3-4 / 5 / 6"""
    plan = []
    for k, (name, desc) in enumerate(STAGE_NAMES):
        start = round(k * num_scenes / 5) + 1
        end = round((k + 1) * num_scenes / 5)
        if end < start:
            end = start
        plan.append({"name": name, "desc": desc, "start": start, "end": min(end, num_scenes)})
    return plan


def stage_for_scene(plan, i):
    for st in plan:
        if st["start"] <= i <= st["end"]:
            return st["name"]
    return plan[-1]["name"]


def safe_name(text, limit=30):
    return re.sub(r'[\/\\:*?"<>|\'`]', "_", text or "").strip()[:limit] or "plan"


def clean_text_for_label(text, limit=16):
    cleaned = re.sub(r"['\"\[\]\(\)\{\}\*\#\_\~:\.,!?]", " ", text or "").strip()
    words = cleaned.split()
    return (" ".join(words[:2]) if len(words) >= 2 else cleaned)[:limit].strip()


def extract_redline_headline(subtitle, topic="", scene_num=1):
    """
    docs/레드라인.md 및 첨부 이미지 기준:
    - 상단 볼드 고딕 헤더 타이틀용 문구 추출
    - 문구당 2~4단어 (7~12자 내외의 완전한 한국어 문구, 절대 단어 중간을 자르지 않음)
    - 예: '극한의 압력과', '지하 50층 비밀', '빅 시스템', '안전 뒤의 위험'
    """
    raw = subtitle or topic or "비밀 통제실"
    cleaned = re.sub(r"['\"\[\]\(\)\{\}\*\#\_\~:\.,!?]", " ", raw).strip()
    words = [w for w in cleaned.split() if w]

    # 씬 1이거나 도입부일 때 topic 핵심 키워드 매칭 우선 (예: '지하 50층 비밀')
    if scene_num == 1 and topic:
        t_clean = re.sub(r"['\"\[\]\(\)\{\}\*\#\_\~:\.,!?]", " ", topic).strip()
        t_words = t_clean.split()
        if len(t_words) >= 3 and len(" ".join(t_words[:3])) <= 14:
            return " ".join(t_words[:3])
        elif len(t_words) >= 2 and len(" ".join(t_words[:2])) <= 14:
            return " ".join(t_words[:2])

    # 서술형 접속사나 불필요한 서두 단어 건너뛰기
    skip_leads = {"수십", "년간", "이곳은", "하지만", "그리고", "결국", "바로", "우리는", "실제로", "과연"}
    start_idx = 0
    while start_idx < len(words) - 1 and words[start_idx] in skip_leads:
        start_idx += 1

    target_words = words[start_idx:] if start_idx < len(words) else words

    # 2~3단어 누적하되 최대 14자 이하로 자연스럽게 결합
    acc = []
    total_len = 0
    for w in target_words:
        add_len = len(w) + (1 if acc else 0)
        if total_len + add_len <= 12:
            acc.append(w)
            total_len += add_len
        else:
            break
        if len(acc) >= 2 and total_len >= 7:
            break

    if len(acc) >= 2:
        return " ".join(acc)
    elif acc:
        return acc[0][:14]
    return (topic or "핵심 통제실")[:12]



def _normalize_plan(d, path=None):
    if not isinstance(d, dict):
        return d
    topic = d.get("topic") or (os.path.splitext(os.path.basename(path))[0] if path else "기획서")
    topic = topic.replace("_콘텐츠기획", "")
    d["topic"] = topic
    if not d.get("plan_id") and path:
        d["plan_id"] = os.path.splitext(os.path.basename(path))[0]

    meta_text = d.get("meta_text") or ""
    meta = d.get("meta")
    # If meta.titles is missing or has incorrect generic keys like "최고의 시너지", re-parse from meta_text
    needs_reparse = not meta or not isinstance(meta, dict) or not meta.get("titles")
    if not needs_reparse:
        titles_list = meta.get("titles") or []
        first_title = titles_list[0].get("title", "") if titles_list else ""
        if (
            len(first_title) < 5
            or first_title.endswith(":")
            or any(t.get("title", "").endswith(":") for t in titles_list)
            or any(k in first_title for k in ["최고의 시너지", "전문성 강조", "전문성 최적화", "클릭 유도"])
        ):
            needs_reparse = True

    if needs_reparse and meta_text:
        # Parse from meta_text
        titles = []
        # Pattern A: Table rows: | **후보 N...** | Title | Strategy | ...
        table_rows = re.findall(r'\|\s*\*\*후보\s*(\d+)[^\*]*\*\*\s*(?:\(([^)]+)\))?\s*\|\s*([^\n\|]+?)\s*\|\s*([^\n\|]+?)\s*\|', meta_text)
        if table_rows:
            for num, h_type, title, reason in table_rows:
                t_clean = title.strip().strip('*').strip('"').strip("'")
                h_clean = (h_type or f"후보 {num}").strip()
                r_clean = reason.strip().strip('*')
                titles.append({"type": h_clean[:14], "title": t_clean[:80], "reason": r_clean[:200]})

        # Pattern B: Section headers: ### ✅ [제목] 후보 N
        if not titles:
            cand_blocks = re.findall(r'###\s*✅?\s*(?:제목\s*)?후보\s*(\d+)[^:\n]*:?\s*([^\n]+)?\s*\n\s*(?:\*\s*)?(?:\*\*)?제목:?(?:\*\*)?\s*(?:\*\*)?([^\n\r\*]+?)(?:\*\*)?\s*\n(.*?)(?=\n###|\n---|\Z)', meta_text, re.DOTALL)
            for num, hook, title, rest in cand_blocks:
                t_clean = title.strip().strip('*').strip('"').strip("'")
                h_clean = (hook or f"후보 {num}").strip()
                strat_m = re.search(r'\*\s*\*\*전략:\*\*\s*([^\n]+)', rest)
                reason = strat_m.group(1).strip() if strat_m else "흥행 공식을 적용한 제목"
                titles.append({"type": h_clean[:14], "title": t_clean[:80], "reason": reason[:200]})

        # Pattern C: Standard numbered list: 1. **Title** _(Hook)_ - Reason
        if not titles:
            alt = re.findall(r'(\d+)\.\s*\*\*([^\*]+)\*\*\s*(?:_\(([^)]+)\)_)?\s*[—\-:]?\s*([^\n]+)?', meta_text)
            for num, title, h_type, reason in alt:
                titles.append({"type": (h_type or f"후보 {num}").strip()[:14], "title": title.strip()[:80], "reason": (reason or "흥행 공식을 적용한 제목").strip()[:200]})

        if not titles:
            titles = [{"type": "추천", "title": topic, "reason": "주제 기반 추천 제목"}]

        # Recommended title
        m_rec = re.search(r'\*\*최종\s*추천\s*제목:\*\*\s*\*\*(?:후보\s*\d+[\.\:]\s*)?\"?([^\n\*\"_]+?)\"?\s*\*\*', meta_text)
        if not m_rec:
            m_rec = re.search(r'\*\*🏆\s*최종\s*추천\s*제목:\s*(?:\*\*)?(?:후보\s*\d+[\.\:]\s*)?\"?([^\n\*\"_]+?)\"?\s*\*\*', meta_text)
        if not m_rec:
            m_rec = re.search(r'\[최종\s*추천\]\s*([^\n\*\"_]+)', meta_text)
        rec_title = m_rec.group(1).strip().strip('*').strip('"') if m_rec else titles[0]["title"]

        m_rec_reason = re.search(r'\*\*✅\s*선정\s*이유:\*\*(.*?)(?=\n###|\n---|\Z)', meta_text, re.DOTALL)
        if not m_rec_reason:
            m_rec_reason = re.search(r'선정\s*이유:?\s*\n(.*?)(?=\n###|\n---|\Z)', meta_text, re.DOTALL)
        rec_reason = m_rec_reason.group(1).strip() if m_rec_reason else "높은 클릭률과 호기심 유발 구조"

        m_hook = re.search(r'⚠️\s*\*\*도입부\s*줄거리:\*\*\s*\n(.*?)(?=\n---|###|\Z)', meta_text, re.DOTALL)
        summary = m_hook.group(1).strip() if m_hook else f"{topic}의 충격적인 진실과 숨겨진 비밀을 밝힙니다."
        m_insight = re.search(r'🔬\s*\*\*왜\s*이\s*영상이\s*특별한가[^\*]*\*\*(.*?)(?=\n---|###|\Z)', meta_text, re.DOTALL)
        insight = m_insight.group(1).strip() if m_insight else "단순한 정보 전달을 넘어 정밀한 공학적 분석과 반전 서사를 담았습니다."
        m_cta = re.search(r'🔔\s*\*\*지식의\s*깊이를\s*경험하고\s*싶다면\?[^\*]*\*\*(.*?)(?=\n#|###|\Z)', meta_text, re.DOTALL)
        cta = m_cta.group(1).strip() if m_cta else "채널 구독과 알림 설정을 통해 다음 분석을 놓치지 마세요!"
        hashtags = [("#" + h.strip("# ")) for h in re.findall(r'#([^\s#]+)', meta_text)] or [f"#{topic.replace(' ', '')}", "#지식다큐"]

        meta = {
            "titles": titles,
            "recommended": {"title": rec_title, "reason": rec_reason[:300]},
            "description": {"summary": summary[:600], "insight": insight[:400], "cta": cta[:200], "hashtags": hashtags[:8]}
        }
        d["meta"] = meta

    if not d.get("description_plain"):
        desc = d.get("meta", {}).get("description", {})
        parts = [desc.get("summary"), desc.get("insight"), desc.get("cta"), " ".join(desc.get("hashtags", []))]
        d["description_plain"] = "\n\n".join(p for p in parts if p) or meta_text

    if not d.get("thumbnail_prompt_raw"):
        tp = d.get("thumbnail_prompt") or d.get("thumbnail_image_prompt") or {}
        d["thumbnail_prompt_raw"] = json.dumps(tp, ensure_ascii=False, indent=2)

    scenes = d.get("structured_scenes") or []
    for s in scenes:
        if not s.get("image_prompt_raw") and s.get("first_frame_prompt"):
            s["image_prompt_raw"] = json.dumps(s["first_frame_prompt"], ensure_ascii=False, indent=2)
        if "prompt_ok" not in s:
            s["prompt_ok"] = bool(s.get("prompt_en"))
        if "parse_ok" not in s:
            s["parse_ok"] = bool(s.get("subtitle"))
    d["structured_scenes"] = scenes

    if not d.get("quality"):
        d["quality"] = {
            "scenes_parsed": sum(1 for s in scenes if s.get("parse_ok")),
            "prompts_parsed": sum(1 for s in scenes if s.get("prompt_ok")),
            "images_parsed": sum(1 for s in scenes if bool(s.get("image_prompt_raw"))),
            "length_warnings": []
        }
    return d


def list_plans():
    items = []
    seen = set()
    search_dirs = [PLANS_DIR, os.path.join(BASE_DIR, "output")]
    for sdir in search_dirs:
        if not os.path.exists(sdir):
            continue
        for path in glob.glob(os.path.join(sdir, "*.json")):
            try:
                base_name = os.path.splitext(os.path.basename(path))[0]
                if base_name in seen:
                    continue
                seen.add(base_name)
                with open(path, encoding="utf-8") as f:
                    d = json.load(f)
                d = _normalize_plan(d, path)
                items.append({
                    "plan_id": d.get("plan_id") or base_name,
                    "topic": d.get("topic"),
                    "num_scenes": len(d.get("structured_scenes") or []),
                    "aspect_ratio": d.get("aspect_ratio"),
                    "reference_title": (d.get("reference") or {}).get("title"),
                    "has_audio": bool((d.get("audio_data") or {}).get("full_audio_url")),
                    "created_at": d.get("created_at") or os.path.getmtime(path),
                })
            except Exception:
                continue
    items.sort(key=lambda x: x["created_at"] or 0, reverse=True)
    return items


def load_plan(plan_id):
    clean_id = (plan_id or "").replace(".json", "").strip()
    if not clean_id:
        return None
    candidates = [
        os.path.join(PLANS_DIR, f"{clean_id}.json"),
        os.path.join(PLANS_DIR, f"{safe_name(clean_id, 120)}.json"),
        os.path.join(BASE_DIR, "output", f"{clean_id}.json"),
        os.path.join(BASE_DIR, "output", f"{clean_id}_콘텐츠기획.json"),
        os.path.join(PLANS_DIR, f"{clean_id}_콘텐츠기획.json"),
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                with open(path, encoding="utf-8") as f:
                    d = json.load(f)
                return _normalize_plan(d, path)
            except Exception:
                return None
    # scan search dirs for internal plan_id or topic match
    for sdir in [PLANS_DIR, os.path.join(BASE_DIR, "output")]:
        if os.path.exists(sdir):
            for path in glob.glob(os.path.join(sdir, "*.json")):
                try:
                    with open(path, encoding="utf-8") as f:
                        d = json.load(f)
                    if d.get("plan_id") == clean_id or d.get("topic") == clean_id or os.path.splitext(os.path.basename(path))[0] == clean_id:
                        return _normalize_plan(d, path)
                    # topic prefix match (e.g. topic_timestamp)
                    topic = d.get("topic") or ""
                    if topic and clean_id.startswith(topic):
                        return _normalize_plan(d, path)
                except Exception:
                    continue
    return None


def update_scene_subtitle(plan, scene_num, subtitle):
    """씬 나레이션을 바꾸고 기획서 텍스트(scenes_text/prompts_text/full_document)도 함께 갱신합니다."""
    sc = next((s for s in plan.get("structured_scenes", []) if int(s.get("scene_num")) == int(scene_num)), None)
    if sc is None:
        raise ValueError("해당 씬을 찾을 수 없습니다.")
    new = re.sub(r"\s+", " ", subtitle or "").strip().strip('"')
    if not new:
        raise ValueError("나레이션이 비어 있습니다.")
    old = sc.get("subtitle") or ""
    sc.setdefault("original_subtitle", old)
    sc["subtitle"] = new
    sc["parse_ok"] = True
    sc["length_warning"] = len(new) > NARRATION_MAX_CHARS
    sc["edited"] = True
    old_scenes_text = plan.get("scenes_text") or ""
    plan["scenes_text"] = render_scenes_md(plan["structured_scenes"])
    plan["prompts_text"] = render_prompts_md(plan["structured_scenes"], plan.get("aspect_ratio") or "16:9")
    if old_scenes_text and old_scenes_text in (plan.get("full_document") or ""):
        plan["full_document"] = plan["full_document"].replace(old_scenes_text, plan["scenes_text"])
    if old and old in (plan.get("full_document") or ""):
        plan["full_document"] = plan["full_document"].replace(old, new)
    return sc


def save_plan(plan):
    path = os.path.join(PLANS_DIR, f"{plan['plan_id']}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(plan, f, ensure_ascii=False, indent=2)
    with open(os.path.join(PLANS_DIR, f"{plan['plan_id']}.md"), "w", encoding="utf-8") as f:
        f.write(plan["full_document"])
    return path


def list_style_guides():
    """data/knowledge/ 및 docs/ 의 문서 목록 (② 스타일 가이드 드롭다운용)."""
    items = []
    # 3대 핵심 쇼츠 스타일 가이드
    for g_name in ("건축쇼츠", "테크쇼츠", "경제쇼츠"):
        p = SHORTS_PROMPT_DOCS.get(g_name)
        if p and os.path.exists(p):
            items.append({"name": g_name, "chars": os.path.getsize(p)})
    for f in sorted(os.listdir(KNOWLEDGE_DIR)):
        if f.lower().endswith((".md", ".txt")):
            path = os.path.join(KNOWLEDGE_DIR, f)
            items.append({"name": f, "chars": os.path.getsize(path)})
    return items


def load_style_guide(name):
    """스타일 가이드 문서 내용. 없으면 None."""
    if not name:
        return None
    # 3대 쇼츠 프롬프트 가이드 매핑
    if name in ("건축쇼츠", "지식쇼츠", "knowledge-shorts", "2. knowledge-shorts-prompts-SKILL.md"):
        p = SHORTS_PROMPT_DOCS["건축쇼츠"]
        if os.path.exists(p):
            with open(p, encoding="utf-8", errors="ignore") as f:
                return f.read()
    elif name in ("테크쇼츠", "tech-shorts", "tech-news-shorts-prompts"):
        p = SHORTS_PROMPT_DOCS["테크쇼츠"]
        if os.path.exists(p):
            with open(p, encoding="utf-8", errors="ignore") as f:
                return f.read()
    elif name in ("경제쇼츠", "biz-shorts", "biz-shorts-prompts"):
        p = SHORTS_PROMPT_DOCS["경제쇼츠"]
        if os.path.exists(p):
            with open(p, encoding="utf-8", errors="ignore") as f:
                return f.read()
    safe = os.path.basename(name)
    path = os.path.join(KNOWLEDGE_DIR, safe)
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8", errors="ignore") as f:
        return f.read()[:3500]


# ── 레퍼런스(벤치마크 영상) 지식 ───────────────────────────────────────

def load_reference_knowledge(reference_id=None):
    """분석해 둔 영상의 리포트·자막 또는 docs 스킬을 레퍼런스로 사용합니다. 없으면 기본 샘플(난지도 영상)."""
    # 3대 쇼츠 대본 공식 매핑
    shorts_key = None
    if reference_id in ("건축쇼츠", "쇼츠 스크립트", "shorts-script"):
        shorts_key = "건축쇼츠"
    elif reference_id in ("테크쇼츠", "tech-shorts"):
        shorts_key = "테크쇼츠"
    elif reference_id in ("경제쇼츠", "biz-shorts"):
        shorts_key = "경제쇼츠"

    if shorts_key:
        doc_path = SHORTS_SCRIPT_DOCS.get(shorts_key)
        skill_text = ""
        if doc_path and os.path.exists(doc_path):
            with open(doc_path, encoding="utf-8", errors="ignore") as f:
                skill_text = f.read()
        knowledge = (
            f"[벤치마크/스킬 규칙: {shorts_key} (100만 조회 쇼츠 대본 공식)]\n\n"
            f"{skill_text}"
        )
        return knowledge, {
            "id": shorts_key,
            "title": shorts_key,
            "channel": "Skill Document",
            "view_count": 1000000,
        }

    for vid in [reference_id, DEFAULT_REFERENCE_ID]:
        if not vid:
            continue
        path = os.path.join(ANALYSES_DIR, f"{vid}.json")
        if not os.path.exists(path):
            continue
        try:
            with open(path, encoding="utf-8") as f:
                d = json.load(f)
        except Exception:
            continue
        if not d.get("ai_ok", True):
            continue
        info = d.get("info") or {}
        views = info.get("view_count") or 0
        knowledge = (
            f"[벤치마크 영상] {info.get('title')} — {info.get('channel')} · 조회수 {views:,}\n\n"
            f"[흥행 분석 리포트 발췌]\n{(d.get('report') or '')[:3500]}\n\n"
            f"[자막 대본 발췌 — 말투·호흡 참고]\n{(d.get('transcript') or '')[:1500]}"
        )
        return knowledge, {"id": vid, "title": info.get("title"), "channel": info.get("channel"), "view_count": views}
    return "(레퍼런스 분석 데이터 없음 — 일반적인 지식 다큐 공식을 적용)", None


# ── 1단계: 제목·설명란 ───────────────────────────────────────────────────

META_SCHEMA = """{
  "titles": [
    {"type": "대비형", "title": "제목 후보", "reason": "선정 이유 한 줄"},
    {"type": "수치형", "title": "제목 후보", "reason": "..."},
    {"type": "선언형", "title": "제목 후보", "reason": "..."}
  ],
  "recommended": {"title": "최종 추천 제목", "reason": "추천 이유"},
  "description": {
    "summary": "시청자 호기심을 끄는 3줄 줄거리(줄바꿈 포함)",
    "insight": "핵심 시사점·전문성 강조 문구",
    "cta": "구독·알림 유도 문구",
    "hashtags": ["#태그1", "#태그2", "#태그3", "#태그4", "#태그5"]
  }
}"""


def step_meta(topic, knowledge):
    prompt = (
        "당신은 유튜브 지식·다큐 콘텐츠 기획자입니다. 아래 벤치마크 영상의 흥행 공식(제목 훅 구조, 전개 방식, 시청자 반응 포인트)을 "
        "새 주제에 적용해 제목과 설명란을 기획해주세요.\n\n"
        f"[벤치마크 분석 데이터]\n{knowledge}\n\n"
        f"[새 영상 주제]\n\"{topic}\"\n\n"
        "제목 후보 3개는 서로 다른 훅 유형(대비형 / 수치형 / 선언형)으로 작성하고, 사실이 아닌 수치를 지어내지 마세요.\n"
        "반드시 아래 형식의 JSON 하나만 출력하세요 (설명 문장 금지):\n" + META_SCHEMA
    )
    data, raw = _llm_json([{"role": "user", "content": prompt}], max_tokens=2000)
    meta = _sanitize_meta(data, topic)
    return meta, prompt, raw


def _sanitize_meta(d, topic):
    d = d if isinstance(d, dict) else {}
    titles = []
    for t in (d.get("titles") or [])[:3]:
        if isinstance(t, dict) and t.get("title"):
            titles.append({"type": str(t.get("type") or "")[:10], "title": str(t["title"])[:80], "reason": str(t.get("reason") or "")[:200]})
    if not titles:
        titles = [{"type": "기본", "title": topic, "reason": "AI 응답을 해석하지 못해 주제를 그대로 사용"}]
    rec = d.get("recommended") if isinstance(d.get("recommended"), dict) else {}
    desc = d.get("description") if isinstance(d.get("description"), dict) else {}
    return {
        "titles": titles,
        "recommended": {"title": str(rec.get("title") or titles[0]["title"])[:80], "reason": str(rec.get("reason") or "")[:300]},
        "description": {
            "summary": str(desc.get("summary") or "")[:600],
            "insight": str(desc.get("insight") or "")[:400],
            "cta": str(desc.get("cta") or "")[:200],
            "hashtags": [("#" + str(h).lstrip("#"))[:20] for h in (desc.get("hashtags") or []) if str(h).strip()][:8],
        },
    }


def render_meta_md(meta):
    lines = ["### 제목 후보"]
    for i, t in enumerate(meta["titles"], 1):
        lines.append(f"{i}. **{t['title']}** _({t['type']})_ — {t['reason']}")
    lines.append(f"\n**✅ 최종 추천:** {meta['recommended']['title']}\n\n{meta['recommended']['reason']}")
    d = meta["description"]
    lines.append("\n### 설명란 (Description)\n")
    lines.append(d["summary"])
    if d["insight"]:
        lines.append("\n" + d["insight"])
    if d["cta"]:
        lines.append("\n" + d["cta"])
    if d["hashtags"]:
        lines.append("\n" + " ".join(d["hashtags"]))
    return "\n".join(lines)


def description_plain(meta):
    d = meta["description"]
    parts = [d["summary"], d["insight"], d["cta"], " ".join(d["hashtags"])]
    return "\n\n".join(p for p in parts if p)


# ── 2단계: 8초 씬 대본 ──────────────────────────────────────────────────

def step_scenes(topic, meta, knowledge, num_scenes, plan, secs=SCENE_SECONDS, reference_id=None):
    """씬이 많으면(>CHUNK_SIZE) 구간을 나눠 여러 번 호출해 이어 붙입니다 (출력 잘림 방지)."""
    lo, hi, _mx = narration_bounds(secs)
    stage_lines = "\n".join(
        f"- 씬 {st['start']}" + (f"~{st['end']}" if st['end'] != st['start'] else "") +
        f" ({_time_range(st['start'], secs).split(' ~ ')[0]} ~ {_time_range(st['end'], secs).split(' ~ ')[1]}): {st['name']} — {st['desc']}"
        for st in plan
    )
    sent_hint = "1~2문장" if secs <= 8 else ("2문장" if secs <= 12 else "2~3문장")
    schema = (
        '{\n  "scenes": [\n'
        f'    {{"scene_num": 1, "stage": "도입", "emotion": "핵심 감정/역할", '
        f'"narration": "{secs}초 안에 읽히는 {sent_hint} ({lo}~{hi}자)", "direction": "자막·연출 의도 한 줄"}}\n'
        "  ]\n}"
    )
    all_scenes, raws, prev_tail = [], [], ""
    shorts_genre = None
    if reference_id in ("건축쇼츠", "쇼츠 스크립트", "shorts-script"):
        shorts_genre = "건축쇼츠"
    elif reference_id in ("테크쇼츠", "tech-shorts"):
        shorts_genre = "테크쇼츠"
    elif reference_id in ("경제쇼츠", "biz-shorts"):
        shorts_genre = "경제쇼츠"

    if shorts_genre == "건축쇼츠":
        shorts_formula = (
            "【100만 조회 건축·인프라 쇼츠 대본 공식 (building-shorts-script) 필수 규칙】\n"
            "1. 오프닝 2단 (문장 형태 엄격 준수, 각 씬 60~65자 완성):\n"
            "   - 씬 1 (오프닝 1단): 반드시 \"여기 [장소]에는 [모순]이 있습니다.\" 형식으로 시작하고 대상을 수식하는 문장을 덧붙여 60자 내외로 채우세요. (예: \"여기 서울 한복판에는 강인데 흐르지 않는 거대한 물길이 있습니다. 도심 한가운데 갇힌 채 멈춰선 미스터리죠.\")\n"
            "   - 씬 2 (오프닝 2단): 반드시 \"[친숙한 묘사] 지금의 [이름]이죠.\" 형식으로 정체를 공개하고 일상 사실을 이어붙이세요. (예: \"매일 수만 명이 오가는 지금의 한강공원입니다. 우리가 당연하게 누리던 일상 뒤엔 충격적인 비밀이 숨겨져 있죠.\")\n"
            "   - 씬 3 (반전 선언): 세 번째 문장에서 충격 반전을 선언하고 구체적 배경을 밝히세요. (예: \"이 물은 저절로 이렇게 된 게 아니라 1986년에 사람이 강제로 가둬서 만든 겁니다. 거대한 수중보가 바닥에 깔려 있죠.\")\n"
            "2. 전개 및 위기:\n"
            "   - 첫 문제는 미끼입니다. 문제를 해결하려다 더 큰 난관에 봉착하고, 반드시 \"진짜 문제는 따로 있었습니다.\" 또는 \"진짜 문제는 [핵심 문제]였습니다.\" 문장으로 판을 뒤집으세요.\n"
            "   - 시청자 대신 질문하기 (핵심 장치): 시청자가 떠올릴 법한 뻔한 해법을 대신 질문하고 즉시 부숩니다. 반드시 \"그럼 [뻔한 해법]하면 되지 않냐고요? [그 순간 벌어지는 일]\" 형태를 1~2회 사용하세요. (예: \"그럼 하구를 아예 막아 버리면 되지 않냐고요? 막는 순간 강물이 갈 곳을 잃고 도심이 침수됩니다.\")\n"
            "   - 감정 삽입구: 위기 최고조 설명 사이에 반드시 \"정말 환장할 노릇이죠.\" 한 줄을 삽입하세요.\n"
            "3. 전환점 및 해법:\n"
            "   - 전환점: 반드시 \"그래서 발상을 뒤집습니다.\" 문장으로 해법을 열고 기상천외한 공법과 구체적 수치를 제시하세요.\n"
            "4. 종결 공식 (별칭 종결):\n"
            "   - 마지막 씬: 반드시 \"[한 줄 별칭] [이름]은 이렇게 탄생한 겁니다.\" 형식으로 끝맺으세요. (예: \"산꼭대기의 거대한 물그릇, 천년의 요새 남한산성은 불가능을 뚫고 이렇게 탄생한 겁니다.\")\n"
            "5. 문장 장치 준수:\n"
            "   - 모든 수치는 일상 사물로 환산 (예: 아파트 10층 높이, 25톤 트럭 368만 대분)\n"
            "   - 사람의 행동 묘사 (\"건설사들은 계산기를 두드려보고 전부 손을 들었습니다\")\n"
            "   - 긴 문장(25~35자) 뒤 3~8자 짧은 문장으로 때리기 (\"유찰이었습니다.\", \"불가능했습니다.\")\n"
        )
    elif shorts_genre == "테크쇼츠":
        shorts_formula = (
            "【100만 조회 테크·AI 뉴스 쇼츠 대본 공식 (tech-shorts-script) 필수 규칙】\n"
            "1. 오프닝 2단 (긴급 속보/기대 부수기 훅, 각 씬 60~65자 완성):\n"
            "   - 씬 1 (오프닝 1단): 반드시 \"지금 [기업/업계]에 제대로 비상이 걸렸습니다.\" (또는 \"지금 [기기명] 사려고 고민 중이시죠?\") 형식으로 시작하세요. (예: \"지금 실리콘밸리에 제대로 비상이 걸렸습니다. AI 생태계가 통째로 뒤흔들리고 있죠.\")\n"
            "   - 씬 2 (오프닝 2단): 반드시 \"[주어]가 방금 [충격적 기술/정책/비밀]을 기습 공개했기 때문입니다.\" (또는 \"절대 그냥 사면 안 되는 이유가 있습니다.\") 형식으로 정체를 밝히세요.\n"
            "   - 씬 3 (충격 수치/격차 투척): 기존 모델 대비 연산 비용 10분의 1, 추론 속도 5배, 7분 만에 스로틀링 등 충격적 실측 팩트를 제시하세요.\n"
            "2. 전개 및 위기:\n"
            "   - 업계 패닉 및 치명적 단점 폭로: 기존 유료 SaaS/스타트업 붕괴 위기 또는 제조사의 성능 락(throttling)과 원가절감을 구체적으로 짚으세요.\n"
            "   - 시청자 반론 차단 (핵심 장치): 반드시 \"그럼 [경쟁사/소비자의 안일한 대처/설정변경]하면 되지 않냐고요? [마주하는 냉혹한 현실/기술격차]\" 형태를 1~2회 사용하세요. (예: \"그럼 경쟁사들도 똑같이 베끼면 되지 않냐고요? 칩셋 확보와 인프라 구축에만 최소 2년, 수조 원이 더 들어갑니다.\")\n"
            "   - 긴장감 삽입구: 설명 사이에 반드시 \"빅테크 전쟁이 진짜 살벌해진 거죠.\" 또는 \"정말 선 넘은 급나누기죠.\" 한 줄을 삽입하세요.\n"
            "3. 전환점 및 진짜 노림수:\n"
            "   - 전환점: 반드시 \"그런데 이들이 노리는 진짜 목적은 따로 있습니다.\" (또는 \"그래서 결론이 뭐냐고요?\") 문장으로 판도를 파헤치세요.\n"
            "4. 종결 공식 (미래 파장/타깃 명확화):\n"
            "   - 마지막 씬: 반드시 \"결국 이번 발표가 바꿀 것은 단순한 기술이 아니라, [우리의 일상/직업/미래 판도]입니다.\" (또는 \"딱 [대상]만 사시면 됩니다.\") 형식으로 종결하세요.\n"
            "5. 문장 장치: 스펙(토큰, 레이턴시, 배터리)을 인간의 노동력/일상 비용으로 환산, IT 전문지식 상투어 금지, 구어체 단문 타격.\n"
        )
    elif shorts_genre == "경제쇼츠":
        shorts_formula = (
            "【100만 조회 경제·비즈니스 쇼츠 대본 공식 (biz-shorts-script) 필수 규칙】\n"
            "1. 오프닝 2단 (돈의 상식 뒤집기 훅, 각 씬 60~65자 완성):\n"
            "   - 씬 1 (오프닝 1단): 반드시 \"우리가 매일 쓰는 [브랜드/제품], 사실 [상식 밖의 모순]이라는 거 알고 계셨나요?\" 형식으로 시작하세요. (예: \"우리가 매일 마시는 스타벅스, 사실 커피를 팔아서 부자가 된 게 아니라는 거 알고 계셨나요?\")\n"
            "   - 씬 2 (오프닝 2단): 반드시 \"[친숙한 설명], 여긴 [제품명]을 파는 회사가 아닙니다.\" 형식으로 충격적 정체를 드러내세요. (예: \"전 세계 노른자위 땅을 장악한 거대한 부동산 은행입니다.\")\n"
            "   - 씬 3 (충격적 금액/적자 투척): 매년 버는 돈보다 이자만 2,000억, 단 하루 만에 시총 150조 증발 등 압도적 수치를 던지세요.\n"
            "2. 전개 및 위기:\n"
            "   - 흑자도산 위기, 뼈아픈 실책, 팔수록 적자인 비즈니스 모순의 본질을 밝히세요.\n"
            "   - 시청자 반론 차단 (핵심 장치): 반드시 \"그럼 [일반인의 뻔한 해법: 가격인상/공장증설]하면 되지 않냐고요? [그 순간 기업이 마주한 잔혹한 현실]\" 형태를 1~2회 사용하세요. (예: \"그럼 물건 가격을 올려서 적자를 메꾸면 되지 않냐고요? 가격을 100원 올리는 순간, 손님들은 1초 만에 경쟁사 앱으로 갈아탑니다.\")\n"
            "   - 감정 삽입구: 설명 사이에 반드시 \"자본주의가 이렇게 냉혹합니다.\" 또는 \"완벽한 돈 낭비였죠.\" 한 줄을 삽입하세요.\n"
            "3. 전환점 및 승부수:\n"
            "   - 전환점: 반드시 \"여기서 회장은 판을 완전히 뒤엎습니다.\" (또는 \"그래서 발상을 거꾸로 뒤집습니다.\") 문장으로 진짜 돈벌이 구조를 여세요.\n"
            "4. 종결 공식 (자본주의 공식 도출):\n"
            "   - 마지막 씬: 반드시 \"결국 [기업/브랜드]이 판 것은 [원래 제품]이 아니라 [진짜 가치/데이터/부동산]이었습니다.\" 형식으로 끝맺으세요.\n"
            "5. 문장 장치: 거액을 일상 지출(강남 아파트, 치킨 값, 람보르기니)로 환산, 이사회/CEO의 행동을 사람의 욕망 동사로 묘사, 구어체 단문 배치.\n"
        )
    else:
        shorts_formula = ""

    for cs in range(1, num_scenes + 1, CHUNK_SIZE):
        ce = min(cs + CHUNK_SIZE - 1, num_scenes)
        part_note = f"이번 요청에서는 **씬 {cs}~{ce}만** 작성하세요 (전체 {num_scenes}씬 중)." if num_scenes > CHUNK_SIZE else ""
        cont = f"\n[바로 앞 씬({cs-1})의 나레이션 — 자연스럽게 이어서]\n\"{prev_tail}\"\n" if prev_tail else ""
        if shorts_genre:
            prompt = (
                f"영상 제목은 \"{meta['recommended']['title']}\"입니다. 이 영상을 **{secs}초 씬 {num_scenes}개**(총 {num_scenes * secs}초)의 100만 조회 {shorts_genre}로 제작합니다.\n"
                f"각 씬 {secs}초 동안 나레이터가 자연스럽게 읽을 한국어 나레이션을 작성해주세요. {part_note}\n\n"
                f"{shorts_formula}\n"
                f"[주제] \"{topic}\"\n\n[구간 배분 계획]\n{stage_lines}\n{cont}\n"
                "규칙:\n"
                f"- scene_num은 {cs}부터 {ce}까지 빠짐없이\n"
                f"- [글자 수 절대 원칙]: 각 씬 나레이션은 {secs}초 동안 오디오 공백 없이 꽉 차게 낭독되도록, 공백 포함 반드시 {lo}~{hi}자 (목표: 약 {(lo + hi) // 2}자)를 엄격히 지키세요. 단문 1개로 55자 미만이 되는 것은 절대 금지이며, 반드시 1~2문장을 결합하거나 구체적 묘사·수치를 덧붙여 {lo}~{hi}자를 채우세요.\n"
                f"- 100만 조회 {shorts_genre} 대본 공식의 오프닝 2단, 충격 투척, 시청자 질문('그럼 ~하면 되지 않냐고요?'), 감정 삽입구, 전환점, 종결 공식을 해당 씬에 반드시 배치하세요.\n"
                "- 앞 씬과 자연스럽게 이어지고, 구체적 수치는 일상 사물이나 체감 비유로 환산하세요.\n\n"
                "반드시 아래 형식의 JSON 하나만 출력하세요:\n" + schema
            )
        else:
            prompt = (
                f"영상 제목은 \"{meta['recommended']['title']}\"입니다. 이 영상을 **{secs}초 씬 {num_scenes}개**(총 {num_scenes * secs}초, 약 {num_scenes * secs // 60}분)로 제작합니다.\n"
                f"각 씬 {secs}초 동안 나레이터가 자연스럽게 읽을 한국어 나레이션을 작성해주세요. {part_note}\n\n"
                f"[벤치마크 영상의 말투·구조 참고]\n{knowledge[:2500]}\n\n"
                f"[주제] \"{topic}\"\n\n[5단계 플롯 배분 — 반드시 이 구간대로]\n{stage_lines}\n{cont}\n"
                "규칙:\n"
                f"- scene_num은 {cs}부터 {ce}까지 빠짐없이\n"
                f"- [글자 수 절대 원칙]: 각 씬 나레이션은 {secs}초 동안 오디오 공백 없이 꽉 차게 낭독되도록, 공백 포함 반드시 {lo}~{hi}자 (목표: 약 {(lo + hi) // 2}자)를 엄격히 지키세요. 단문 1개로 55자 미만이 되는 것은 절대 금지이며, 반드시 1~2문장을 결합하거나 구체적 묘사·수치를 덧붙여 {lo}~{hi}자를 채우세요.\n"
                "- 앞 씬과 자연스럽게 이어지고, 구체적 수치·대비·질문으로 리텐션을 유지\n"
                "- 사실이 아닌 수치를 지어내지 말 것. 불확실하면 '약', '추정'으로 표현\n\n"
                "반드시 아래 형식의 JSON 하나만 출력하세요:\n" + schema
            )
        data, raw = _llm_json([{"role": "user", "content": prompt}], max_tokens=4096)
        raws.append(raw)
        part = _sanitize_scenes(data, ce - cs + 1, plan, offset=cs - 1, secs=secs)
        if part is None:
            part = _legacy_parse_scenes(raw, ce - cs + 1, plan, offset=cs - 1, secs=secs)
        all_scenes += part
        prev_tail = next((s["subtitle"] for s in reversed(part) if s["subtitle"]), prev_tail)
    return all_scenes, "\n\n".join(raws)


def _sanitize_scenes(d, num_scenes, plan, offset=0, secs=SCENE_SECONDS):
    if not isinstance(d, dict):
        return None
    raw_list = d.get("scenes")
    if not isinstance(raw_list, list) or not raw_list:
        return None
    _lo, _hi, mx = narration_bounds(secs)
    by_num = {}
    for idx, item in enumerate(raw_list, 1):
        if not isinstance(item, dict):
            continue
        try:
            n = int(item.get("scene_num") or (idx + offset))
        except Exception:
            n = idx + offset
        by_num[n] = item
    scenes = []
    for i in range(1 + offset, num_scenes + offset + 1):
        item = by_num.get(i) or by_num.get(i - offset) or {}
        narration = re.sub(r"\s+", " ", str(item.get("narration") or item.get("subtitle") or "")).strip().strip('"')
        scenes.append({
            "scene_num": i,
            "time_range": _time_range(i, secs),
            "seconds": secs,
            "stage": str(item.get("stage") or stage_for_scene(plan, i))[:8],
            "emotion": str(item.get("emotion") or "")[:40],
            "subtitle": narration,
            "direction": str(item.get("direction") or "")[:200],
            "parse_ok": bool(narration),
            "length_warning": len(narration) > mx,
        })
    if sum(1 for s in scenes if s["parse_ok"]) == 0:
        return None
    return scenes


def _scene_block(text, i):
    """서술형 응답에서 '씬 N' 또는 'Scene N' 블록을 잘라냅니다."""
    head = r"(?:씬|Scene|SCENE|scene)\s*0?%d(?!\d)"
    m = re.search(rf"{head % i}[^\n]*\n([\s\S]*?)(?={head % (i + 1)}|\Z)", text)
    return m.group(1) if m else ""


def _table_row_cells(text, i):
    """마크다운 표에서 '씬 i' 행의 셀 목록 (없으면 [])."""
    for line in (text or "").splitlines():
        line = line.strip()
        if not line.startswith("|"):
            continue
        cells = [re.sub(r"[*_`]", "", c).strip() for c in line.strip("|").split("|")]
        if cells and re.fullmatch(rf"(?:씬|Scene|SCENE|scene)\s*0?{i}", cells[0].strip()):
            return cells
    return []


def _legacy_parse_scenes(text, num_scenes, plan, offset=0, secs=SCENE_SECONDS):
    scenes = []
    for i in range(1 + offset, num_scenes + offset + 1):
        narration = ""
        cells = _table_row_cells(text, i)
        if cells:
            quoted = [c for c in cells if re.search(r"[\"“].{8,}[\"”]", c)]
            pick = quoted[0] if quoted else max(cells[1:], key=len, default="")
            narration = pick.strip().strip('"“”').strip()
        if not narration:
            body = _scene_block(text or "", i)
            q = re.search(r"[\"“]([^\"”]{8,})[\"”]", body)
            if q:
                narration = q.group(1).strip()
            else:
                for line in body.splitlines():
                    line = re.sub(r"[*_#`|]", "", line).strip()
                    if len(line) > 10 and not line.startswith(("-", ":")):
                        narration = line
                        break
        scenes.append({
            "scene_num": i, "time_range": _time_range(i, secs), "seconds": secs, "stage": stage_for_scene(plan, i), "emotion": "",
            "subtitle": narration, "direction": "", "parse_ok": bool(narration),
            "length_warning": len(narration) > narration_bounds(secs)[2],
        })
    return scenes


def render_scenes_md(scenes):
    lines = ["| 씬 | 시간 | 단계 | 나레이션 | 연출 의도 |", "|---|---|---|---|---|"]
    for s in scenes:
        warn = " ⚠️" if s.get("length_warning") else ""
        lines.append(f"| {s['scene_num']} | {s['time_range']} | {s['stage']} | {s['subtitle'] or '(대본 없음)'}{warn} | {s['direction']} |")
    return "\n".join(lines)


# ── 2.5단계: 나레이션 교정 (오타·맞춤법만, 의미·길이 유지) ────────────────

def step_proofread(scenes):
    """LLM에게 오타·맞춤법·띄어쓰기·어색한 표현만 최소 수정하게 하고, 원문과 너무 달라진 결과는 버립니다."""
    import difflib
    targets = [s for s in scenes if s.get("parse_ok")]
    if not targets:
        return scenes, ""
    targets = targets[:40]
    listing = "\n".join(f'{s["scene_num"]}. "{s["subtitle"]}"' for s in targets)
    prompt = (
        "다음은 유튜브 나레이션 대본입니다. 각 문장의 **오타, 맞춤법, 띄어쓰기, 명백히 어색하거나 말이 안 되는 단어**만 최소한으로 고쳐주세요.\n"
        "규칙: 의미·문체·길이(±5자)를 유지하고, 문장을 새로 쓰지 말 것. 고칠 것이 없으면 원문 그대로 반환.\n\n"
        f"{listing}\n\n"
        "반드시 아래 형식의 JSON 하나만 출력하세요:\n"
        '{"scenes": [{"scene_num": 1, "narration": "교정된 문장"}]}'
    )
    try:
        data, raw = llm_client.call_llm_json([{"role": "user", "content": prompt}], max_tokens=2500, temperature=0.2)
    except Exception as e:
        print(f"  ⚠️ 교정 단계 건너뜀: {e}")
        return scenes, ""
    fixed = {}
    for item in (data or {}).get("scenes", []) if isinstance(data, dict) else []:
        if isinstance(item, dict) and item.get("narration"):
            try:
                fixed[int(item.get("scene_num"))] = re.sub(r"\s+", " ", str(item["narration"])).strip().strip('"')
            except Exception:
                pass
    changed = 0
    for s in scenes:
        new = fixed.get(s["scene_num"])
        if not new or new == s["subtitle"]:
            continue
        ratio = difflib.SequenceMatcher(None, s["subtitle"], new).ratio()
        if ratio >= 0.6 and abs(len(new) - len(s["subtitle"])) <= 12:
            s["original_subtitle"] = s["subtitle"]
            s["subtitle"] = new
            s["proofread"] = True
            s["length_warning"] = len(new) > NARRATION_MAX_CHARS
            changed += 1
    print(f"  ✓ 나레이션 교정: {changed}개 문장 수정")
    return scenes, raw or ""


# ── 3단계: AI 영상 프롬프트 ─────────────────────────────────────────────

def _resolve_shorts_style_genre(style_guide):
    if not style_guide:
        return None
    if style_guide in ("건축쇼츠", "지식쇼츠", "knowledge-shorts", "2. knowledge-shorts-prompts-SKILL.md"):
        return "건축쇼츠"
    elif style_guide in ("테크쇼츠", "tech-shorts", "tech-news-shorts-prompts"):
        return "테크쇼츠"
    elif style_guide in ("경제쇼츠", "biz-shorts", "biz-shorts-prompts"):
        return "경제쇼츠"
    return None


def step_video_prompts(topic, scenes, aspect_ratio, style_guide=None):
    genre = _resolve_shorts_style_genre(style_guide)
    # 쇼츠 스타일 가이드(건축/테크/경제)는 프롬프트 상세 블록이 방대하므로 1씬 단위로 분할 호출하여 4096 토큰 잘림 및 문법 에러 원천 차단
    chunk_sz = 1 if genre else CHUNK_SIZE
    if len(scenes) > chunk_sz:
        raws = []
        for cs in range(0, len(scenes), chunk_sz):
            _, raw = _step_video_prompts_chunk(topic, scenes[cs:cs + chunk_sz], aspect_ratio, style_guide=style_guide)
            raws.append(raw)
        return scenes, "\n\n".join(raws)
    return _step_video_prompts_chunk(topic, scenes, aspect_ratio, style_guide=style_guide)


def _step_video_prompts_chunk(topic, scenes, aspect_ratio, style_guide=None):
    genre = _resolve_shorts_style_genre(style_guide)
    if genre:
        return _step_video_prompts_shorts_director_chunk(topic, scenes, aspect_ratio, genre=genre)

    scene_text = "\n".join(f"- Scene {s['scene_num']} [{s['stage']}]: \"{s['subtitle']}\"" for s in scenes)
    ar_guide = ("vertical 9:16 composition, subject centered on the vertical axis, leave headroom for on-screen captions"
                if aspect_ratio == "9:16" else "wide 16:9 cinematic composition")
    schema = (
        '{\n  "scenes": [\n'
        '    {"scene_num": 1, "visual_prompt": "English, 40-70 words, photorealistic cinematic documentary description of what is on screen", '
        '"camera": "camera movement & angle (English)", "lighting": "lighting & atmosphere (English)", '
        '"sfx": "physical sound effects & ambience only (English)", "guide_ko": "한국어 비주얼·효과음 연출 가이드 한 줄"}\n'
        "  ]\n}"
    )
    prompt = (
        f"주제 \"{topic}\"의 8초 씬 {len(scenes)}개에 대해, AI 비디오 생성 툴(Runway Gen-3, Kling, Luma, Sora)에 바로 붙여넣을 영문 프롬프트를 작성해주세요.\n\n"
        f"[씬별 나레이션]\n{scene_text}\n\n"
        f"[화면 비율] {aspect_ratio} — {ar_guide}\n\n"
        "규칙:\n"
        "- visual_prompt는 나레이션 내용을 시각화하되 텍스트·자막·로고는 화면에 넣지 말 것 (no on-screen text)\n"
        "- 인물이 나오면 말하지 않는 모습으로 (silent characters, closed mouths, no talking heads)\n"
        "- sfx에는 사람 목소리·대사·음악·BGM을 절대 포함하지 말고 현장 효과음·앰비언스만 기술\n"
        f"- scene_num은 {scenes[0]['scene_num']}부터 {scenes[-1]['scene_num']}까지 빠짐없이\n\n"
        "반드시 아래 형식의 JSON 하나만 출력하세요:\n" + schema
    )
    data, raw = _llm_json([{"role": "user", "content": prompt}], max_tokens=4096)
    by_num = {}
    if isinstance(data, dict) and isinstance(data.get("scenes"), list):
        items = [it for it in data["scenes"] if isinstance(it, dict)]
        for idx, item in enumerate(items, 1):
            try:
                by_num[int(item.get("scene_num") or idx)] = item
            except Exception:
                by_num[idx] = item
        expected = [s["scene_num"] for s in scenes]
        if not any(n in by_num for n in expected) and len(items) >= len(expected) * 0.5:
            by_num = {expected[i]: items[i] for i in range(min(len(expected), len(items)))}
    if not by_num:
        by_num = _legacy_parse_prompts(raw, len(scenes))
    for s in scenes:
        item = by_num.get(s["scene_num"]) or {}
        _apply_prompt(s, item, topic, aspect_ratio)
    return scenes, raw


def _step_video_prompts_shorts_director_chunk(topic, scenes, aspect_ratio, genre="건축쇼츠"):
    """docs/{genre}-shorts-prompt.md 규칙에 따른 완성형 T2V 프롬프트 조립 디렉터."""
    target_num = scenes[0]["scene_num"] if scenes else 1
    target_secs = scenes[0].get("seconds", 8) if scenes else 8
    scene_text = "\n".join(f"- Scene {s['scene_num']} [{s['stage']}]: \"{s['subtitle']}\"" for s in scenes)
    ar_str = "9:16 vertical" if aspect_ratio == "9:16" else f"{aspect_ratio} wide"

    if genre == "테크쇼츠":
        role_title = "테크·AI 뉴스 쇼츠 T2V 프롬프트 디렉터 (v2.2-tech)"
        look_rules = (
            "   - LOOK A: photoreal futuristic commercial tech cinematography, sleek keynote lighting or glowing ultramodern workstation, crisp OLED screen reflections, hyper-detailed glass and metal\n"
            "   - LOOK B: untextured matte dark grey clay render, featureless stylized white figures in front of glowing monitors, stark rim light, no color anywhere except the red graphics\n"
            "   - LOOK C: clean isometric technical pipeline, minimalist 3D modular servers, glass datacenter aesthetics, matte materials, high precision\n"
            "   - LOOK D: pure black background, luminous red and electric white neural network nodes, laser-thin glowing data streams, extreme high contrast"
        )
        red_graphics_guide = (
            "   - 1~2개 요소: sharp red label box with white Korean text 「10배 가속」 via draw-on, "
            "red horizontal timeline bracket measuring 0.1s latency, huge bold red Korean text 「비상」, "
            "large red X stroked over deprecated tool, red target ring closing on the chip\n"
            "   - 마지막에 항상 'All Korean text and technical indicators are bold clean sans-serif, crisp and fully legible.' 포함"
        )
        subject_example = f"High-tech developer workstation and glowing enterprise datacenter illustrating {topic}, illuminated server rack LEDs, ultra-detailed glass and brushed aluminum tech hardware, cascading streaming code terminal on vertical OLED display."
        exclusions_extra = "no distorted fingers or extra fingers on keyboards, no fake watermark,"
        audio_example = "Mechanical keyboard typing clatter, deep server cooling fan drone, digital processing hum, electronic confirmation beeps."
    elif genre == "경제쇼츠":
        role_title = "경제·비즈니스 쇼츠 T2V 프롬프트 디렉터 (v2.2-biz)"
        look_rules = (
            "   - LOOK A: photoreal commercial cinematography, sharp corporate daylight or moody boardroom lighting, hyper-realistic textures, clean high-end aesthetic\n"
            "   - LOOK B: untextured matte grey clay render, featureless white mannequin figures in business suits with no faces, soft studio rim light, no color anywhere except the red graphics\n"
            "   - LOOK C: clean isometric 3D motion graphic, minimalist vector style, matte pastel materials, plain pale background\n"
            "   - LOOK D: pure black background, luminous red and white vector lines, high-contrast financial data flow"
        )
        red_graphics_guide = (
            "   - 1~2개 요소: sharp red rectangular label box with white Korean text 「적자 1,200억」 via draw-on, "
            "thick bold red arrow plunging down vertically at a steep angle with percentage drop indicator, "
            "vertical red distance bracket measuring price gap with 「+500원」 text, huge bold red text 「부도」, large red X mark\n"
            "   - 마지막에 항상 'All Korean text and monetary symbols are bold clean sans-serif, crisp and fully legible.' 포함"
        )
        subject_example = f"Corporate business headquarters and retail transaction counter illustrating {topic}, piles of financial documents, stacks of currency banknotes, high-contrast stock market digital displays, mannequin figures in sharp business suits."
        exclusions_extra = "no distorted fingers or hands, no fake watermark,"
        audio_example = "POS register chime, boardroom ambient murmurs, currency counting machine flutter, financial alert warning tone."
    else:  # 건축쇼츠
        role_title = "건축·지식 쇼츠 T2V 프롬프트 디렉터 (v2.1)"
        look_rules = (
            "   - LOOK A: photoreal aerial drone cinematography, hazy natural daylight, muted colors\n"
            "   - LOOK B: untextured matte grey clay render, featureless white mannequin figures with no faces, soft even studio light, no color anywhere except the red graphics\n"
            "   - LOOK C: clean technical cutaway, isometric, matte materials, plain pale background\n"
            "   - LOOK D: pure black background, thin luminous white lines, high contrast (눈에 보이지 않는 힘/압력 전용)"
        )
        red_graphics_guide = (
            "   - 1~2개 요소: red label box with white Korean text 「핵심 구조」 via draw-on, red dimension line, "
            "long red arrow with distance bracket\n"
            "   - 마지막에 항상 'All Korean text is bold clean sans-serif, crisp and fully legible.' 포함"
        )
        subject_example = f"Detailed architectural scale model diorama illustrating {topic}, matte grey concrete textures, layered geological cutaway strata, miniature faceless white mannequin figures in protective suits."
        exclusions_extra = "no film grain, no vignette, no distorted structures,"
        audio_example = "Deep mechanical ventilation hum, hydraulic valve hiss, electronic clicks."

    prompt = (
        f"당신은 {role_title}입니다. docs/{genre} 가이드 규칙에 따라, "
        f"주제 \"{topic}\"의 {target_secs}초 씬 {len(scenes)}개에 대해 AI 비디오 생성기(Kling, Runway Gen-3, Sora, Luma)에 "
        "각 씬마다 독립적으로 바로 붙여넣을 수 있는 완성형 영문 프롬프트(prompt_en)를 작성해주세요.\n\n"
        f"[씬별 나레이션 대본]\n{scene_text}\n\n"
        f"【docs/{genre} T2V 절대 규칙 (반드시 준수)】\n"
        "1. SUBJECT 전문 매 씬 반복 (최종 산출물에서도 예외 없음):\n"
        "   - 각 씬의 prompt_en 코드블럭 안에 구체적인 명사로 작성된 대상 서술 전문을 통째로 다시 쓰세요.\n"
        "   - '위와 동일', '동일 대상', '[반복]' 같은 참조/생략 표현은 절대 금지입니다.\n"
        "2. 자막·캡션 절대 생성 금지 (EXCLUSIONS 필수):\n"
        "   - FORMAT 줄에 반드시 'Keep the bottom 18% of frame visually clear for subtitles added later.' 포함\n"
        "   - EXCLUSIONS에 반드시 'no subtitles, no caption bar, no bottom text overlay, no burned-in captions, no karaoke-style word-by-word timing' 포함\n"
        f"3. {target_secs}.0초 전체 사용 (정지 구간 없음):\n"
        "   - 기본 3샷 (0.0s–2.5s / 2.5s–5.0s / 5.0s–8.0s) 또는 2샷 (0.0s–4.0s / 4.0s–8.0s)으로 분할\n"
        "   - 각 샷에 하나의 명확한 사건(동사 하나)을 배정\n"
        f"   - 마지막 샷 끝에 반드시: 'Continue meaningful motion through the final second; do not begin a new action after {target_secs - 0.3:.1f}s. The final visual statement lands precisely at {target_secs}.0s.' 포함\n"
        "4. LOOK 로테이션 (하드 컷 기준 변경):\n"
        f"{look_rules}\n"
        "5. RED GRAPHICS (순수 빨강 벡터 스트로크, pure saturated red):\n"
        f"{red_graphics_guide}\n"
        "6. CONTINUITY: 피사체 형태·재질·색상 동일성 선언 및 불필요 왜곡 금지\n"
        f"7. AUDIO: 각 샷의 사실적인 환경음과 사건 효과음 ({audio_example}) (no speech, no music)\n\n"
        "【각 씬 prompt_en 완성형 블록 예시】\n"
        f"FORMAT: {target_secs} seconds, {ar_str}, 24 fps, one continuous generation containing 3 shots joined by clean hard cuts. Use the full {target_secs}.0 seconds with continuous meaningful visual action — no static hold, no dead time, no unused ending. Keep the bottom 18% of frame visually clear for subtitles added later.\n\n"
        "CLIP STRUCTURE: A compact visual story. Each shot contains exactly one principal event and one clearly directed camera move. Every event begins immediately at the start of its assigned shot and reaches a visually complete state before the next hard cut.\n\n"
        f"SUBJECT: {subject_example}\n\n"
        "SHOT ONE (0.0s–2.5s):\n"
        "LOOK: [LOOK A/B/C/D 중 1개]\n"
        "Event: First principal event developing clearly.\n"
        "Camera: Slow push-in, keeping the target centered.\n"
        "The event reaches a complete visual state by 2.5s.\n\n"
        "SHOT TWO (2.5s–5.0s): Hard cut.\n"
        "LOOK: [직전과 다른 LOOK A/B/C/D 중 1개]\n"
        "Event: Second principal event unfolding.\n"
        "Camera: Downward tracking or dynamic sweep move.\n"
        "The event reaches a complete visual state by 5.0s.\n\n"
        "SHOT THREE (5.0s–8.0s): Hard cut.\n"
        "LOOK: [LOOK A/B/C/D 중 1개]\n"
        "Event: Final concluding event landing decisively.\n"
        f"Camera: Smooth push-in. Continue meaningful motion through the final second; do not begin a new action after {target_secs - 0.3:.1f}s. The final visual statement lands precisely at {target_secs}.0s.\n\n"
        "RED GRAPHICS (sharp vector-like strokes, pure saturated red):\n"
        "  - SHOT 2, 3.2s: red label graphic appears via draw-on\n"
        "  All Korean text and symbols are bold clean sans-serif, crisp and fully legible.\n\n"
        "MOTION GRAPHICS: none\n\n"
        "CONTINUITY: Consistent visual identity and scale across shots. Hard cuts change scale and look; no duplicated props or spontaneous morphing within a single shot.\n\n"
        f"EXCLUSIONS: no subtitles, no caption bar, no bottom text overlay, no burned-in captions, no karaoke-style word-by-word timing, no logos, no watermark, {exclusions_extra} no duplicated objects, no recognisable celebrity faces, no corrupted Korean text, no dissolve, no morph, no empty ending, no static hold, no background music, no speech or generated narration.\n\n"
        f"AUDIO: {audio_example}. Audio changes sharply with each hard cut and contains no speech or music.\n\n"
        "규칙: 각 씬의 prompt_en 필드에 위 전체 조립 블록을 줄바꿈(\\n)을 포함한 완전한 단일 문자열로 작성하세요.\n"
        "반드시 아래 JSON 형식 하나만 출력하세요:\n"
        '{\n  "scenes": [\n'
        '    {\n'
        f'      "scene_num": {target_num},\n'
        '      "prompt_en": "FORMAT: ...",\n'
        '      "visual_prompt": "SUBJECT and shot summary (English, 40-70 words)",\n'
        '      "camera": "Camera movements (English)",\n'
        '      "lighting": "Lighting description (English)",\n'
        '      "sfx": "Audio sound effects & ambience only (English)",\n'
        '      "guide_ko": "한국어 비주얼·효과음 연출 가이드 한 줄"\n'
        '    }\n'
        '  ]\n}'
    )
    data, raw = _llm_json([{"role": "user", "content": prompt}], max_tokens=4096)
    by_num = {}
    if isinstance(data, dict) and isinstance(data.get("scenes"), list):
        items = [it for it in data["scenes"] if isinstance(it, dict)]
        for idx, item in enumerate(items, 1):
            try:
                by_num[int(item.get("scene_num") or idx)] = item
            except Exception:
                by_num[idx] = item
        expected = [s["scene_num"] for s in scenes]
        if len(scenes) == 1 and items:
            by_num = {scenes[0]["scene_num"]: items[0]}
        elif not any(n in by_num for n in expected) and len(items) >= len(expected) * 0.5:
            by_num = {expected[i]: items[i] for i in range(min(len(expected), len(items)))}

    for s in scenes:
        item = by_num.get(s["scene_num"]) or {}
        if item.get("prompt_en") and len(str(item["prompt_en"])) > 100:
            prompt_en = str(item["prompt_en"]).strip()
            visual = str(item.get("visual_prompt") or f"{topic} {genre} scene {s['scene_num']}").strip()
            camera = str(item.get("camera") or "Smooth cinematic tracking").strip()
            lighting = str(item.get("lighting") or "Soft studio light").strip()
            sfx = _strip_audio_negations(str(item.get("sfx") or "")) or "ambient mechanical hum"
            guide = str(item.get("guide_ko") or "").strip()
            s.update({
                "visual_prompt": visual, "camera": camera, "lighting": lighting, "sfx": sfx, "guide_ko": guide,
                "prompt_en": prompt_en, "prompt_ok": True,
            })
        else:
            _apply_prompt(s, item, topic, aspect_ratio)
    return scenes, raw


def _legacy_parse_prompts(text, num_scenes):
    out = {}
    for i in range(1, num_scenes + 1):
        body = _scene_block(text or "", i)
        if not body:
            continue

        def grab(pattern):
            m = re.search(rf"(?:{pattern})[^:\n|]*[:|]\s*\**\s*([^\n|]+)", body, re.IGNORECASE)
            return m.group(1).replace("*", "").strip(" \"'") if m else ""

        out[i] = {
            "visual_prompt": grab(r"Scene Prompt|Visual|Prompt|프롬프트"),
            "camera": grab(r"Camera|카메라"),
            "lighting": grab(r"Lighting|조명"),
            "sfx": grab(r"Sound Effects|Sound|SFX|효과음|사운드"),
            "guide_ko": grab(r"가이드|Guide"),
        }
    return out


def _strip_audio_negations(text):
    return re.sub(r"(?:absolutely\s+)?(?:zero|no)\s+(?:human\s+)?(?:voice|vocal|speech|talking|dialogue|singing|whispering|narration|bgm|music|soundtrack)[^.;,]*[.;,]?",
                  "", text or "", flags=re.IGNORECASE).strip(" .,;")


def _apply_prompt(s, item, topic, aspect_ratio):
    visual = re.sub(r"\s+", " ", str(item.get("visual_prompt") or "")).strip(" \"'")
    visual = re.sub(r"\[Audio:[^\]]*\]", "", visual, flags=re.IGNORECASE).strip(" .")
    camera = str(item.get("camera") or "").strip(" \"'") or "Slow cinematic push-in"
    lighting = str(item.get("lighting") or "").strip(" \"'")
    sfx = _strip_audio_negations(str(item.get("sfx") or "")) or "ambient environmental sound, low-frequency room tone"
    guide = str(item.get("guide_ko") or "").strip()
    prompt_ok = bool(visual)
    if not visual:
        visual = (f"Photorealistic cinematic documentary shot illustrating: {s['subtitle'] or topic}. "
                  "Hyper-detailed, 8k, dramatic realism, no on-screen text")
    ar_clause = "vertical 9:16 framing" if aspect_ratio == "9:16" else "wide 16:9 framing"
    full = (
        f"{visual}. {ar_clause}. Camera: {camera}."
        + (f" Lighting: {lighting}." if lighting else "")
        + f" Audio: {sfx}. (SFX and ambience only — no voice, no speech, no dialogue, no music, no BGM, no on-screen text)"
        + f" --ar {aspect_ratio} --no voice, speech, dialogue, singing, music, bgm, text, watermark"
    )
    s.update({
        "visual_prompt": visual, "camera": camera, "lighting": lighting, "sfx": sfx, "guide_ko": guide,
        "prompt_en": full, "prompt_ok": prompt_ok,
    })


def render_prompts_md(scenes, aspect_ratio):
    lines = [f"> 화면 비율 `{aspect_ratio}` · 오디오는 효과음만(보이스·BGM 없음)\n"]
    for s in scenes:
        lines.append(f"#### 씬 {s['scene_num']} ({s['time_range']}) — {s['stage']}")
        lines.append(f"- 나레이션: \"{s['subtitle']}\"")
        lines.append(f"- **Prompt**: {s['prompt_en']}")
        if s.get("guide_ko"):
            lines.append(f"- 연출 가이드: {s['guide_ko']}")
        lines.append("")
    return "\n".join(lines)


# ── 4단계: 나노바나나 레드라인 이미지 프롬프트 ──────────────────────────

def step_redline(topic, scenes, aspect_ratio, guide_text=None):
    if len(scenes) > CHUNK_SIZE:
        thumbnail, raws = None, []
        for ci, cs in enumerate(range(0, len(scenes), CHUNK_SIZE)):
            th, raw = _step_redline_chunk(topic, scenes[cs:cs + CHUNK_SIZE], aspect_ratio, guide_text, want_thumbnail=(ci == 0))
            if ci == 0:
                thumbnail = th
            raws.append(raw)
        return thumbnail, "\n\n".join(raws)
    return _step_redline_chunk(topic, scenes, aspect_ratio, guide_text, want_thumbnail=True)


def _step_redline_chunk(topic, scenes, aspect_ratio, guide_text=None, want_thumbnail=True):
    scene_text = "\n".join(f"- 씬 {s['scene_num']}: \"{s['subtitle'] or topic}\"" for s in scenes)
    schema = """{
  "thumbnail": {
    "scene": {
      "subject": "흙과 암반 지층 단면이 층층이 노출된 3D 컷어웨이 정육면체 디오라마 큐브. 지하 벙커 콘크리트 시설 내부의 제어 콘솔과 랙 캐비닛, 배관, 작업 중인 흰색 마네킹 피규어들",
      "view": "isometric 45° cutaway cross-section 3D diorama cube",
      "materials": "monochrome matte grey concrete and clay scale model with exposed geological strata layers",
      "redline_visuals": "큐브 외곽 모서리를 감싸는 입체 빨간색 치수선과 화살표, 룸 바닥 경계의 얇은 빨간 라인, 설비로 이어지는 빨간 점선 리더선과 원형 도트"
    },
    "annotation_layer": [
      {"type": "dimension_line", "style": "red 3D bounding dimension lines with corner arrowheads", "position": "cube vertical and top edges", "value": "Depth: 50 Floors"},
      {"type": "leader_line", "style": "thin red dotted line with endpoint circular dot", "target": "지하 통제실", "label": "핵심 콘크리트 통제실", "sub_label": "Facility exists"},
      {"type": "accent_outline", "style": "thin red wireframe edge accent", "target": "룸 바닥 및 모서리 프레임"}
    ],
    "text_layer": [
      {"text": "지하 50층 비밀", "position": "top", "font": "extra bold Korean gothic with subtle dark drop shadow", "color": "white", "size": "huge headline"}
    ]
  },
  "scenes": [
    {
      "scene_num": 1,
      "scene": {
        "subject": "흙과 암반 지층 단면이 사각 큐브 형태로 잘려진 3D 지중 컷어웨이 디오라마. 지하 콘크리트 벙커 통제실 내부에 계측 콘솔, 배전반 캐비닛, 배관 및 작업 중인 얼굴 없는 흰색 마네킹 피규어들",
        "view": "isometric 45° cutaway cross-section 3D diorama cube",
        "materials": "matte grey concrete and clay model with exposed soil rock strata",
        "redline_visuals": "정육면체 디오라마 외곽을 감싸는 입체 빨간색 치수선, 바닥 모서리를 따르는 얇은 빨간 라인, 벙커를 지시하는 빨간 점선 리더선"
      },
      "annotation_layer": [
        {"type": "dimension_line", "style": "red 3D bounding dimension lines with corner arrowheads", "position": "cube vertical and top edges", "value": "Depth: 50 Floors"},
        {"type": "leader_line", "style": "thin red dotted line with endpoint circular dot", "target": "벙커 통제실", "label": "핵심 콘크리트 통제실", "sub_label": "Facility exists"},
        {"type": "accent_outline", "style": "thin red floor edge wireframe line", "target": "지하 룸 바닥 경계선 및 모서리 프레임"}
      ],
      "text_layer": [
        {"text": "지하 50층 비밀", "position": "top", "font": "extra bold Korean gothic with subtle dark drop shadow", "color": "white", "size": "huge headline"}
      ]
    },
    {
      "scene_num": 2,
      "scene": {
        "subject": "거대한 지하 설비 복합체 및 고압 배관의 3D 컷어웨이 건축 스케일 모형 디오라마. 배관 밸브, 콘크리트 벽면, 통로 브릿지와 작업 중인 흰색 마네킹 피규어들",
        "view": "isometric 45° cutaway cross-section 3D diorama cube",
        "materials": "monochrome matte grey and concrete industrial scale model with exposed geological rock strata",
        "redline_visuals": "거대 파이프라인을 가로지르는 양끝 화살표 빨간 치수선과 주요 밸브 설비를 가리키는 얇은 빨간 인출선들"
      },
      "annotation_layer": [
        {"type": "dimension_line", "style": "horizontal red dimension line with dual arrowheads", "position": "across central massive pipeline", "value": "Scale beyond imagination"},
        {"type": "leader_line", "style": "thin red dotted leader line with circular dot", "target": "고압 배관 및 밸브 설비", "label": "극한의 압력과"},
        {"type": "accent_outline", "style": "thin red wireframe line", "target": "하부 룸 프레임 및 바닥 그리드"}
      ],
      "text_layer": [
        {"text": "극한의 압력과", "position": "top", "font": "extra bold Korean gothic with clean outline", "color": "dark charcoal", "size": "huge headline"}
      ]
    }
  ]
}"""
    guide_block = f"\n[스타일 가이드 문서 — 아래 원칙을 최우선 적용]\n{guide_text}\n" if guide_text else ""
    prompt = (
        "당신은 '레드라인 공학 주석 3D 디오라마' 스타일 전문 이미지 프롬프트 디자이너입니다.\n"
        "주제와 씬별 나레이션을 바탕으로 썸네일과 각 씬의 첫 프레임 이미지 프롬프트(JSON)를 설계해주세요.\n\n"
        f"[주제] \"{topic}\"\n[종횡비] {aspect_ratio} — {ASPECT_GUIDE.get(aspect_ratio, '')}\n[씬별 나레이션]\n{scene_text}\n{guide_block}\n"
        "★★ docs/레드라인.md 및 첨부 이미지 기반 헤더 타이틀 & 공학 주석 필수 규칙 ★★\n"
        "1. 텍스트 레이어 (text_layer) — ★가장 중요★:\n"
        "   - 영상 하단 자막과의 충돌을 피해 반드시 화면 상단(position: 'top')에 단 하나의 메인 헤더를 배치!\n"
        "   - 첨부 이미지의 '지하 50층 비밀', '극한의 압력과', '빅 시스템', '안전 뒤의 위험'처럼 각 씬 나레이션의 핵심을 찌르는 대형 볼드 고딕 헤더 타이틀을 2~4단어 (7~12자 내외의 완전한 한국어 문구)로 지정하세요.\n"
        "   - 절대 긴 문장을 쓰지 말고, 단어 중간이 잘리지 않는 완성된 형태의 핵심 타이틀 문구여야 합니다!\n"
        "   - font: 'extra bold Korean gothic with subtle dark drop shadow / clean outline', size: 'huge headline', color: 'white' 또는 'dark charcoal'\n"
        "2. 빨간 공학 주석 레이어 (annotation_layer): 모든 선은 얇고 선명한 단일 빨간색(#FF0000)!\n"
        "   - dimension_line: 디오라마 큐브 외곽이나 파이프를 가로지르는 3D 치수선과 양끝 화살표. 수치는 AI가 지어내지 말고 구체적 값 명시 (예: 'Depth: 50 Floors', 'Scale beyond imagination', '수심 55m' 등)\n"
        "   - leader_line: 끝점에 빨간 원형 도트(circular dot)가 있는 얇은 빨간 점선 리더선. 대상 설비를 가리키며 '핵심 콘크리트 통제실'(보조 라벨: 'Facility exists') 또는 '극한의 압력과' 등 구체적 명칭 지정\n"
        "   - accent_outline: 룸 바닥 모서리나 구조물 모서리를 따르는 얇은 빨간색 와이어프레임 액센트 선\n"
        "3. 장면 묘사(scene.subject): 단순한 추상적 개념이 아니라, 반드시 '첨부 스타일의 구체적 3D 건축 스케일 모형/미니어처 디오라마'로 서술할 것!\n"
        "   - 유형 A (단면 디오라마 큐브): 지표면 아래 거친 흙과 암반 지층 단면(soil and rock strata)이 정육면체 큐브로 노출되고, 지하 콘크리트 벙커 룸(통제실, 기계실, 랙 장비, 파이프)과 흰색 마네킹 피규어들이 있는 모형\n"
        "   - 유형 B (거대 설비 건축 모형): 공중/부감에서 내려다본 거대 파이프라인, 원통 탱크, 타워, 브릿지 통로와 흰색 마네킹 피규어들이 있는 모노크롬 건축 모형\n"
        f"4. scenes는 씬 {scenes[0]['scene_num']}부터 {scenes[-1]['scene_num']}까지 빠짐없이 작성할 것" + ("" if want_thumbnail else " (thumbnail은 생략 가능)") + "\n\n"
        "반드시 아래 형식의 유효한 JSON 하나만 출력하세요:\n" + schema
    )
    data, raw = _llm_json([{"role": "user", "content": prompt}], max_tokens=4096)
    parsed = data if isinstance(data, dict) else {}

    thumb_hl = extract_redline_headline(scenes[0]["subtitle"] if scenes else "", topic, 1)
    thumbnail = sanitize_redline_block(
        parsed.get("thumbnail"), aspect_ratio, is_thumbnail=True,
        default_subject=f"흙과 암반 지층 단면이 층층이 노출된 정육면체 3D 컷어웨이 디오라마 큐브. 지하 콘크리트 벙커 시설과 {topic}의 핵심 제어 장비, 흰색 마네킹 피규어들",
        default_label="핵심 콘크리트 통제실", default_text=thumb_hl,
    )
    raw_map = {}
    for item in (parsed.get("scenes") or []) if isinstance(parsed.get("scenes"), list) else []:
        if isinstance(item, dict) and "scene_num" in item:
            try:
                raw_map[int(item["scene_num"])] = item
            except Exception:
                pass
    for s in scenes:
        default_hl = extract_redline_headline(s["subtitle"], topic, s["scene_num"])
        block = sanitize_redline_block(
            raw_map.get(s["scene_num"]), aspect_ratio, is_thumbnail=False,
            default_subject=f"지하 구조와 {s['subtitle'] or topic}의 핵심 설비를 보여주는 정육면체 3D 컷어웨이 디오라마 큐브 모형. 지층 암반 단면과 내부 콘크리트 통제실, 배관, 흰색 마네킹 피규어들",
            default_label="핵심 콘크리트 통제실" if s["scene_num"] == 1 else "Facility exists",
            default_text=default_hl,
        )
        s["image_prompt_json"] = block
        s["image_prompt_raw"] = json.dumps(block, ensure_ascii=False, indent=2)
        s["image_prompt_ok"] = s["scene_num"] in raw_map
    return thumbnail, raw


def sanitize_redline_block(raw_block, aspect_ratio="16:9", is_thumbnail=False, default_subject="", default_label="", default_text=""):
    """
    format/style/constraints는 코드에서 고정 주입,
    scene/annotation/text는 첨부 이미지 기반의 정밀한 레드라인 디오라마 스펙으로 검증·보강.
    """
    default_sub = default_subject or "흙과 암반 단면이 노출된 정육면체 3D 컷어웨이 디오라마 큐브 모형. 내부 콘크리트 룸과 제어 콘솔, 흰색 마네킹 피규어들"
    scene_block = {
        "subject": default_sub,
        "view": "isometric 45° cutaway cross-section 3D diorama cube",
        "materials": "monochrome matte grey concrete and clay architectural model with exposed geological rock strata",
        "redline_visuals": "정육면체 디오라마 외곽을 감싸는 입체 빨간색 치수선과 화살표, 룸 바닥 경계의 얇은 빨간 라인, 설비로 이어지는 빨간 점선 리더선과 원형 도트"
    }

    if isinstance(raw_block, dict) and isinstance(raw_block.get("scene"), dict):
        rs = raw_block["scene"]
        sub = str(rs.get("subject") or "").strip()
        if sub:
            # 추상적 단문일 경우 디오라마 건축 모형 시각 묘사 보강
            if len(sub) < 35 or not any(k in sub for k in ["디오라마", "모형", "큐브", "단면", "컷어웨이", "diorama", "cutaway", "model"]):
                sub = f"흙과 암반 지층 단면이 층층이 노출된 정육면체 3D 컷어웨이 디오라마 큐브. 내부 콘크리트 구조물에 {sub} 관련 제어 콘솔과 배관 설비, 작업 중인 얼굴 없는 흰색 마네킹 피규어들이 배치됨"
            scene_block["subject"] = sub[:400]
        if rs.get("view"):
            v = str(rs["view"]).strip()
            if "cutaway" in v.lower() or "isometric" in v.lower():
                scene_block["view"] = v[:120]
            else:
                scene_block["view"] = f"isometric 45° cutaway cross-section 3D diorama cube, {v[:60]}"
        if rs.get("materials"):
            scene_block["materials"] = str(rs["materials"]).strip()[:200]
        if rs.get("redline_visuals"):
            scene_block["redline_visuals"] = str(rs["redline_visuals"]).strip()[:250]

    ann_list = []
    if isinstance(raw_block, dict) and isinstance(raw_block.get("annotation_layer"), list):
        for ann in raw_block["annotation_layer"]:
            if isinstance(ann, dict) and ann.get("type"):
                clean = {k: (str(v)[:30] if k in ("label", "value", "sub_label") else str(v)[:120]) for k, v in ann.items() if v not in (None, "")}
                ann_list.append(clean)

    # 첨부 이미지의 필수 3요소(치수선, 리더선, 액센트선) 보강
    has_dim = any(a.get("type") == "dimension_line" for a in ann_list)
    has_leader = any(a.get("type") == "leader_line" for a in ann_list)
    has_accent = any(a.get("type") in ("accent_outline", "route_trace") for a in ann_list)

    if not has_dim:
        dim_val = "Depth: 50 Floors" if is_thumbnail else "Scale beyond imagination"
        ann_list.insert(0, {
            "type": "dimension_line",
            "style": "red 3D bounding dimension lines with corner arrowheads",
            "position": "cube outer bounding edges",
            "value": dim_val
        })
    if not has_leader:
        ann_list.append({
            "type": "leader_line",
            "style": "thin red dotted line with endpoint circular dot",
            "target": "핵심 콘크리트 통제실",
            "label": default_label or "Facility exists",
            "sub_label": "Facility exists" if default_label and default_label != "Facility exists" else None
        })
    if not has_accent:
        ann_list.append({
            "type": "accent_outline",
            "style": "thin architectural red wireframe line (#FF0000)",
            "target": "지하 룸 바닥 경계선 및 모서리 프레임"
        })

    text_list = []
    if isinstance(raw_block, dict) and isinstance(raw_block.get("text_layer"), list):
        for t in raw_block["text_layer"]:
            if isinstance(t, dict) and t.get("text"):
                raw_txt = re.sub(r"['\"\[\]\(\)\{\}\*\#\_\~]", "", str(t["text"])).strip()
                if raw_txt:
                    text_list.append({
                        "text": raw_txt[:16],
                        "position": "top",
                        "font": str(t.get("font") or "extra bold Korean gothic with subtle dark drop shadow")[:60],
                        "color": str(t.get("color") or "white")[:20],
                        "size": "huge headline",
                    })
    if not text_list and default_text:
        text_list = [{
            "text": default_text[:16],
            "position": "top",
            "font": "extra bold Korean gothic with subtle dark drop shadow",
            "color": "white",
            "size": "huge headline"
        }]
    if not is_thumbnail:
        text_list = text_list[:1]

    return {
        "format": {"aspect_ratio": aspect_ratio, "resolution": "2K"},
        "style": dict(DEFAULT_REDLINE_STYLE),
        "scene": scene_block,
        "annotation_layer": ann_list,
        "text_layer": text_list,
        "constraints": list(DEFAULT_REDLINE_CONSTRAINTS),
    }



# ── 전체 파이프라인 ───────────────────────────────────────────────────────

def generate_video_content(topic, num_scenes=10, aspect_ratio="16:9", reference_id=None, style_guide=None, scene_seconds=SCENE_SECONDS, progress_callback=None):
    """
    주제 → ① 제목·설명란 ② 8초 씬 대본 ③ AI 영상 프롬프트 ④ 레드라인 이미지 프롬프트
    모든 단계는 JSON 응답을 요구하고 코드에서 검증합니다 (정규식 파싱은 예비 경로).
    """
    num_scenes = max(2, min(int(num_scenes), 40))
    scene_seconds = max(6, min(int(scene_seconds or SCENE_SECONDS), 30))
    aspect_ratio = aspect_ratio if aspect_ratio in ASPECT_GUIDE else "16:9"

    def step(key, msg):
        if progress_callback:
            progress_callback(key, msg)
        print(msg)

    knowledge, reference = load_reference_knowledge(reference_id)
    plan = stage_plan(num_scenes)

    step("meta", "1/4 제목 후보와 설명란 기획 중...")
    meta, _, meta_raw = step_meta(topic, knowledge)

    step("scenes", f"2/4 {scene_seconds}초 씬 {num_scenes}개 나레이션 대본 작성 중 (총 약 {num_scenes * scene_seconds // 60}분 {num_scenes * scene_seconds % 60}초)..." + (f" (스킬: {reference_id})" if reference_id in ("건축쇼츠", "테크쇼츠", "경제쇼츠", "쇼츠 스크립트", "shorts-script", "tech-shorts", "biz-shorts") else ""))
    scenes, scenes_raw = step_scenes(topic, meta, knowledge, num_scenes, plan, secs=scene_seconds, reference_id=reference_id)

    step("proofread", "2/4 나레이션 오타·맞춤법 교정 중...")
    scenes, proof_raw = step_proofread(scenes)

    step("prompts", f"3/4 씬별 AI 영상 프롬프트 작성 중 ({aspect_ratio})..." + (f" (스킬: {style_guide})" if style_guide in ("건축쇼츠", "테크쇼츠", "경제쇼츠", "지식쇼츠", "knowledge-shorts", "2. knowledge-shorts-prompts-SKILL.md", "tech-shorts", "biz-shorts") else ""))
    scenes, prompts_raw = step_video_prompts(topic, scenes, aspect_ratio, style_guide=style_guide)

    guide_text = load_style_guide(style_guide)
    step("redline", "4/4 썸네일·첫 프레임 레드라인 이미지 프롬프트 설계 중..." + (f" (가이드: {style_guide})" if guide_text else ""))
    thumbnail, redline_raw = step_redline(topic, scenes, aspect_ratio, guide_text=guide_text)

    meta_text = render_meta_md(meta)
    scenes_text = render_scenes_md(scenes)
    prompts_text = render_prompts_md(scenes, aspect_ratio)
    thumb_raw = json.dumps(thumbnail, ensure_ascii=False, indent=2)

    ref_line = f"> 벤치마크: **{reference['title']}** (조회수 {reference['view_count']:,})\n\n" if reference else ""
    redline_section = (
        f"> 종횡비 `{aspect_ratio}` · 해상도 `2K` · 스타일 `3D Miniature Diorama + Red Engineering Annotation`\n\n"
        f"### 4-1. 썸네일 프롬프트\n\n```json\n{thumb_raw}\n```\n\n### 4-2. 씬별 첫 프레임 프롬프트\n\n"
        + "\n".join(f"#### 씬 {s['scene_num']} ({s['time_range']})\n- 나레이션: \"{s['subtitle']}\"\n\n```json\n{s['image_prompt_raw']}\n```\n" for s in scenes)
    )
    full_document = (
        f"# 🎬 [{topic}] 8초 씬 기반 유튜브 콘텐츠 기획서\n\n{ref_line}"
        f"## 1. 제목 & 설명란\n\n{meta_text}\n\n---\n\n"
        f"## 2. {scene_seconds}초 씬별 나레이션 대본 (총 {num_scenes}씬 · {num_scenes * scene_seconds}초)\n\n{scenes_text}\n\n---\n\n"
        f"## 3. 씬별 AI 영상 프롬프트\n\n{prompts_text}\n\n---\n\n"
        f"## 4. 나노바나나 레드라인 이미지 프롬프트\n\n{redline_section}"
    )

    plan_id = f"{safe_name(topic)}_{time.strftime('%Y%m%d-%H%M%S')}"
    backend = llm_client.detect_backend()
    result = {
        "plan_id": plan_id,
        "topic": topic,
        "aspect_ratio": aspect_ratio,
        "num_scenes": num_scenes,
        "scene_seconds": scene_seconds,
        "reference": reference,
        "style_guide": style_guide if guide_text else None,
        "meta": meta,
        "meta_text": meta_text,
        "description_plain": description_plain(meta),
        "scenes_text": scenes_text,
        "prompts_text": prompts_text,
        "thumbnail_prompt": thumbnail,
        "thumbnail_prompt_raw": thumb_raw,
        "structured_scenes": scenes,
        "full_document": full_document,
        "quality": {
            "scenes_parsed": sum(1 for s in scenes if s["parse_ok"]),
            "prompts_parsed": sum(1 for s in scenes if s.get("prompt_ok")),
            "images_parsed": sum(1 for s in scenes if s.get("image_prompt_ok")),
            "length_warnings": [s["scene_num"] for s in scenes if s.get("length_warning")],
        },
        "raw": {"meta": meta_raw, "scenes": scenes_raw, "proofread": proof_raw, "prompts": prompts_raw, "redline": redline_raw},
        "llm": {"backend": backend["name"], "model": backend["model"]} if backend else None,
        "created_at": time.time(),
    }
    result["file_path"] = save_plan(result)
    return result


if __name__ == "__main__":
    import sys
    topic = sys.argv[1] if len(sys.argv) > 1 else "지하 50층 비밀 벙커의 진실"
    ar = sys.argv[2] if len(sys.argv) > 2 else "16:9"
    n = int(sys.argv[3]) if len(sys.argv) > 3 else 3
    res = generate_video_content(topic, num_scenes=n, aspect_ratio=ar)
    print("\n" + "=" * 60)
    print(f"✅ [{topic}] 기획 완료 → data/plans/{res['plan_id']}.json  품질: {res['quality']}")
    print(res["full_document"][:1500])
