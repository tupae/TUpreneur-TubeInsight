---
name: knowledge-shorts-prompts
description: "v2.1: SUBJECT 공통 바상을 별도 요약 블록으로 빼는 것을 최종 산출물에서도 명확히 금지(매 클립 코드블럭에 전문 반복), 자막/캐보션 생성을 명시적으로 금지하는 EXCLUSIONS 문구 강화"
---

# 지식 쇼츠 T2V 프롬프트 변환 (v2.1)

## Trigger

완성된 한국어 나레이션 대본을 주면서 영상 생성 프롬프트를 만들어 달라는 요청. 대본이 없으면 먼저 대본부터 쓴다.

## 절대 규칙

**1. 고정 서술을 별도 블록으로 빼지 말 것 — 최종 산출물에서도 예외 없다.** 클립이 몇 개든 SUBJECT 문단 전문을 모든 클립 프롬프트 코드블럭 안에 매번 통째로 다시 쓴다. "클립1과 동일", "위와 동일", "[반복]" 같은 참조·생략 표현은 절대 쓰지 않는다. 산출물 서두에 "공통 SUBJECT" 요약 블록을 따로 만들지 않는다 — 각 클립은 다른 클립을 보지 않고도 그 자체로 생성기에 그대로 복사해 넣을 수 있어야 한다. 프롬프트가 길어져 반복이 거슬리더라도 SUBJECT 전문 반복은 타협하지 않는다 — 이것만은 구조적으로 절대 생략하지 않는다.

**2. 자막·캐보션은 절대 생성하지 않는다 — 사용자가 후반작업에서 따로 넣는다.** EXCLUSIONS에 `no text`처럼 모든 텍스트를 막는 표현은 쓰지 말 것(붉은 그래픽 라벨까지 막아버린다). 대신 자막·캐보션만 정확히 짐어 막는다: `no subtitles, no caption bar, no bottom text overlay, no burned-in captions, no karaoke-style word-by-word timing`. 이 네 가지는 매 클립 EXCLUSIONS에 빠짐없이 들어간다. 또한 모든 클립 FORMAT 줄에 `Keep the bottom 18% of frame visually clear for subtitles added later.`를 유지해 사용자가 나중에 직접 자막을 올릴 자리를 비워둔다. 붉은 그래픽 라벨(RED GRAPHICS 한글 라벨)은 자막이 아니므로 이 규칙과 무관하게 계속 쓴다.

**3. 8초 전체를 사용한다 — 정지 구간을 만들지 않는다.** 각 클립은 0.0초부터 8.0초까지 의미 있는 사건이나 카메라 움직임이 계속되어야 한다. 편집 여유를 위한 정지 화면, 빈 구간, 의미 없는 홀드는 넣지 않는다. 기본은 3샷이며 각 샷에 하나의 명확한 사건(=동사 하나)을 배정한다. 복잡한 공법이나 연속적인 물리 변화는 2샷으로 줄이고, 단순한 규모 비교나 시대 몽타주는 최대 4샷까지 허용한다. 모든 샷의 시간대를 정확히 합쳐 8.0초로 맞춘다. 마지막 샷도 8.0초까지 사건·카메라·그래픽 중 하나가 계속 움직이되, 마지막 0.3초 안에는 새로운 사건을 시작하지 않는다.

**4. 우겨넣지 말 것 — 프롬프트 길이보다 영상 결과가 먼저다.** 샷 수는 아래 "샷 수 결정 규칙"을 따르고 정보량을 이유로 그 이상 채우지 않는다. **같은 도형을 여러 번 반복해서 쌓거나 나열하는 연출은 쓰지 않는다** — 개수를 강조하고 싶으면 도형 반복 대신 라벨·치수선 안의 숫자 하나로 표현한다. 붉은 그래픽은 1~2개가 기본, 서로 다른 종류(라벨+치수선+화살표 등)를 조합할 때만 3개까지. 대형 타이포도 텍스트만 넣고 육각형 표지판·배지·리본 같은 배경 도형을 임의로 붙이지 않는다.

## 샷 수 결정 규칙

| 구성 | 사용하는 경우 | 권장 시간 |
|---|---|---|
| 2샷 | 복잡한 단면, 공법, 대규모 물리 변화 | 4초 + 4초 |
| **3샷 (기본)** | 대부분의 건축·역사 지식 설명 | 2.5초 + 2.5초 + 3초 |
| 4샷 | 단순 규모 비교, 시대 몽타주, 빠른 훅 | 2초 × 4 |
| 1샷 | 사용하지 않음 | 예외 없음 |

핵심은 샷 수가 아니라 **사건 복잡도**다. 해저터널을 3샷으로 만드는 예: ① 바다 위에서 침매함을 운반 ② 하드컷 후 해저로 하강 ③ 하드컷 후 기존 터널과 결합 — 이렇게 각 샷에 동사 하나씩 배정한다. 반대로 한 샷에서 운반→회전→가라앉음→결합→배수까지 몰아넣으면 실패 확률이 오른다.

## 레퍼런스급 8초 구성 공식

클립을 아래 미니 스토리 중 하나로 설계한다.

- **구조 A (문제→원인→해결):** 문제 현장 → 단면으로 원인 공개 → 해결 구조물 작동
- **구조 B (전체→내부→핵심):** 드론 전체 규모 → 기술 단면 내부 원리 → 핵심 장치 푸시인
- **구조 C (과거→공사→현재):** 과거 클레이 재현 → 공사 과정 → 현재 실사 항공
- **구조 D (예상→반전→증명):** 예상 구조 → 붉은 X로 반전 공개 → 기술 단면으로 증명

레퍼런스 영상과 가장 가까운 것은 B와 D.

## LOOK 로테이션 (하드 컷 기준 적극 변경)

| 코드 | 룩 문장 | 쓰는 자리 |
|---|---|---|
| **A** | `photoreal aerial drone cinematography, hazy natural daylight, muted colors` | 훅 / 현장 / 결말 |
| **B** | `untextured matte grey clay render, featureless white mannequin figures with no faces, soft even studio light, no color anywhere except the red graphics` | 사람·회의·의사결정·시대 재현 |
| **C** | `clean technical cutaway, isometric, matte materials, plain pale background` | 공법·지층·구조 |
| **D** | `pure black background, thin luminous white lines, high contrast` | 전파·압력·힘 등 눈에 안 보이는 개념 전용 |

규칙: 샷 사이 LOOK 변경 허용(권장), 한 샷 도중 LOOK 모핑 금지, 동일 LOOK 연속 2회 가급적 피함, D는 정말 눈에 안 보이는 개념에만(매 클립 반복 금지).

## 카메라 운용 규칙

샷마다 주 이동 하나 + 종결 이동 하나까지 허용. 금지 조합(방향 충돌): `orbit + lateral tracking + crane up` / `push-in + pull-back` / `locked off + handheld`. 용도별 기본값: 사건 진행 중=횡이동·패럴랙스 트래킹, 구조 공개=빠른 풀백, 핵심 수치 공개=급속 푸시인, 평면 구조 설명=하이앵글 다운샷, 규모 강조=로우앵글 틸트업, 샷 전환=하드 컷 또는 휘프팬 컷.

## 타이밍과 클립 분할 — 1분 영상은 12클립 기준

```
나레이션 초 = 문자 수 × 0.144
클립 수 목표 = 나레이션 초 ÷ 5   (60초 영상 → 12클립 안팎)
```

문장은 절대 자르지 않는다 — 의미 전환에서 끊는다. 짧은 반전 문장(3~8자)은 앞뒤 문장과 같은 클립의 마지막 샷으로 자연스럽게 흡수된다. 클립 내부의 샷 배분(2~4개)은 위 "샷 수 결정 규칙"을 따른다.

## SUBJECT — 구체적인 명사로 쓴다, 매 클립 전문 반복

SUBJECT는 추상적인 묘사가 아니라 **손에 잡힐 듯한 구체 명사**로 써야 생성 결과가 입체적이다. 예: "a rectangular caisson" 보다 "a rectangular grey concrete caisson, tugboats and a crane barge working beside it, thick steel towlines taut in the water" 처럼 주변 소품·장비·사람까지 함께 나열해 장면을 구체화한다.

한 번 확정한 대상 서술은 간단히 준비해두고, 클립마다 프롬프트 조립 템플릿의 SUBJECT 자리에 **이 전문을 그대로 복사해 놓는다**. 매번 다시 타이핑하는 것이 번거로워도 이것은 생략하지 않는다 — 각 클립 프롬프트는 다른 클립을 참조하지 않고도 독립적으로 생성기에 붙여넣을 수 있어야 한다. 특정 클립이 시대가 다르거나(예: 매립 이전 섬) 특수한 배경이 필요하면, 고정 서술 뒤에 해당 클립만을 위한 문장을 이어 붙이되, 고정 서술 자체는 지우거나 줄이지 않는다.

## 붉은 그래픽 — 종류를 섞어 쓰되 개수는 정보량을 따른다

| 종류 | 지시어 |
|---|---|
| 라벨 박스 | `red label box with white Korean text 「…」` + 지시선이 그려지며 등장 |
| 치수선/화살표 결합 | `long red arrow with a distance bracket, running from … toward … : draws itself` |
| 타깃 서클 | `red circular target ring` + `closes from outside inward` |
| 대형 타이포 | `huge bold red Korean text 「유일」 with wide letter spacing, filling about one third of the frame width, plain text with no background shape` |
| ✕ 마크 | `large red X stroked over … in two strokes` |

마지막에 항상: `All Korean text is bold clean sans-serif, crisp and fully legible.` — 이 라벨은 화면 안 그래픽이지 자막이 아니므로 절대 규칙 2와 충돌하지 않는다.

## 모션 그래픽

정적으로 느껴지는 순간마다 유선/드로우온/파티클/글로우펄스/임팩트흔들림/스피드라인 중 하나를 겹친다. 이미 카메라가 강하게 움직이는 샷에는 `none`으로 비워도 된다.

## 토큰을 아끼는 방법

프롬프트를 짧게 만드는 것이 아니라 '결과에 영향을 주지 않는 중복'을 없애야 한다 — SUBJECT 전문 반복은 이 규칙의 예외다(규칙 1). 삭제해도 되는 표현: `cinematic, highly detailed, beautiful, amazing, masterpiece, professional quality, stunning, epic`. 대신 결과를 바꾸는 표현을 남긴다: `low-angle`, `35 mm lens`, `constant-height lateral tracking`, `matte grey concrete`, `three tugboats`, `red vertical distance bracket`, `hard cut at 2.5s`. 즉, 형용사 토큰은 줄이고 명사·동사·시간·위치 토큰에 집중한다.

## 프롬프트 조립 (레퍼런스 스타일, v2.1)

```
FORMAT: 8 seconds, 9:16 vertical, 24 fps, one continuous generation containing
[2/3/4] shots joined by clean hard cuts (match cut / whip pan where noted).
Use the full 8.0 seconds with continuous meaningful visual action — no static
hold, no dead time, no unused ending. Keep the bottom 18% of frame visually
clear for subtitles added later.

CLIP STRUCTURE: A compact visual story following [구조 A/B/C/D 중 선택].
Each shot contains exactly one principal event (one verb) and one clearly
directed camera move. Every event begins immediately at the start of its
assigned shot and reaches a visually complete state before the next hard cut.

SUBJECT: [이 클립만의 프롬프트라도 반드시 전문을 적는다 — 구체적인 명사로 대상
서술을 통째로. "앞 클립과 동일" 같은 참조로 대체하지 않는다]

SHOT ONE (0.0s–X.Xs):
LOOK: [A/B/C/D]
Event: [사건 하나, 시작 상태 → 종료 상태를 구체적으로].
Camera: [주 이동], keeping [핵심 대상] filling the vertical frame [구체적 영역].
The event reaches a complete visual state by X.Xs.

SHOT TWO (X.Xs–Y.Ys): Hard cut (or whip pan / match cut).
LOOK: [직전과 다른 A/B/C/D]
Event: [두 번째 사건 하나 — 원인/원리/반전 중 하나].
Camera: [주 이동] followed by [짧은 종결 이동].
The event reaches a complete visual state by Y.Ys.

[SHOT THREE / FOUR — 필요한 만큼, 동일 포맷으로 반복]
마지막 샷 Camera: [이동] ending on [강한 최종 구도]. Continue meaningful motion
through the final second; do not begin a new action after 7.7s. The final
visual statement lands precisely at 8.0s.

RED GRAPHICS (sharp vector-like strokes, pure saturated red):
  - SHOT [번호], [시간]: [그래픽 종류] appears at [정확한 위치] via
    [draw-on / impact stroke / target close / distance extension]
  1~3개, 같은 도형 반복 금지. 하드컷에서 사라짐.
  All Korean text is bold clean sans-serif, crisp and fully legible.

MOTION GRAPHICS: [1개 또는 none]

CONTINUITY: [반복되는 구조물의 형태·재질·색상·방향 동일성 선언]. Hard cuts may
change location, scale, period and visual style; no duplicated equipment,
disappearing parts, spontaneous geometry changes or object teleportation
within a single shot.

EXCLUSIONS: no subtitles, no caption bar, no bottom text overlay, no
burned-in captions, no karaoke-style word-by-word timing, no logos, no
watermark, no lens flare, no film grain, no vignette, no distorted
structures, no invented landmarks, no duplicated objects, no recognisable
faces, no corrupted Korean text, no dissolve, no morph, no empty ending, no
static hold, no background music, no speech or generated narration.

AUDIO: [각 샷의 현실적인 환경음과 사건 효과음]. Audio changes sharply with each
hard cut and contains no speech or music.
```

## 수미상관

첫 클립의 첫 샷과 마지막 클립의 마지막 샷을 같은 고도·각도·조명으로 지정하고 CONTINUITY에 명시한다.

## 마무리 산출물

프롬프트 세트 + ① 편집 시트 ② 재생성 우선순위 ③ 대본 사실 오류 지적. 재생성 우선순위는 마지막 클립 → 첫 클립 → 다이어그램 컷 → 나머지 순.

**산출물을 조립할 때 지킬 것:** 문서 서두에 "모든 클립 공통 SUBJECT" 같은 요약 바상을 따로 만들지 않는다. 각 클립의 코드블럭은 다른 부분을 참조하지 않고도 그대로 복사해 생성기에 붙여넣을 수 있어야 한다.

## Verification

- 60초 기준 클립 수가 12개 안팎인가
- 클립마다 샷 수가 "샷 수 결정 규칙" 표를 따르는가 (기본 3, 복잡 공법 2, 단순 비교·몽타주만 4)
- 모든 샷의 시간대를 합치면 정확히 8.0초인가
- 정지 구간이 전혀 없고, 마지막 0.3초 전까지 새 사건이 시작되지 않는가
- 각 샷이 하나의 사건(동사 하나)만 담당하는가
- **대본에 있는 모든 클립의 SUBJECT가 "클립1과 동일" 같은 참조 없이 전문이 그대로 필사되어 있는가, 문서 어디에도 "공통 SUBJECT" 요약 블록이 따로 존재하지 않는가**
- **모든 클립 EXCLUSIONS에 `no subtitles, no caption bar, no bottom text overlay, no burned-in captions, no karaoke-style word-by-word timing`가 빠짐없이 들어갔는가, `no text`처럼 그래픽 라벨까지 막는 표현이 없는가**
- SUBJECT가 플레이스홀더 없이 구체적 명사로 통째로 들어갔는가
- "Frame fill" 별도 줄 없이 구도가 Camera 문장 안에 녹았는가
- LOOK이 하드컷마다 바뀌고 동일 LOOK이 연속 2회 이상 나오지 않는가
- D룩이 눈에 안 보이는 개념에만 아껴 쓰였는가
- 카메라 조합이 금지된 방향 충돌(orbit+lateral+crane up, push-in+pull-back, locked off+handheld) 없이 구성되었는가
- 같은 도형을 3번 이상 반복 나열하는 연출이 없는가
- 형용사성 미사여구(cinematic, beautiful 등)가 제거되고 명사·동사·시간·위치 토큰이 남았는가
- 첫 클립과 마지막 클립의 앵글·조명이 일치하는가
- 대본의 수치·고유명사에 미확인이 섞여 있지 않은가