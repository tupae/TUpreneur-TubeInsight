# -*- coding: utf-8 -*-
"""TubeInsight AI — Meta Threads API 클라이언트 모듈

Meta Threads Graph API (https://graph.threads.net) 연동:
1. 인증 및 상태 확인: /me
2. 2단계 컨테이너 발행(Two-Step Container Publishing):
   - 1단계: POST /{threads-user-id}/threads (media_type=TEXT, text, reply_to_id)
   - 상태 확인: GET /{container-id}?fields=status,error_message
   - 2단계: POST /{threads-user-id}/threads_publish (creation_id)
3. 순차 타래(Thread Chain) 발행:
   - 1번 포스트: Root 포스트로 발행
   - 2~N번 포스트: 직전 포스트 ID를 reply_to_id로 지정하여 연속 답글 체이닝
"""

import os
import time
import json
import logging
import urllib.parse
import dotenv

logger = logging.getLogger("threads_client")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_FILE = os.path.join(BASE_DIR, ".env")
THREADS_GRAPH_BASE = "https://graph.threads.net/v1.0"


def reload_env():
    """최신 .env 파일 환경변수를 다시 로드합니다."""
    if os.path.exists(ENV_FILE):
        dotenv.load_dotenv(ENV_FILE, override=True)


def get_threads_config():
    """
    .env 및 os.environ에서 Threads 설정 정보를 가져옵니다.
    반환: {"user_id": str, "access_token": str, "mock": bool}
    """
    reload_env()
    user_id = (os.environ.get("THREADS_USER_ID") or "").strip()
    token = (os.environ.get("THREADS_ACCESS_TOKEN") or "").strip()
    mock_mode = os.environ.get("THREADS_MOCK", "").lower() in ("true", "1", "yes")

    return {
        "user_id": user_id,
        "access_token": token,
        "mock": mock_mode,
        "is_configured": bool(token and (user_id or token))
    }


def is_configured():
    """Threads 연동 설정 완료 여부를 반환합니다."""
    cfg = get_threads_config()
    return cfg["mock"] or cfg["is_configured"]


def check_status_summary():
    """서버 status_payload에 포함될 요약 정보를 반환합니다."""
    cfg = get_threads_config()
    return {
        "configured": is_configured(),
        "has_token": bool(cfg["access_token"]),
        "has_user_id": bool(cfg["user_id"]),
        "user_id_masked": (cfg["user_id"][:3] + "..." + cfg["user_id"][-3:]) if len(cfg["user_id"]) > 6 else cfg["user_id"],
        "mock": cfg["mock"]
    }


def set_threads_config(user_id=None, access_token=None):
    """
    Threads 설정값을 .env 및 os.environ에 동기화하여 저장합니다.
    """
    lines = []
    if os.path.exists(ENV_FILE):
        try:
            with open(ENV_FILE, "r", encoding="utf-8") as f:
                lines = f.readlines()
        except Exception:
            lines = []

    found_user = False
    found_token = False
    new_lines = []

    for line in lines:
        if line.strip().startswith("THREADS_USER_ID="):
            if user_id is not None:
                new_lines.append(f"THREADS_USER_ID={user_id.strip()}\n")
            else:
                new_lines.append(line)
            found_user = True
        elif line.strip().startswith("THREADS_ACCESS_TOKEN="):
            if access_token is not None:
                new_lines.append(f"THREADS_ACCESS_TOKEN={access_token.strip()}\n")
            else:
                new_lines.append(line)
            found_token = True
        else:
            new_lines.append(line)

    if not found_user and user_id is not None:
        new_lines.append(f"THREADS_USER_ID={user_id.strip()}\n")
    if not found_token and access_token is not None:
        new_lines.append(f"THREADS_ACCESS_TOKEN={access_token.strip()}\n")

    try:
        with open(ENV_FILE, "w", encoding="utf-8") as f:
            f.writelines(new_lines)
    except Exception as e:
        logger.error(f".env 저장 실패: {e}")

    if user_id is not None:
        os.environ["THREADS_USER_ID"] = user_id.strip()
    if access_token is not None:
        os.environ["THREADS_ACCESS_TOKEN"] = access_token.strip()

    reload_env()
    return check_status_summary()


def _make_http_request(url, method="GET", params=None, data=None, headers=None, timeout=30):
    """표준 HTTP 요청 수행 (requests 우선, urllib fallback)"""
    try:
        import requests
        if method == "GET":
            resp = requests.get(url, params=params, headers=headers, timeout=timeout)
        elif method == "POST":
            resp = requests.post(url, params=params, data=data, json=None, headers=headers, timeout=timeout)
        else:
            raise ValueError(f"지원하지 않는 HTTP 메서드: {method}")
        
        try:
            res_json = resp.json()
        except Exception:
            res_json = {"raw": resp.text}
            
        return resp.status_code, res_json
    except ImportError:
        # urllib fallback
        import urllib.request
        full_url = url
        if params:
            full_url += "?" + urllib.parse.urlencode(params)
        
        req_data = None
        if data:
            req_data = urllib.parse.urlencode(data).encode("utf-8")
            
        req = urllib.request.Request(full_url, data=req_data, method=method)
        if headers:
            for k, v in headers.items():
                req.add_header(k, v)
                
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                body = resp.read().decode("utf-8")
                return resp.status, json.loads(body)
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8")
            try:
                err_json = json.loads(err_body)
            except Exception:
                err_json = {"error": err_body}
            return e.code, err_json


def check_account_status():
    """
    현재 Threads 토큰 및 계정 정보를 검증하고 반환합니다.
    """
    cfg = get_threads_config()
    if cfg["mock"]:
        return {
            "status": "success",
            "configured": True,
            "mock": True,
            "user_id": cfg["user_id"] or "mock_threads_user",
            "username": "tubeinsight_tester",
            "profile_pic": ""
        }

    if not cfg["access_token"]:
        return {
            "status": "unconfigured",
            "configured": False,
            "message": ".env 파일에 THREADS_ACCESS_TOKEN이 설정되지 않았습니다."
        }

    token = cfg["access_token"]
    # Meta Threads me 엔드포인트 호출
    url = f"{THREADS_GRAPH_BASE}/me"
    status_code, data = _make_http_request(
        url,
        method="GET",
        params={"fields": "id,username,threads_profile_picture_url", "access_token": token},
        timeout=10
    )

    if status_code == 200 and "id" in data:
        # .env에 user_id가 없었던 경우 자동으로 감지된 ID 활용
        user_id = data["id"]
        username = data.get("username", "")
        profile_pic = data.get("threads_profile_picture_url", "")
        return {
            "status": "success",
            "configured": True,
            "mock": False,
            "user_id": user_id,
            "username": username,
            "profile_pic": profile_pic
        }
    else:
        err_msg = data.get("error", {}).get("message", "Threads API 토큰 인증에 실패했습니다.")
        return {
            "status": "error",
            "configured": False,
            "message": err_msg,
            "details": data
        }


_CACHED_USER_ID = None


def get_actual_user_id():
    """실제 숫자 Threads User ID를 반환하거나 없으면 'me'를 반환합니다."""
    global _CACHED_USER_ID
    cfg = get_threads_config()
    uid = (cfg.get("user_id") or "").strip()
    if uid and uid != "me":
        return uid
    if _CACHED_USER_ID:
        return _CACHED_USER_ID
    try:
        status = check_account_status()
        if status.get("status") == "success" and status.get("user_id"):
            _CACHED_USER_ID = status["user_id"]
            return _CACHED_USER_ID
    except Exception:
        pass
    return uid or "me"


def create_media_container(text, reply_to_id=None):
    """
    1단계: Threads 미디어 컨테이너(TEXT) 생성
    POST https://graph.threads.net/v1.0/{threads-user-id}/threads
    """
    cfg = get_threads_config()
    if cfg["mock"]:
        fake_id = f"mock_container_{int(time.time()*1000)}"
        return fake_id

    if not cfg["access_token"]:
        raise ValueError("THREADS_ACCESS_TOKEN이 .env에 설정되지 않았습니다.")

    user_id = get_actual_user_id()
    url = f"{THREADS_GRAPH_BASE}/{user_id}/threads"

    payload = {
        "media_type": "TEXT",
        "text": text,
        "access_token": cfg["access_token"]
    }
    if reply_to_id:
        payload["reply_to_id"] = str(reply_to_id)

    status_code, data = _make_http_request(url, method="POST", data=payload, timeout=15)

    if status_code == 200 and "id" in data:
        return data["id"]
    else:
        err_msg = data.get("error", {}).get("message", f"컨테이너 생성 실패 (HTTP {status_code})")
        raise RuntimeError(f"Threads 컨테이너 생성 오류: {err_msg}")


def wait_container_ready(creation_id, max_retries=10, delay_sec=1.5):
    """
    컨테이너 상태가 FINISHED인지 폴링 확인 후,
    Meta 분산 서버 복제 지연을 방지하기 위해 안전 대기 시간을 가집니다.
    GET https://graph.threads.net/v1.0/{creation_id}?fields=status,error_message
    """
    cfg = get_threads_config()
    if cfg["mock"]:
        time.sleep(0.3)
        return True

    url = f"{THREADS_GRAPH_BASE}/{creation_id}"
    token = cfg["access_token"]

    for attempt in range(max_retries):
        status_code, data = _make_http_request(
            url,
            method="GET",
            params={"fields": "status,error_message", "access_token": token},
            timeout=10
        )
        if status_code == 200:
            c_status = data.get("status")
            if c_status == "FINISHED":
                # Meta 백엔드 간 복제 완결을 위해 1.5초 안전 대기
                time.sleep(1.5)
                return True
            elif c_status == "ERROR":
                err = data.get("error_message", "알 수 없는 컨테이너 오류")
                raise RuntimeError(f"Threads 컨테이너 처리 실패: {err}")
        time.sleep(delay_sec)

    # 텍스트 컨테이너의 경우 타임아웃 이후에도 최종 대기 후 발행 시도 허용
    time.sleep(1.5)
    return True


def publish_container(creation_id, max_retries=5, retry_delay=2.5):
    """
    2단계: 준비된 컨테이너 발행(Publish)
    Meta 분산 서버 복제 지연("The requested resource does not exist" 등) 발생 시 자동 재시도
    POST https://graph.threads.net/v1.0/{threads-user-id}/threads_publish
    """
    cfg = get_threads_config()
    if cfg["mock"]:
        fake_media_id = f"mock_post_{int(time.time()*1000)}"
        return fake_media_id

    user_id = get_actual_user_id()
    url = f"{THREADS_GRAPH_BASE}/{user_id}/threads_publish"
    payload = {
        "creation_id": creation_id,
        "access_token": cfg["access_token"]
    }

    last_error = "알 수 없는 오류"
    for attempt in range(max_retries):
        status_code, data = _make_http_request(url, method="POST", data=payload, timeout=15)
        if status_code == 200 and "id" in data:
            return data["id"]

        err_obj = data.get("error", {}) if isinstance(data, dict) else {}
        err_msg = err_obj.get("message", f"발행 실패 (HTTP {status_code})")
        err_code = err_obj.get("code")
        last_error = err_msg

        # "The requested resource does not exist" (OAuthException 24/4279009) 또는 일시적 동기화 지연 시 재시도
        is_transient = (
            "does not exist" in err_msg.lower() or
            "not ready" in err_msg.lower() or
            err_code in (1, 2, 24) or
            status_code in (400, 404, 500, 502, 503)
        )

        if is_transient and attempt < max_retries - 1:
            logger.info("Threads 컨테이너 서버 동기화 대기 중 (%d/%d): %s - %s초 후 재시도", attempt + 1, max_retries, err_msg, retry_delay)
            time.sleep(retry_delay)
            continue
        break

    raise RuntimeError(f"Threads 포스트 발행 오류: {last_error}")


def get_post_permalink(media_id):
    """
    게시물 고유 ID(media_id)의 영구 웹 주소(permalink)를 조회합니다.
    """
    cfg = get_threads_config()
    if cfg["mock"] or str(media_id).startswith("mock_"):
        return f"https://www.threads.net/@tubeinsight_tester/post/{media_id}"

    token = cfg["access_token"]
    url = f"{THREADS_GRAPH_BASE}/{media_id}"
    status_code, data = _make_http_request(
        url,
        method="GET",
        params={"fields": "id,permalink", "access_token": token},
        timeout=10
    )

    if status_code == 200 and "permalink" in data:
        return data["permalink"]
    return f"https://www.threads.net/post/{media_id}"


def publish_single_post(text, reply_to_id=None):
    """
    단일 텍스트 포스트를 Threads에 즉시 발행합니다.
    반환: {"media_id": str, "permalink": str, "text": str, "reply_to_id": str|None}
    """
    clean_text = (text or "").strip()
    if not clean_text:
        raise ValueError("포스팅할 내용이 비어있습니다.")

    if len(clean_text) > 500:
        logger.warning("Threads 글자 수 제한(500자)을 초과했습니다: %d자", len(clean_text))

    # 1단계: 컨테이너 생성
    creation_id = create_media_container(clean_text, reply_to_id=reply_to_id)
    # 상태 대기
    wait_container_ready(creation_id)
    # 2단계: 발행
    media_id = publish_container(creation_id)
    # 퍼머링크 조회
    permalink = get_post_permalink(media_id)

    return {
        "media_id": media_id,
        "permalink": permalink,
        "text": clean_text[:60] + ("..." if len(clean_text) > 60 else ""),
        "reply_to_id": reply_to_id
    }


def publish_thread_chain(posts, on_progress=None):
    """
    여러 개의 포스트를 1번부터 순차적으로 reply_to_id 체이닝하여 전체 타래로 연속 포스팅합니다.
    반환:
    {
        "status": "success",
        "count": int,
        "root_media_id": str,
        "root_permalink": str,
        "posts": [
            {"index": 1, "media_id": "...", "permalink": "..."},
            ...
        ]
    }
    """
    if not posts or not isinstance(posts, list):
        raise ValueError("발행할 타래 포스트 리스트가 없습니다.")

    results = []
    parent_id = None
    total = len(posts)

    for idx, item in enumerate(posts, start=1):
        if isinstance(item, dict):
            p_text = item.get("text", "")
        else:
            p_text = str(item)

        p_text = p_text.strip()
        if not p_text:
            continue

        if on_progress:
            on_progress(idx, total, f"스레드 타래 포스팅 중 ({idx}/{total})...")

        # 1번은 Root(parent_id=None), 2번부터는 직전 post_id를 reply_to_id로 지정
        published = publish_single_post(p_text, reply_to_id=parent_id)
        parent_id = published["media_id"]

        results.append({
            "index": idx,
            "media_id": published["media_id"],
            "permalink": published["permalink"],
            "reply_to_id": published.get("reply_to_id")
        })

        # Threads API 안정성 및 부모 포스트(reply_to_id) 복제 대기를 위해 포스트 간 3.0초 간격 부여
        if idx < total:
            time.sleep(3.0)

    if not results:
        raise ValueError("발행된 포스트가 없습니다.")

    return {
        "status": "success",
        "count": len(results),
        "root_media_id": results[0]["media_id"],
        "root_permalink": results[0]["permalink"],
        "posts": results
    }
