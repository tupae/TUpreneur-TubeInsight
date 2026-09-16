---
name: tech-news-shorts-prompts
description: "v2.2-tech: 테크·AI 뉴스 쇼츠 특화 T2V 프롬프트 변환기. 빅테크 격돌·AI 모델 시연·생태계 파장 시각화 및 SUBJECT 전문 반복/자막 금지 규격 엄수"
---

# 테크·AI 뉴스 쇼츠 T2V 프롬프트 변환 (v2.2-tech)

## Trigger

완성된 테크·AI 뉴스 나레이션 대본(`tech-news-shorts-script-writer` 산출물 등)을 기반으로 영상 생성 프롬프트를 작성해 달라는 요청. 대본이 없으면 먼저 대본부터 작성한다[cite: 3].

## 절대 규칙

**1. 고정 서술을 별도 블록으로 빼지 말 것 — 최종 산출물에서도 예외 없다.**  
클립이 몇 개든 SUBJECT 문단 전문을 모든 클립 프롬프트 코드블럭 안에 매번 통째로 다시 쓴다[cite: 3]. "클립 1과 동일", "위와 동일", "[반복]" 같은 참조·생략 표현은 절대 금지한다[cite: 3]. 산출물 서두에 "공통 SUBJECT" 요약 블록을 따로 만들지 않는다 — 각 클립은 다른 클립을 보지 않고도 AI 비디오 툴(Runway, Kling, Sora, Luma 등)에 그대로 복사해 넣을 수 있어야 한다[cite: 3].

**2. 자막·캡션은 절대 생성하지 않는다 — 사용자가 편집기에서 따로 넣는다.**  
EXCLUSIONS에 `no text`처럼 모든 텍스트를 막는 표현은 쓰지 말 것(붉은색 라벨이나 벤치마크 수치까지 막아버린다)[cite: 3]. 대신 자막·캡션만 정확히 짚어 막는다: `no subtitles, no caption bar, no bottom text overlay, no burned-in captions, no karaoke-style word-by-word timing`[cite: 3]. 또한 모든 클립 FORMAT 줄에 `Keep the bottom 18% of frame visually clear for subtitles added later.`를 유지해 후반 자막 영역을 비워둔다[cite: 3]. 붉은 그래픽 라벨(RED GRAPHICS 한글/영문 라벨)은 필수 인포그래픽이므로 이 규칙과 무관하게 유지한다[cite: 3].

**3. 8초 전체를 역동적으로 사용한다 — 정지 구간(Dead time) 금지.**  
각 클립은 0.0초부터 8.0초까지 코드 생성 속도, UI 인터페이스 변화, 서버실 랙 점등, 인물의 긴박한 타이핑 및 카메라 워크가 멈추지 않아야 한다[cite: 3]. 정지 화면이나 단순 홀드는 배제한다[cite: 3]. 기본은 3샷이며 각 샷에 하나의 명확한 사건(=동사 하나)을 배정한다[cite: 3]. 복잡한 아키텍처 다이어그램이나 파이프라인 처리는 2샷, 단순 성능 비교(Before vs After)나 빅테크 로고 몽타주는 4샷까지 허용한다[cite: 3].

**4. 붉은 그래픽과 테크 수치의 명확성 — 상징 기호는 직관적으로.**  
복잡한 수식 대신 **"처리 속도(10x), 벤치마크 점수, ✕ 마크, 지연 시간(Latency) 브래킷"**으로 단순화한다[cite: 3]. 성능 비교 배수나 백분율 표기는 볼드 산세리프로 선명하게 지시한다[cite: 3].

---

## 샷 수 결정 규칙 (테크·AI 뉴스 특화)

| 구성 | 사용하는 경우 | 권장 시간 |
|---|---|---|
| 2샷 | 복잡한 AI 신경망/에이전트 파이프라인, 반도체 웨이퍼 단면 | 4초 + 4초[cite: 3] |
| **3샷 (기본)** | 기습 발표 훅 → 기존 모델과의 성능 격차 시연 → 업계 패닉/주가 반응 | 2.5초 + 2.5초 + 3초[cite: 3] |
| 4샷 | 1초 완성 시연 몽타주, 단순 벤치마크 속도 대결 (4분할/연타) | 2초 × 4[cite: 3] |
| 1샷 | 사용하지 않음 | 예외 없음[cite: 3] |

---

## 테크 뉴스 8초 구성 미니 스토리

클립은 아래 4가지 테크 서사 구조 중 하나로 설계한다.

- **구조 A (충격적 기습 발표형):** 키노트 무대 스크린 공개 → 기존 1등을 압도하는 그래프 급등 → 당황한 경쟁사 본사 사옥 틸트
- **구조 B (실시간 속도 대결형):** 동일 프롬프트 입력 → 기존 AI의 버벅거림 vs 신규 모델의 폭풍 코드 생성 → 결과물 팝업과 붉은 체크
- **구조 C (생태계 파괴/독점형):** 기존 수십 개 유료 SaaS 툴 아이콘 몽타주 → 붉은 X와 함께 단일 기능으로 흡수 → 텅 빈 사무실 화면
- **구조 D (보안/약관 폭로형):** 스마트폰 일상 터치(동의 버튼) → 클라우드 백업 서버로 빨려 들어가는 개인 데이터망 → AI 학습 데이터셋 시각화

---

## LOOK 로테이션 (테크·AI 특화)

하드 컷 기준으로 적극 교체하여 시각적 긴장감을 높인다[cite: 3].

| 코드 | 룩 문장 | 용도 |
|---|---|---|
| **A** | `photoreal futuristic commercial tech cinematography, sleek keynote lighting or glowing ultramodern workstation, crisp OLED screen reflections, hyper-detailed glass and metal` | 실제 제품 시연, 개발자 작업실, 스마트폰 화면, 키노트 발표장 |
| **B** | `untextured matte dark grey clay render, featureless stylized white figures in front of glowing monitors, stark rim light, no color anywhere except the red graphics` | 개발자 해고 위기, 빅테크 CEO 밀실 회의, 인간의 무기력함 |
| **C** | `clean isometric technical pipeline, minimalist 3D modular servers, glass datacenter aesthetics, matte materials, high precision` | AI 에이전트 워크플로우, API 통신 구조, 반도체 패키징 |
| **D** | `pure black background, luminous red and electric white neural network nodes, laser-thin glowing data streams, extreme high contrast` | LLM 추론 과정, 지연 시간 측정, 눈에 안 보이는 데이터 독점 |

*규칙: 동일 LOOK 연속 2회 금지[cite: 3]. D룩은 'AI 가중치 계산, 데이터 패킷 이동' 등 비가시적 기술 샷에만 배치[cite: 3].*

---

## 카메라 및 타이밍 운용 규칙

- **타이밍 기준**: 
  - `나레이션 초 = 문자 수 × 0.144`[cite: 3]
  - `클립 수 목표 = 나레이션 초 ÷ 5` (60초 영상 기준 약 12클립)[cite: 3]
- **카메라 기본값**: 
  - 화면 프롬프트 입력/터치 = 매크로 익스트림 클로즈업[cite: 3]
  - 충격적 벤치마크 공개 = 급속 푸시인 (Punchy snap push-in)[cite: 3]
  - 거대 데이터센터/생태계 = 하이앵글 다운샷 후 고속 풀백[cite: 3]
  - 속도 격차 강조 = 횡이동 스플릿 트래킹[cite: 3]
  - 샷 전환 = 하드 컷(Hard cut) 또는 데이터 글리치 컷[cite: 3]
- **금지된 무빙 조합**: `push-in + pull-back`, `orbit + lateral tracking + crane up` 등 상충되는 모션 병용 금지[cite: 3].

---

## 테크 뉴스 붉은 그래픽 (RED GRAPHICS)

기술 격차와 파장을 즉각적으로 각인시킨다.

| 종류 | 지시어 |
|---|---|
| 서비스 폐지/대체 ✕ 마크 | `large red X stroked over … in two sharp electric strokes` |
| 속도/성능 격차 배수 | `sharp red rectangular label box with white Korean text 「10배 가속」 appearing with draw-on effect` |
| 지연 시간(Latency) 브래킷 | `red horizontal timeline bracket measuring 0.1s latency with pulse indicator` |
| 긴급 경고/비상 타이포 | `huge bold red Korean text 「비상」 filling one third of the frame width, plain text with no background shape` |
| 타깃 락온 서클 | `red circular technical target ring closing from outside inward on the new chip/UI button` |

*마지막에 항상 고정:*  
`All Korean text and technical indicators are bold clean sans-serif, crisp and fully legible.`[cite: 3]

---

## 프롬프트 조립 템플릿 (v2.2-tech)

FORMAT: 8 seconds, 9:16 vertical, 24 fps, one continuous generation containing
[2/3/4] shots joined by clean hard cuts (match cut / whip pan where noted).
Use the full 8.0 seconds with continuous meaningful visual action — no static
hold, no dead time, no unused ending. Keep the bottom 18% of frame visually
clear for subtitles added later.

CLIP STRUCTURE: A compact visual tech news story following [구조 A/B/C/D 중 선택].
Each shot contains exactly one principal event (one technical demonstration or industry action)
and one clearly directed camera move. Every event begins immediately at the start
of its assigned shot and reaches a visually complete state before the next hard cut.

SUBJECT: [이 클립만의 프롬프트라도 반드시 전문을 적는다 — 구체적인 코드 에디터 화면,
데이터센터 서버 랙의 LED 점멸, 실리콘 웨이퍼, 스마트폰 프롬프트 창 등의 명사를 통째로 나열. "앞 클립과 동일" 절대 금지]

SHOT ONE (0.0s–X.Xs):
LOOK: [A/B/C/D]
Event: [사건 하나, 시작 상태 → 종료 상태를 구체적으로 (예: 프롬프트 엔터 키 입력 → 폭포수 같은 코드 스트리밍)].
Camera: [주 이동], keeping [핵심 화면/손/서버 랙] filling the vertical frame [영역].
The event reaches a complete visual state by X.Xs.

SHOT TWO (X.Xs–Y.Ys): Hard cut (or whip pan / match cut).
LOOK: [직전과 다른 A/B/C/D]
Event: [두 번째 사건 하나 — 경쟁사의 버벅거림/충격적인 벤치마크 그래프 급등/주가 폭락].
Camera: [주 이동] followed by [짧은 종결 이동].
The event reaches a complete visual state by Y.Ys.

[SHOT THREE / FOUR — 샷 수 결정 규칙에 따라 동일 포맷으로 반복]
마지막 샷 Camera: [이동] ending on [강한 최종 구도/충격적인 비교 화면/완성된 앱 UI]. Continue meaningful motion
through the final second; do not begin a new action after 7.7s. The final
visual statement lands precisely at 8.0s.

RED GRAPHICS (sharp vector-like strokes, pure saturated red):

SHOT [번호], [시간]: [속도 라벨/X 마크/타깃 링] appears at [정확한 위치] via
[draw-on / impact stroke / target ring lock]
1~3개 한정, 동일 도형 반복 나열 금지. 하드 컷 시 소멸.
All Korean text and technical indicators are bold clean sans-serif, crisp and fully legible.

MOTION GRAPHICS: [디지털 글리치/스트리밍 코드 파티클/네트워크 펄스/none 중 1개]

CONTINUITY: [테크 기업 브랜드 고유 색상, 코드 폰트 스타일, 워크스테이션 조명 톤, 일관된 UI 창 디자인 선언].
Hard cuts may change scale, location, and visual style; no mutated logos, disappearing monitors,
or distorted hands typing on keyboards within a single shot.

EXCLUSIONS: no subtitles, no caption bar, no bottom text overlay, no
burned-in captions, no karaoke-style word-by-word timing, no fake watermark,
no lens flare, no distorted fingers or extra fingers on keyboards,
no duplicated screens, no recognisable real celebrity faces without permission, no corrupted Korean text,
no dissolve, no morph, no empty ending, no static hold, no background music,
no speech or generated narration.

AUDIO: [각 샷의 기계적/현실적인 환경음: 기계식 키보드 타건음, 서버실 쿨링팬 굉음, 완료 비프음, 키노트 셔터 소리 등].
Audio changes sharply with each hard cut and contains no speech or music.


---

## 수미상관 (테크 뉴스 버전)

첫 클립의 첫 샷(예: 사용자가 스마트폰에 던진 사소한 한 줄 프롬프트)과 마지막 클립의 마지막 샷(예: 그 한 줄로 인해 완전히 자동화되어 불이 꺼진 거대한 오피스 빌딩 전경)을 상징적으로 대비하여 CONTINUITY에 명시한다.

---

## 마무리 산출물 규격

1. **클립별 프롬프트 세트 (코드블록)**: 각 클립이 독립적으로 복사 가능해야 함 (SUBJECT 전문 매번 반복)[cite: 3].
2. **편집 타임라인 시트**: 클립 번호 / 나레이션 매핑 / 주요 사운드 이펙트(SFX: 키보드 클릭, 팬 소음, 경고음) 표.
3. **재생성 우선순위 가이드**: D룩(신경망/데이터 스트림) $\rightarrow$ 클립 1(오프닝 훅 시연) $\rightarrow$ 마지막 클립 $\rightarrow$ 나머지 순[cite: 3].

---

## Verification

- [ ] 60초 기준 클립 수가 12개 안팎으로 적절히 분할되었는가[cite: 3]
- [ ] 클립마다 샷 수가 규칙을 따르는가 (기본 3샷, 파이프라인 2샷, 단순 비교만 4샷)[cite: 3]
- [ ] 모든 샷의 시간대를 합치면 정확히 8.0초이며, 7.7초 이후 새 동작이 시작되지 않는가[cite: 3]
- [ ] **모든 클립의 SUBJECT가 "위와 동일" 같은 생략 없이 구체적 명사로 전문 필사되어 있는가**[cite: 3]
- [ ] **문서 어디에도 "공통 SUBJECT 요약 블록"이 따로 존재하지 않는가**[cite: 3]
- [ ] **EXCLUSIONS에 `no subtitles, no caption bar, no bottom text overlay, no burned-in captions, no karaoke-style word-by-word timing`이 누락 없이 들어갔는가 (동시에 `no text`는 없는가)**[cite: 3]
- [ ] 하단 18% 자막용 여백 확보 문구가 FORMAT에 포함되었는가[cite: 3]
- [ ] 키보드 타이핑 손가락 왜곡 방지 키워드(`no distorted fingers or extra fingers on keyboards`)가 들어갔는가
- [ ] D룩(신경망 데이터 스트림)이 시각화가 필요한 장면에만 한정적으로 쓰였는가[cite: 3]