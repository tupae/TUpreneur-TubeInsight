Markdown
---
name: biz-shorts-prompts
description: "v2.2-biz: 경제/비즈니스 쇼츠 특화 T2V 프롬프트 변환기. 돈의 흐름·기업 위기·마케팅 심리 시각화 및 SUBJECT 전문 반복/자막 금지 규격 엄수"
---

# 경제·비즈니스 쇼츠 T2V 프롬프트 변환 (v2.2-biz)

## Trigger

완성된 경제/비즈니스 한국어 나레이션 대본(`biz-shorts-script-writer` 산출물 등)을 기반으로 영상 생성 프롬프트를 작성해 달라는 요청. 대본이 없으면 먼저 대본부터 작성한다.

## 절대 규칙

**1. 고정 서술을 별도 블록으로 빼지 말 것 — 최종 산출물에서도 예외 없다.**  
클립이 몇 개든 SUBJECT 문단 전문을 모든 클립 프롬프트 코드블럭 안에 매번 통째로 다시 쓴다. "클립 1과 동일", "위와 동일", "[반복]" 같은 참조·생략 표현은 절대 금지한다. 산출물 서두에 "공통 SUBJECT" 요약 블록을 따로 만들지 않는다 — 각 클립은 다른 클립을 보지 않고도 AI 비디오 툴(Runway, Kling, Sora, Luma 등)에 그대로 복사해 넣을 수 있어야 한다.

**2. 자막·캡션은 절대 생성하지 않는다 — 사용자가 편집기에서 따로 넣는다.**  
EXCLUSIONS에 `no text`처럼 모든 텍스트를 막는 표현은 쓰지 말 것(붉은색 금액/화살표 그래픽 라벨까지 막아버린다). 대신 자막·캡션만 정확히 짚어 막는다: `no subtitles, no caption bar, no bottom text overlay, no burned-in captions, no karaoke-style word-by-word timing`. 또한 모든 클립 FORMAT 줄에 `Keep the bottom 18% of frame visually clear for subtitles added later.`를 유지해 후반 자막 영역을 비워둔다. 붉은 그래픽 라벨(RED GRAPHICS 한글/숫자 라벨)은 필수 인포그래픽이므로 이 규칙과 무관하게 유지한다.

**3. 8초 전체를 역동적으로 사용한다 — 정지 구간(Dead time) 금지.**  
각 클립은 0.0초부터 8.0초까지 돈의 이동, 차트의 변화, 인물의 결정적 행동, 카메라 워크가 멈추지 않아야 한다. 정지 화면이나 단순 홀드는 배제한다. 기본은 3샷이며 각 샷에 하나의 명확한 사건(=동사 하나)을 배정한다. 복잡한 비즈니스 모델이나 연속적 유통/금융 사슬은 2샷, 단순 수치 비교나 시대별 기업 로고 몽타주는 4샷까지 허용한다.

**4. 붉은 그래픽과 금액 수치의 명확성 — 상징 기호는 직관적으로.**  
차트나 재무 데이터는 복잡한 그리드 대신 **"핵심 수치 라벨 하나, 극적인 하락/상승 화살표, ✕ 마크"**로 단순화한다. 원화(₩)나 달러($) 기호, 퍼센트(%), 배수(10x) 표기는 볼드 산세리프로 선명하게 지시한다.

---

## 샷 수 결정 규칙 (비즈니스 특화)

| 구성 | 사용하는 경우 | 권장 시간 |
|---|---|---|
| 2샷 | 복잡한 수익 모델 단면, 유통/물류 사슬, 금융 결제 프로세스 | 4초 + 4초 |
| **3샷 (기본)** | 기업의 위기 발생 → 이사회의 오판 → 주가/매출 폭락 | 2.5초 + 2.5초 + 3초 |
| 4샷 | 일상 소비 순간, 찰나의 지출 몽타주, 충격적인 금액 비교 | 2초 × 4 |
| 1샷 | 사용하지 않음 | 예외 없음 |

---

## 비즈니스 8초 구성 미니 스토리

클립은 아래 4가지 비즈니스 구조 중 하나로 설계한다.

- **구조 A (상식 파괴형):** 화려한 매장/성공(겉모습) → 장부/창고의 충격적 적자 공개 → 숨겨진 진짜 수익처 포커스
- **구조 B (돈의 흐름 추적형):** 소비자가 결제하는 손(일상) → 보이지 않는 서버/데이터 흐름 → 본사 금고로 빨려 들어가는 현금
- **구조 C (기업 잔혹사형):** 전성기 상징물 몽타주 → 붉은 X와 함께 계약서/재고 파기 → 텅 빈 본사 사옥 풀백
- **구조 D (심리 마케팅 함정):** 메뉴판/가격표 앞 망설임 → 뇌리에 꽂히는 미끼 가격 → 자신도 모르게 더 비싼 것을 집는 손

---

## LOOK 로테이션 (비즈니스/금융 특화)

하드 컷 기준으로 적극 교체하여 시각적 지루함을 없앤다.

| 코드 | 룩 문장 | 용도 |
|---|---|---|
| **A** | `photoreal commercial cinematography, sharp corporate daylight or moody boardroom lighting, hyper-realistic textures, clean high-end aesthetic` | 일상 소비, 브랜드 매장, 주주총회, 실제 인물/제품 |
| **B** | `untextured matte grey clay render, featureless white mannequin figures in business suits with no faces, soft studio rim light, no color anywhere except the red graphics` | 이사회 의사결정, 파산 위기, 비밀 계약, 인간의 탐욕 묘사 |
| **C** | `clean isometric 3D motion graphic, minimalist vector style, matte pastel materials, plain pale background` | 비즈니스 모델 단면, 물류 창고, 플랫폼 수수료 구조 |
| **D** | `pure black background, luminous red and white vector lines, high-contrast financial data flow` | 주가 폭락, 자금 유출, 결제 데이터, 눈에 안 보이는 금융망 |

*규칙: 동일 LOOK 연속 2회 금지. D룩은 '돈/데이터의 비가시적 이동'이나 '급격한 폭락/폭등' 샷에만 전략적으로 배치.*

---

## 카메라 및 타이밍 운용 규칙

- **타이밍 기준**: 
  - `나레이션 초 = 문자 수 × 0.144`
  - `클립 수 목표 = 나레이션 초 ÷ 5` (60초 영상 기준 약 12클립)
- **카메라 기본값**: 
  - 결제/지출 행동 = 매크로 클로즈업 + 미세 팬
  - 자금 유출/사옥 전경 = 급속 풀백(Fast pull-back)
  - 핵심 손실액 공개 = 급속 푸시인(Punchy push-in)
  - 이사회/권력 구도 = 로우앵글 틸트업
  - 샷 전환 = 깔끔한 하드 컷(Hard cut) 원칙 (필요시 whip pan cut)
- **금지된 무빙 조합**: `push-in + pull-back`, `orbit + lateral tracking + crane up` 등 상충되는 모션 병용 금지.

---

## 비즈니스 붉은 그래픽 (RED GRAPHICS)

수치와 돈의 규모를 직관적으로 타격한다.

| 종류 | 지시어 |
|---|---|
| 적자/손실 ✕ 마크 | `large red X stroked over … in two heavy strokes` |
| 급락/급등 화살표 | `thick bold red arrow plunging down vertically at a steep angle, accompanied by a percentage drop indicator` |
| 금액 타깃 박스 | `sharp red rectangular label box with white Korean text 「적자 1,200억」 appearing with draw-on effect` |
| 가격 차이 비교선 | `vertical red distance bracket measuring the price gap between [A] and [B] with 「+500원」 text` |
| 대형 키워드 타이포 | `huge bold red Korean text 「부도」 filling one third of the frame width, plain text with no background shape` |

*마지막에 항상 고정:*  
`All Korean text and monetary symbols are bold clean sans-serif, crisp and fully legible.`

---

## 프롬프트 조립 템플릿 (v2.2-biz)

FORMAT: 8 seconds, 9:16 vertical, 24 fps, one continuous generation containing
[2/3/4] shots joined by clean hard cuts (match cut / whip pan where noted).
Use the full 8.0 seconds with continuous meaningful visual action — no static
hold, no dead time, no unused ending. Keep the bottom 18% of frame visually
clear for subtitles added later.

CLIP STRUCTURE: A compact visual business story following [구조 A/B/C/D 중 선택].
Each shot contains exactly one principal event (one financial or human action)
and one clearly directed camera move. Every event begins immediately at the start
of its assigned shot and reaches a visually complete state before the next hard cut.

SUBJECT: [이 클립만의 프롬프트라도 반드시 전문을 적는다 — 구체적인 제품, 인물 복장,
기업 사옥 인테리어, 화폐 묶음, 계약서 등의 명사를 통째로 나열. "앞 클립과 동일" 절대 금지]

SHOT ONE (0.0s–X.Xs):
LOOK: [A/B/C/D]
Event: [사건 하나, 시작 상태 → 종료 상태를 구체적으로 (예: 결제 완료 화면 → 영수증 발행)].
Camera: [주 이동], keeping [핵심 피사체/손/카드/차트] filling the vertical frame [영역].
The event reaches a complete visual state by X.Xs.

SHOT TWO (X.Xs–Y.Ys): Hard cut (or whip pan / match cut).
LOOK: [직전과 다른 A/B/C/D]
Event: [두 번째 사건 하나 — 원인/이면의 적자/심리적 함정].
Camera: [주 이동] followed by [짧은 종결 이동].
The event reaches a complete visual state by Y.Ys.

[SHOT THREE / FOUR — 샷 수 결정 규칙에 따라 동일 포맷으로 반복]
마지막 샷 Camera: [이동] ending on [강한 최종 구도/충격적인 차트/텅 빈 의자]. Continue meaningful motion
through the final second; do not begin a new action after 7.7s. The final
visual statement lands precisely at 8.0s.

RED GRAPHICS (sharp vector-like strokes, pure saturated red):

SHOT [번호], [시간]: [금액 라벨/하락 화살표/X 마크] appears at [정확한 위치] via
[draw-on / impact stroke / target ring lock]
1~3개 한정, 동일 도형 반복 나열 금지. 하드 컷 시 소멸.
All Korean text and monetary symbols are bold clean sans-serif, crisp and fully legible.

MOTION GRAPHICS: [파티클/달러 지폐 낙하/주가 차트 네온 펄스/none 중 1개]

CONTINUITY: [기업 브랜드 컬러, 마네킹 정장 스타일, 매장 조명 톤, 일관된 로고 형상의 동일성 선언].
Hard cuts may change scale, location, and visual style; no mutated logos, disappearing props,
or morphing hand shapes within a single shot.

EXCLUSIONS: no subtitles, no caption bar, no bottom text overlay, no
burned-in captions, no karaoke-style word-by-word timing, no logos of real
unintended brands, no watermark, no lens flare, no distorted fingers or hands,
no duplicated objects, no recognisable real celebrity faces, no corrupted Korean text,
no dissolve, no morph, no empty ending, no static hold, no background music,
no speech or generated narration.

AUDIO: [각 샷의 사실적인 환경음: 카드 결제 '삑' 소리, 웅성거리는 주총장, 인쇄기 돌아가는 소리, 주가 폭락 경고 비프음 등].
Audio changes sharply with each hard cut and contains no speech or music.


---

## 수미상관 (경제/비즈니스 버전)

첫 클립의 첫 샷(예: 소비자가 무심코 집어 든 제품 클로즈업)과 마지막 클립의 마지막 샷(예: 그 제품 뒤에 숨겨진 거대한 지주회사 사옥의 전경)을 의도적으로 연결하여 CONTINUITY에 명시한다.

---

## 마무리 산출물 규격

1. **클립별 프롬프트 세트 (코드블록)**: 각 클립이 독립적으로 복사 가능해야 함 (SUBJECT 전문 매번 반복).
2. **편집 타임라인 시트**: 클립 번호 / 나레이션 매핑 / 주요 사운드 이펙트(SFX) 표.
3. **재생성 우선순위 가이드**: D룩(차트/데이터) $\rightarrow$ 클립 1(오프닝 훅) $\rightarrow$ 마지막 클립 $\rightarrow$ 나머지 순.

---

## Verification

- [ ] 60초 기준 클립 수가 12개 안팎으로 적절히 분할되었는가
- [ ] 클립마다 샷 수가 규칙을 따르는가 (기본 3샷, 프로세스 단면 2샷, 단순 지출/비교만 4샷)
- [ ] 모든 샷의 시간대를 합치면 정확히 8.0초이며, 7.7초 이후 새 동작이 시작되지 않는가
- [ ] **모든 클립의 SUBJECT가 "위와 동일" 같은 생략 없이 구체적 명사로 전문 필사되어 있는가**
- [ ] **문서 어디에도 "공통 SUBJECT 요약 블록"이 따로 존재하지 않는가**
- [ ] **EXCLUSIONS에 `no subtitles, no caption bar, no bottom text overlay, no burned-in captions, no karaoke-style word-by-word timing`이 누락 없이 들어갔는가 (동시에 `no text`는 없는가)**
- [ ] 하단 18% 자막용 여백 확보 문구가 FORMAT에 포함되었는가
- [ ] LOOK(A/B/C/D)이 하드 컷마다 로테이션되며 동일 LOOK이 연속되지 않는가
- [ ] D룩(금융 데이터/주가 급락)이 꼭 필요한 장면에만 한정적으로 쓰였는가
- [ ] 손가락 왜곡(`no distorted fingers or hands`) 등 결제/핸드헬드 씬 방어 키워드가 들어갔는가