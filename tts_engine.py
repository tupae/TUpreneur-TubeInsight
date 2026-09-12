# 나레이션 TTS 엔진 — Edge-TTS(프리셋) / Qwen3-TTS 보이스 클로닝(선택 설치)
import os
import json
import asyncio
import importlib.util
import threading
import re
import shutil
import zipfile
import numpy as np
import soundfile as sf
import edge_tts
import av

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
VOICES_DIR = os.path.join(DATA_DIR, "voices")
AUDIO_DIR = os.path.join(DATA_DIR, "audio")

os.makedirs(VOICES_DIR, exist_ok=True)
os.makedirs(AUDIO_DIR, exist_ok=True)

SCENE_SECONDS = 8.0          # 씬 하나의 목표 길이
SCENE_TOLERANCE = 0.4        # 이 정도 초과는 허용 (편집 시 여유)
EDGE_CONCURRENCY = 4
SENTENCE_PAUSE_SECONDS = 0.3 # 문장과 문장 사이 간격 (0.3초 쉼)

# 기본 제공 무료 한국어 나레이션 프리셋 (Edge-TTS)
PRESET_VOICES = {
    "ko-KR-InJoonNeural": {
        "id": "ko-KR-InJoonNeural", "name": "인준 — 남성, 차분한 다큐 톤",
        "gender": "male", "style": "신뢰감 있는 다큐멘터리·지식 채널 어조", "default_rate": "+5%",
    },
    "ko-KR-SunHiNeural": {
        "id": "ko-KR-SunHiNeural", "name": "선희 — 여성, 또렷한 뉴스 톤",
        "gender": "female", "style": "전달력 높은 아나운서 어조", "default_rate": "+3%",
    },
    "ko-KR-HyunsuNeural": {
        "id": "ko-KR-HyunsuNeural", "name": "현수 — 남성, 몰입형 스토리텔러",
        "gender": "male", "style": "역동적인 스토리텔링 어조", "default_rate": "+4%",
    },
}


def clone_available():
    """보이스 클로닝(선택 기능)에 필요한 패키지가 설치되어 있는지."""
    return importlib.util.find_spec("torch") is not None and importlib.util.find_spec("qwen_tts") is not None


def load_audio_universal(audio_path, target_sr=24000):
    """WebM, MP3, WAV, M4A, OGG 등 오디오를 24kHz 모노 numpy 배열로 로드합니다."""
    try:
        container = av.open(audio_path)
        resampler = av.AudioResampler(format="s16", layout="mono", rate=target_sr)
        frames = []
        for frame in container.decode(audio=0):
            frame.pts = None
            for resampled in resampler.resample(frame):
                frames.append(resampled.to_ndarray())
        container.close()
        if frames:
            data = np.concatenate(frames, axis=1).squeeze()
            return data.astype(np.float32) / 32768.0, target_sr
    except Exception:
        try:
            data, sr = sf.read(audio_path)
            if data.ndim > 1:
                data = np.mean(data, axis=1)
            return data, sr
        except Exception as e2:
            print(f"오디오 파일 로드 오류: {e2}")
    return None, target_sr


def audio_duration(path):
    """오디오 길이(초). 실패 시 None."""
    try:
        container = av.open(path)
        dur = None
        if container.duration:
            dur = container.duration / av.time_base
        else:
            stream = container.streams.audio[0]
            if stream.duration and stream.time_base:
                dur = float(stream.duration * stream.time_base)
        container.close()
        return round(dur, 2) if dur else None
    except Exception:
        return None


class Qwen3VoiceCloner:
    """
    Qwen3-TTS 제로샷 보이스 클로닝 (torch + qwen-tts 설치 시에만 동작).
    모델 로드와 합성은 잠금으로 직렬화합니다 — 작업 2개가 동시에 로드하면 'meta tensor' 오류로 전부 실패합니다.
    """
    _model = None
    _device = None
    _lock = threading.RLock()

    @classmethod
    def get_model(cls):
        with cls._lock:
            if cls._model is None:
                import torch
                from qwen_tts import Qwen3TTSModel
                cls._device = "mps" if torch.backends.mps.is_available() else "cpu"
                print(f"🔄 Qwen3-TTS 보이스 클로닝 모델 로드 중 ({cls._device})...")
                try:
                    cls._model = Qwen3TTSModel.from_pretrained(
                        "Qwen/Qwen3-TTS-12Hz-0.6B-Base", device_map=cls._device, dtype=torch.float32
                    )
                except Exception as e:
                    print(f"  ⚠️ {cls._device} 로드 실패({e}) → CPU로 재시도")
                    cls._device = "cpu"
                    cls._model = Qwen3TTSModel.from_pretrained("Qwen/Qwen3-TTS-12Hz-0.6B-Base", device_map="cpu", dtype=torch.float32)
                print("✅ Qwen3-TTS 모델 로드 완료")
            return cls._model

    @classmethod
    def clone_voice(cls, text, ref_audio_path, ref_text, output_file):
        with cls._lock:
            try:
                model = cls.get_model()
                wavs, sr = model.generate_voice_clone(text=text, language="Korean", ref_audio=ref_audio_path, ref_text=ref_text)
            except Exception as e:
                if "meta tensor" in str(e):
                    cls._model = None  # 깨진 모델 버리고 한 번 더
                    model = cls.get_model()
                    wavs, sr = model.generate_voice_clone(text=text, language="Korean", ref_audio=ref_audio_path, ref_text=ref_text)
                else:
                    raise
            sf.write(output_file, wavs[0], sr)
            return output_file


class VoiceProfileManager:
    """녹음한 목소리(ref_audio)와 발화 텍스트(ref_text)를 저장·관리합니다."""

    @staticmethod
    def get_profiles_file():
        return os.path.join(VOICES_DIR, "profiles.json")

    @classmethod
    def load_profiles(cls):
        pf = cls.get_profiles_file()
        if os.path.exists(pf):
            try:
                with open(pf, encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                return {}
        return {}

    @classmethod
    def save_profile(cls, profile_id, name, ref_text, audio_filename):
        raw_audio_path = os.path.join(VOICES_DIR, audio_filename)
        clean_audio_filename = f"{profile_id}.clean.wav"
        clean_audio_path = os.path.join(VOICES_DIR, clean_audio_filename)

        data, sr = load_audio_universal(raw_audio_path, target_sr=24000)
        if data is not None and len(data) > 0:
            sf.write(clean_audio_path, data, sr)
        else:
            shutil.copy(raw_audio_path, clean_audio_path)

        profiles = cls.load_profiles()
        profiles[profile_id] = {
            "id": profile_id,
            "name": name,
            "ref_text": ref_text,
            "raw_audio_file": audio_filename,
            "clean_audio_file": clean_audio_filename,
            "duration": audio_duration(clean_audio_path),
            "created_at": os.path.getmtime(clean_audio_path) if os.path.exists(clean_audio_path) else None,
        }
        with open(cls.get_profiles_file(), "w", encoding="utf-8") as f:
            json.dump(profiles, f, ensure_ascii=False, indent=2)
        return profiles[profile_id]

    @classmethod
    def list_all_voices(cls):
        available = clone_available()
        voices = []
        for pid, p in cls.load_profiles().items():
            voices.append({
                "id": f"custom:{pid}",
                "name": f"{p.get('name', '내 목소리')} (내 목소리)",
                "is_custom": True,
                "ref_text": p.get("ref_text", ""),
                "audio_url": f"/data/voices/{p.get('clean_audio_file')}",
                "style": "Qwen3-TTS 보이스 클로닝" if available else "클로닝 패키지 미설치 — 인준 음성으로 대체됩니다",
                "clone_available": available,
            })
        for vid, v in PRESET_VOICES.items():
            voices.append({"id": vid, "name": v["name"], "is_custom": False, "style": v["style"], "default_rate": v["default_rate"]})
        return voices


def clean_narration_text(text):
    """마크다운 기호 등을 제거해 TTS가 읽기 좋은 문장으로 정리."""
    clean = re.sub(r'[*_#`"|\[\]]', " ", text or "")
    clean = re.sub(r"\s+", " ", clean).strip()
    return clean


def split_sentences(text):
    """
    텍스트를 문장 단위(마침표, 물음표, 느낌표 등)로 분리합니다.
    문장 끝 부호(. ? !)는 유지되며, 3.14 같은 숫자의 마침표는 분리되지 않습니다.
    """
    if not text:
        return []
    raw = text.strip()
    # 문장 종결 부호(. ? !) 뒤에 공백이 있거나 문자열 끝인 경우 분리
    parts = re.split(r'((?<=[.?!])(?:\s+|$))', raw)
    sentences = []
    buf = ""
    for p in parts:
        buf += p
        if re.search(r'[.?!](?:\s+|$)', p):
            s = buf.strip()
            if s and len(clean_narration_text(s)) >= 1:
                sentences.append(s)
            buf = ""
    if buf.strip() and len(clean_narration_text(buf)) >= 1:
        sentences.append(buf.strip())

    # 문장 부호 없이 줄바꿈으로만 나뉜 경우 보정
    if len(sentences) <= 1 and "\n" in raw:
        lines = [l.strip() for l in raw.split("\n") if len(clean_narration_text(l)) >= 1]
        if len(lines) > 1:
            sentences = lines

    return sentences if sentences else ([raw] if raw else [])


def concat_audio_with_silence(audio_files, output_file, pause_seconds=SENTENCE_PAUSE_SECONDS, target_sr=24000):
    """
    여러 오디오 파일을 pause_seconds(기본 0.3초) 무음을 사이에 두고 하나의 오디오로 결합합니다.
    """
    if not audio_files:
        return False
    if len(audio_files) == 1:
        if os.path.abspath(audio_files[0]) != os.path.abspath(output_file):
            shutil.copy(audio_files[0], output_file)
        return True

    try:
        combined_data = []
        silence_len = int(target_sr * max(0.0, pause_seconds))
        silence = np.zeros(silence_len, dtype=np.float32)

        for fpath in audio_files:
            if not os.path.exists(fpath) or os.path.getsize(fpath) == 0:
                continue
            data, sr = load_audio_universal(fpath, target_sr=target_sr)
            if data is None or len(data) == 0:
                continue
            if len(combined_data) > 0 and len(silence) > 0:
                combined_data.append(silence)
            combined_data.append(data)

        if not combined_data:
            return False

        final_wave = np.concatenate(combined_data)
        sf.write(output_file, final_wave, target_sr)
        return True
    except Exception as e:
        print(f"오디오 0.3초 무음 결합 오류: {e}")
        return merge_audio_files(audio_files, output_file, target_sr=target_sr, pause_seconds=pause_seconds)


def _resolve_voice(voice_id, rate=None):
    """
    (engine, edge_voice, rate, profile, note) 반환.
    custom 보이스인데 클로닝 패키지가 없거나 프로필이 없으면 Edge-TTS로 대체하고 note에 사유를 남깁니다.
    """
    if voice_id.startswith("custom:"):
        pid = voice_id.split(":", 1)[1]
        profile = VoiceProfileManager.load_profiles().get(pid)
        if profile and clone_available():
            ref_audio = os.path.join(VOICES_DIR, profile.get("clean_audio_file", f"{pid}.clean.wav"))
            if os.path.exists(ref_audio) and profile.get("ref_text"):
                return "qwen3", None, None, {**profile, "ref_audio": ref_audio}, None
            note = "목소리 프로필의 참조 음성/문장이 없어 기본 음성으로 대체했습니다."
        elif profile:
            note = "보이스 클로닝 패키지(torch, qwen-tts)가 설치되지 않아 기본 음성으로 대체했습니다."
        else:
            note = "목소리 프로필을 찾을 수 없어 기본 음성으로 대체했습니다."
        fallback = "ko-KR-InJoonNeural"
        return "edge", fallback, rate or PRESET_VOICES[fallback]["default_rate"], None, note

    preset = PRESET_VOICES.get(voice_id) or PRESET_VOICES["ko-KR-InJoonNeural"]
    return "edge", preset["id"], rate or preset["default_rate"], None, None


async def _edge_save(text, voice, rate, path):
    communicate = edge_tts.Communicate(text, voice, rate=rate)
    await communicate.save(path)


async def _edge_save_sentences(sentences, voice, rate, output_file, pause_seconds=SENTENCE_PAUSE_SECONDS):
    """여러 문장을 Edge-TTS로 합성 후 문장 사이에 pause_seconds(기본 0.3초) 무음을 삽입하여 저장."""
    if not sentences:
        return False
    if len(sentences) == 1:
        await _edge_save(sentences[0], voice, rate, output_file)
        return True

    tmp_files = []
    base, _ = os.path.splitext(output_file)
    try:
        for idx, s in enumerate(sentences):
            tmp_p = f"{base}_part_{idx}.mp3"
            tmp_files.append(tmp_p)
            await _edge_save(s, voice, rate, tmp_p)
        concat_audio_with_silence(tmp_files, output_file, pause_seconds=pause_seconds)
        return True
    finally:
        for tmp_p in tmp_files:
            if os.path.exists(tmp_p):
                try:
                    os.remove(tmp_p)
                except Exception:
                    pass


def generate_scene_audio(text, voice_id="ko-KR-InJoonNeural", rate=None, output_file="output.mp3", pause_seconds=0.0):
    """단일 문장/씬 합성. pause_seconds > 0일 경우(쇼츠) 문장 사이에 무음을 삽입하고, 그렇지 않으면 원래대로 단일 합성."""
    clean_text = clean_narration_text(text)
    if len(clean_text) < 2:
        return None
    engine, edge_voice, edge_rate, profile, _ = _resolve_voice(voice_id, rate)
    sentences = split_sentences(clean_text) if pause_seconds > 0 else [clean_text]

    if engine == "qwen3":
        try:
            if len(sentences) <= 1:
                return Qwen3VoiceCloner.clone_voice(clean_text, profile["ref_audio"], profile["ref_text"], output_file)
            else:
                tmp_files = []
                base, _ = os.path.splitext(output_file)
                try:
                    for idx, s in enumerate(sentences):
                        tmp_p = f"{base}_part_{idx}.wav"
                        tmp_files.append(tmp_p)
                        Qwen3VoiceCloner.clone_voice(s, profile["ref_audio"], profile["ref_text"], tmp_p)
                    concat_audio_with_silence(tmp_files, output_file, pause_seconds=pause_seconds)
                    return output_file
                finally:
                    for tmp_p in tmp_files:
                        if os.path.exists(tmp_p):
                            try:
                                os.remove(tmp_p)
                            except Exception:
                                pass
        except Exception as e:
            print(f"보이스 클로닝 실패 → Edge-TTS로 대체: {e}")
            edge_voice, edge_rate = "ko-KR-InJoonNeural", PRESET_VOICES["ko-KR-InJoonNeural"]["default_rate"]

    if len(sentences) <= 1:
        asyncio.run(_edge_save(clean_text, edge_voice, edge_rate, output_file))
    else:
        asyncio.run(_edge_save_sentences(sentences, edge_voice, edge_rate, output_file, pause_seconds=pause_seconds))
    return output_file


def merge_audio_files(input_files, output_file, target_sr=24000, pause_seconds=0.0):
    """여러 MP3를 하나로 재인코딩 병합 (pause_seconds > 0일 때 파일 사이에 무음 삽입)."""
    try:
        out = av.open(output_file, mode="w")
        out_stream = out.add_stream("mp3", rate=target_sr)
        resampler = av.AudioResampler(format="s16", layout="stereo", rate=target_sr)

        silence_samples = int(target_sr * max(0.0, pause_seconds)) if pause_seconds > 0 else 0
        silence_frame = None
        if silence_samples > 0:
            silence_arr = np.zeros((2, silence_samples), dtype=np.int16)
            silence_frame = av.AudioFrame.from_ndarray(silence_arr, format="s16", layout="stereo")
            silence_frame.sample_rate = target_sr

        first = True
        for fpath in input_files:
            if not os.path.exists(fpath) or os.path.getsize(fpath) == 0:
                continue
            if not first and silence_frame is not None:
                silence_frame.pts = None
                for packet in out_stream.encode(silence_frame):
                    out.mux(packet)
            first = False

            container = av.open(fpath)
            for frame in container.decode(audio=0):
                frame.pts = None
                for rf in resampler.resample(frame):
                    for packet in out_stream.encode(rf):
                        out.mux(packet)
            container.close()
        for packet in out_stream.encode(None):
            out.mux(packet)
        out.close()
        return True
    except Exception as e:
        print(f"  ⚠️ 오디오 병합 실패 — 단순 결합으로 대체: {e}")
        return False


def generate_all_scenes_audio(scenes, plan_id, voice_id="ko-KR-InJoonNeural", rate=None, progress_callback=None, pause_seconds=0.0):
    """
    씬 리스트를 받아 씬별 MP3, 전체 병합본, ZIP을 생성합니다.
    - pause_seconds > 0 (쇼츠): 문장과 문장 사이 0.3초 무음 삽입
    - pause_seconds == 0 (표준·미드폼·롱폼): 원래 그대로 단일 합성 유지
    - 프리셋 보이스는 병렬 합성, 씬 하나가 실패해도 나머지는 계속
    - 각 씬의 실제 길이를 재서 8초 초과 씬에 over_limit 표시
    - 결과에 사용된 엔진(edge/qwen3)과 대체 사유(note)를 포함
    """
    safe_id = re.sub(r'[\/\\:*?"<>|]', "_", plan_id)[:60]
    topic_audio_dir = os.path.join(AUDIO_DIR, safe_id)
    os.makedirs(topic_audio_dir, exist_ok=True)

    engine, edge_voice, edge_rate, profile, note = _resolve_voice(voice_id, rate)
    results = []
    edge_batch = []  # (idx, sentences, path)

    for i, scene in enumerate(scenes, 1):
        scene_num = int(scene.get("scene_num", i))
        subtitle_text = scene.get("subtitle") or scene.get("narration") or ""
        time_range = scene.get("time_range", f"씬 {i}")
        clean_text = clean_narration_text(subtitle_text)
        out_path = os.path.join(topic_audio_dir, f"scene_{scene_num:02d}.mp3")

        item = {
            "scene_num": scene_num, "time_range": time_range, "subtitle": subtitle_text,
            "audio_url": None, "audio_file": out_path, "duration": None, "over_limit": False, "error": None,
        }
        results.append(item)

        if len(clean_text) < 2:
            item["error"] = "대본이 비어 있어 건너뜀"
            continue

        # pause_seconds > 0 (쇼츠)일 때만 문장 분리, 일반 영상은 원래 그대로 단일 처리
        sentences = split_sentences(clean_text) if pause_seconds > 0 else [clean_text]

        if engine == "edge":
            edge_batch.append((len(results) - 1, sentences, out_path))
        else:
            if progress_callback:
                progress_callback("audio", f"씬 {scene_num} 내 목소리로 합성 중...")
            try:
                if len(sentences) <= 1:
                    Qwen3VoiceCloner.clone_voice(clean_text, profile["ref_audio"], profile["ref_text"], out_path)
                else:
                    tmp_files = []
                    base, _ = os.path.splitext(out_path)
                    try:
                        for idx, s in enumerate(sentences):
                            tmp_p = f"{base}_part_{idx}.wav"
                            tmp_files.append(tmp_p)
                            Qwen3VoiceCloner.clone_voice(s, profile["ref_audio"], profile["ref_text"], tmp_p)
                        concat_audio_with_silence(tmp_files, out_path, pause_seconds=pause_seconds)
                    finally:
                        for tmp_p in tmp_files:
                            if os.path.exists(tmp_p):
                                try:
                                    os.remove(tmp_p)
                                except Exception:
                                    pass
            except Exception as e:
                print(f"  ⚠️ 씬 {scene_num} 클로닝 실패({str(e)[:120]}) → 기본 음성으로 대체")
                try:
                    fb = PRESET_VOICES["ko-KR-InJoonNeural"]
                    asyncio.run(_edge_save_sentences(sentences, fb["id"], fb["default_rate"], out_path, pause_seconds=pause_seconds))
                    item["fallback"] = f"클로닝 실패로 기본 음성 대체: {str(e)[:120]}"
                except Exception as e2:
                    item["error"] = f"보이스 클로닝 실패: {str(e)[:150]} / 대체 합성도 실패: {e2}"

    if edge_batch:
        if progress_callback:
            progress_callback("audio", f"나레이션 {len(edge_batch)}개 씬 합성 중 ({edge_voice})...")

        async def _run_batch():
            sem = asyncio.Semaphore(EDGE_CONCURRENCY)

            async def _one(s_list, path):
                async with sem:
                    if len(s_list) <= 1:
                        await _edge_save(s_list[0], edge_voice, edge_rate, path)
                    else:
                        await _edge_save_sentences(s_list, edge_voice, edge_rate, path, pause_seconds=pause_seconds)

            return await asyncio.gather(*[_one(s_list, p) for _, s_list, p in edge_batch], return_exceptions=True)

        outcomes = asyncio.run(_run_batch())
        for (idx, _, _), outcome in zip(edge_batch, outcomes):
            if isinstance(outcome, Exception):
                results[idx]["error"] = f"합성 실패: {outcome}"

    # 결과 확정: 파일이 실제로 있는 씬만 URL 부여 + 길이 측정
    merge_list = []
    for item in results:
        if item["error"] or not os.path.exists(item["audio_file"]) or os.path.getsize(item["audio_file"]) == 0:
            if not item["error"]:
                item["error"] = "오디오 파일이 생성되지 않음"
            continue
        item["audio_url"] = f"/data/audio/{safe_id}/{os.path.basename(item['audio_file'])}"
        item["duration"] = audio_duration(item["audio_file"])
        target = float(next((s.get("seconds") for s in scenes if int(s.get("scene_num", 0)) == item["scene_num"] and s.get("seconds")), SCENE_SECONDS))
        item["over_limit"] = bool(item["duration"] and item["duration"] > target + SCENE_TOLERANCE)
        merge_list.append(item["audio_file"])

    full_path = os.path.join(topic_audio_dir, "full_narration.mp3")
    full_url = None
    if merge_list:
        if not merge_audio_files(merge_list, full_path, pause_seconds=SENTENCE_PAUSE_SECONDS):
            with open(full_path, "wb") as outfile:
                for fpath in merge_list:
                    with open(fpath, "rb") as infile:
                        outfile.write(infile.read())
        full_url = f"/data/audio/{safe_id}/full_narration.mp3"

    # ZIP: 전체 병합본 + 씬별 파일 + 대본 텍스트
    zip_name = "나레이션_전체.zip"
    zip_path = os.path.join(topic_audio_dir, zip_name)
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        def add(file_path, arcname):
            if os.path.exists(file_path):
                zinfo = zipfile.ZipInfo.from_file(file_path, arcname=arcname)
                zinfo.flag_bits |= 0x800  # UTF-8 파일명
                with open(file_path, "rb") as f:
                    zipf.writestr(zinfo, f.read())

        if full_url:
            add(full_path, "00_전체_나레이션.mp3")
        for item in results:
            if item["audio_url"]:
                tag = item["time_range"].replace(" ", "").replace("~", "-")
                add(item["audio_file"], f"{item['scene_num']:02d}_씬{item['scene_num']:02d}_{tag}.mp3")

        lines = [f"[{plan_id}] 8초 씬별 나레이션 대본", "=" * 50, ""]
        for item in results:
            dur = f" ({item['duration']}초{' ⚠ 8초 초과' if item['over_limit'] else ''})" if item["duration"] else ""
            lines.append(f"[씬 {item['scene_num']:02d}] {item['time_range']}{dur}")
            lines.append(item["subtitle"] or "(대본 없음)")
            lines.append("")
        zinfo = zipfile.ZipInfo("대본_및_타임스탬프.txt")
        zinfo.flag_bits |= 0x800
        zipf.writestr(zinfo, "\n".join(lines).encode("utf-8"))

    over = [it["scene_num"] for it in results if it["over_limit"]]
    failed = [it["scene_num"] for it in results if it["error"] and it["subtitle"]]
    fallbacks = [it["scene_num"] for it in results if it.get("fallback")]
    if fallbacks and not note:
        note = f"씬 {', '.join(map(str, fallbacks))}: 내 목소리 합성이 실패해 기본 음성(인준)으로 대체했습니다."
    return {
        "plan_id": plan_id,
        "voice_id": voice_id,
        "engine": engine,
        "engine_note": note,
        "scenes_audio": results,
        "full_audio_url": full_url,
        "zip_download_url": f"/data/audio/{safe_id}/{zip_name}",
        "over_limit_scenes": over,
        "failed_scenes": failed,
    }


if __name__ == "__main__":
    out = generate_scene_audio("지하 50층 깊이, 인간의 손길이 닿지 않은 곳. 이곳은 단순한 건축물이 아닙니다.",
                               output_file=os.path.join(AUDIO_DIR, "test_narration.mp3"))
    print("테스트 오디오:", out, audio_duration(out), "초")
