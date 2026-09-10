# -*- coding: utf-8 -*-
"""TubeInsight AI — X (구 Twitter) 공식 API v2 클라이언트 모듈

X 공식 API v2 (https://api.x.com/2/tweets) 연동:
1. 인증 방식:
   - OAuth 1.0a User Context (API Key, API Secret, Access Token, Access Token Secret)
   - OAuth 2.0 Bearer Token (Authorization: Bearer <token>)
2. 기능:
   - 단일 트윗 즉시 발행: POST /2/tweets
   - 순차 타래(Thread Chain) 체이닝 발행: in_reply_to_tweet_id 기반 순차 답글 연결
   - 모의 시뮬레이션(MOCK) 모드 지원 (TWITTER_MOCK=true)
   - 계정 및 인증 상태 검증: GET /2/users/me
"""

import os
import time
import json
import logging
import dotenv

logger = logging.getLogger("twitter_client")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_FILE = os.path.join(BASE_DIR, ".env")
X_API_BASE = "https://api.x.com/2"


def reload_env():
    """최신 .env 파일 환경변수를 다시 로드합니다."""
    if os.path.exists(ENV_FILE):
        dotenv.load_dotenv(ENV_FILE, override=True)


def get_twitter_config():
    """
    .env 및 os.environ에서 X (Twitter) 설정 정보를 가져옵니다.
    """
    reload_env()
    api_key = (os.environ.get("TWITTER_API_KEY") or "").strip()
    api_secret = (os.environ.get("TWITTER_API_SECRET") or "").strip()
    access_token = (os.environ.get("TWITTER_ACCESS_TOKEN") or "").strip()
    access_token_secret = (os.environ.get("TWITTER_ACCESS_TOKEN_SECRET") or "").strip()
    bearer_token = (os.environ.get("TWITTER_BEARER_TOKEN") or "").strip()
    mock_mode = os.environ.get("TWITTER_MOCK", "").lower() in ("true", "1", "yes")

    has_oauth1 = bool(api_key and api_secret and access_token and access_token_secret)
    has_bearer = bool(bearer_token)
    is_configured = has_oauth1 or has_bearer

    return {
        "api_key": api_key,
        "api_secret": api_secret,
        "access_token": access_token,
        "access_token_secret": access_token_secret,
        "bearer_token": bearer_token,
        "mock": mock_mode,
        "is_configured": is_configured,
        "auth_type": "oauth1" if has_oauth1 else ("bearer" if has_bearer else "none")
    }


def is_configured():
    """X 연동 설정 완료 여부를 반환합니다."""
    cfg = get_twitter_config()
    return cfg["mock"] or cfg["is_configured"]


def check_status_summary():
    """서버 status_payload에 포함될 요약 정보를 반환합니다."""
    cfg = get_twitter_config()
    return {
        "configured": is_configured(),
        "mock": cfg["mock"],
        "auth_type": cfg["auth_type"],
        "has_oauth1": bool(cfg["api_key"] and cfg["access_token"]),
        "has_bearer": bool(cfg["bearer_token"])
    }


def set_twitter_config(api_key=None, api_secret=None, access_token=None, access_token_secret=None, bearer_token=None):
    """
    X(Twitter) 설정값을 .env 및 os.environ에 동기화하여 저장합니다.
    """
    lines = []
    if os.path.exists(ENV_FILE):
        try:
            with open(ENV_FILE, "r", encoding="utf-8") as f:
                lines = f.readlines()
        except Exception:
            lines = []

    keys_to_update = {
        "TWITTER_API_KEY": api_key,
        "TWITTER_API_SECRET": api_secret,
        "TWITTER_ACCESS_TOKEN": access_token,
        "TWITTER_ACCESS_TOKEN_SECRET": access_token_secret,
        "TWITTER_BEARER_TOKEN": bearer_token,
    }

    found = {k: False for k in keys_to_update}
    new_lines = []

    for line in lines:
        matched = False
        for k, val in keys_to_update.items():
            if line.strip().startswith(f"{k}="):
                if val is not None:
                    new_lines.append(f"{k}={val.strip()}\n")
                else:
                    new_lines.append(line)
                found[k] = True
                matched = True
                break
        if not matched:
            new_lines.append(line)

    for k, val in keys_to_update.items():
        if not found[k] and val is not None:
            new_lines.append(f"{k}={val.strip()}\n")

    try:
        with open(ENV_FILE, "w", encoding="utf-8") as f:
            f.writelines(new_lines)
    except Exception as e:
        logger.error(f".env 저장 실패: {e}")

    for k, val in keys_to_update.items():
        if val is not None:
            os.environ[k] = val.strip()

    reload_env()
    return check_status_summary()


def _get_auth():
    """requests 호출에 사용할 auth 객체 또는 headers를 반환합니다."""
    cfg = get_twitter_config()
    headers = {"Content-Type": "application/json"}
    auth = None

    if cfg["auth_type"] == "oauth1":
        try:
            from requests_oauthlib import OAuth1
            auth = OAuth1(
                cfg["api_key"],
                cfg["api_secret"],
                cfg["access_token"],
                cfg["access_token_secret"]
            )
        except ImportError:
            logger.warning("requests_oauthlib 미설치 — OAuth1 인증 불가")
    elif cfg["auth_type"] == "bearer":
        headers["Authorization"] = f"Bearer {cfg['bearer_token']}"

    return auth, headers


def check_account_status():
    """
    현재 X API 키/토큰 및 계정 정보를 검증하고 반환합니다.
    GET https://api.x.com/2/users/me
    """
    cfg = get_twitter_config()
    if cfg["mock"]:
        return {
            "status": "success",
            "configured": True,
            "mock": True,
            "user_id": "mock_x_user",
            "username": "tubeinsight_tester",
            "name": "TubeInsight AI",
            "profile_pic": ""
        }

    if not cfg["is_configured"]:
        return {
            "status": "unconfigured",
            "configured": False,
            "message": ".env 파일에 X (Twitter) API 키 또는 토큰이 설정되지 않았습니다."
        }

    import requests
    auth, headers = _get_auth()
    url = f"{X_API_BASE}/users/me"

    try:
        resp = requests.get(url, auth=auth, headers=headers, timeout=10)
        data = resp.json()
    except Exception as e:
        return {
            "status": "error",
            "configured": False,
            "message": f"X API 연결 실패: {e}"
        }

    if resp.status_code == 200 and "data" in data:
        user_info = data["data"]
        return {
            "status": "success",
            "configured": True,
            "mock": False,
            "user_id": user_info.get("id"),
            "username": user_info.get("username"),
            "name": user_info.get("name"),
            "profile_pic": user_info.get("profile_image_url", "")
        }
    else:
        err_detail = "X API 인증에 실패했습니다."
        if isinstance(data, dict):
            if "errors" in data and isinstance(data["errors"], list) and len(data["errors"]) > 0:
                err_detail = data["errors"][0].get("message") or data["errors"][0].get("detail") or str(data["errors"][0])
            elif "detail" in data:
                err_detail = data["detail"]
            elif "title" in data:
                err_detail = data["title"]
        return {
            "status": "error",
            "configured": False,
            "message": err_detail,
            "http_status": resp.status_code,
            "details": data
        }


def publish_single_tweet(text, reply_to_id=None):
    """
    단일 텍스트 트윗을 X(구 Twitter)에 즉시 발행합니다.
    POST https://api.x.com/2/tweets
    
    인자:
      text (str): 트윗 본문 내용
      reply_to_id (str|int|None): 직전 트윗 ID (타래 연결 시)
    반환:
      {"id": str, "text": str, "tweet_url": str, "reply_to_id": str|None}
    """
    clean_text = (text or "").strip()
    if not clean_text:
        raise ValueError("포스팅할 내용이 비어있습니다.")

    cfg = get_twitter_config()

    # MOCK 모드 처리
    if cfg["mock"]:
        fake_id = f"mock_{int(time.time()*1000)}"
        return {
            "status": "success",
            "mock": True,
            "id": fake_id,
            "text": clean_text[:60] + ("..." if len(clean_text) > 60 else ""),
            "tweet_url": f"https://x.com/i/status/{fake_id}",
            "reply_to_id": reply_to_id
        }

    if not cfg["is_configured"]:
        raise RuntimeError(".env 파일에 X (Twitter) API 키/토큰이 설정되지 않았습니다.")

    import requests
    auth, headers = _get_auth()
    url = f"{X_API_BASE}/tweets"

    payload = {"text": clean_text}
    if reply_to_id:
        payload["reply"] = {"in_reply_to_tweet_id": str(reply_to_id)}

    try:
        resp = requests.post(url, json=payload, auth=auth, headers=headers, timeout=15)
        data = resp.json()
    except Exception as e:
        raise RuntimeError(f"X API 네트워크 요청 실패: {e}")

    if resp.status_code in (200, 201) and "data" in data:
        tweet_id = str(data["data"]["id"])
        tweet_url = f"https://x.com/i/status/{tweet_id}"
        return {
            "status": "success",
            "mock": False,
            "id": tweet_id,
            "text": clean_text[:60] + ("..." if len(clean_text) > 60 else ""),
            "tweet_url": tweet_url,
            "reply_to_id": reply_to_id
        }
    else:
        # 에러 핸들링
        err_msg = f"트윗 발행 실패 (HTTP {resp.status_code})"
        if isinstance(data, dict):
            if "errors" in data and isinstance(data["errors"], list) and len(data["errors"]) > 0:
                first_err = data["errors"][0]
                err_msg = first_err.get("message") or first_err.get("detail") or str(first_err)
            elif "detail" in data:
                err_msg = data["detail"]

        if "credits depleted" in err_msg.lower():
            err_msg = "X(Twitter) 개발자 계정의 API 크레딧 잔액이 부족합니다 ($0.00). X Developer Portal 대시보드 우측 상단의 '크레딧 구매하기'에서 소액 충전 후 다시 시도해주세요. (credits depleted)"
        elif resp.status_code == 403 and "duplicate" in err_msg.lower():
            err_msg = "중복된 내용의 트윗입니다. 내용을 약간 변경 후 다시 시도해주세요. (403 Duplicate Content)"
        elif resp.status_code == 401:
            err_msg = "X API 권한이 부족하거나 토큰이 유효하지 않습니다. 개발자 포털에서 'Read and Write' 권한으로 Access Token을 재발급받으세요. (401 Unauthorized)"
        elif resp.status_code == 429:
            err_msg = "X API 호출 한도(Rate Limit)를 초과했습니다. 잠시 후 다시 시도해주세요. (429 Too Many Requests)"

        raise RuntimeError(err_msg)


def publish_tweet_chain(posts, on_progress=None):
    """
    여러 개의 포스트를 1번부터 순차적으로 in_reply_to_tweet_id 체이닝하여 전체 타래(Thread)로 연속 발행합니다.
    
    인자:
      posts (list): [{"text": "..."}, ...] 형식의 포스트 리스트
      on_progress (callable): 단계별 진행률 콜백 (step, pct, msg)
    반환:
      {
        "status": "success",
        "count": int,
        "root_tweet_id": str,
        "root_url": str,
        "results": list
      }
    """
    if not posts or not isinstance(posts, list):
        raise ValueError("발행할 타래 포스트 목록이 비어있습니다.")

    total = len(posts)
    results = []
    prev_tweet_id = None
    root_tweet_id = None
    root_url = ""

    cfg = get_twitter_config()
    logger.info("X 타래 포스팅 시작 (총 %d개, MOCK=%s)", total, cfg["mock"])

    for idx, post in enumerate(posts):
        text = post.get("text", "") if isinstance(post, dict) else str(post)
        step_num = idx + 1
        pct = int((step_num / total) * 100)

        msg = f"𝕏 {step_num}/{total}번 타래 등록 중..."
        logger.info(msg)
        if on_progress:
            on_progress(f"tweet_{step_num}", pct, msg)

        # 직전 트윗 ID로 reply 체이닝
        res = publish_single_tweet(text, reply_to_id=prev_tweet_id)
        current_tweet_id = res["id"]

        if idx == 0:
            root_tweet_id = current_tweet_id
            root_url = res.get("tweet_url", f"https://x.com/i/status/{root_tweet_id}")

        results.append({
            "index": step_num,
            "id": current_tweet_id,
            "url": res.get("tweet_url"),
            "reply_to_id": prev_tweet_id,
            "preview": text[:50] + "..." if len(text) > 50 else text
        })

        prev_tweet_id = current_tweet_id

        # 순서 보장 및 X rate limit 방지를 위해 1.5초 안전 딜레이
        if idx < total - 1:
            time.sleep(1.5)

    if on_progress:
        on_progress("tweet_chain_done", 100, f"𝕏 전체 {total}개 타래 연속 포스팅 완료!")

    return {
        "status": "success",
        "mock": cfg["mock"],
        "count": total,
        "root_tweet_id": root_tweet_id,
        "root_url": root_url,
        "results": results
    }
