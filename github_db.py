"""
github_db.py  v2
══════════════════════════════════════════════════════════════
قاعدة بيانات مبنية على GitHub — تخزين ثابت ومنظّم

نموذج العمل:
  - قراءة: GitHub أولاً (TTL 60s) → ملف محلي → قيمة افتراضية
  - كتابة: محلي فوراً ← ثم طابور مركزي (coalescing queue) →
           worker واحد يرفع إلى GitHub مع retry/backoff + معالجة 409

ضمانات:
  - لا فقدان للكتابة: آخر قيمة هي التي تُرفع (coalescing)
  - معالجة 409 (conflict): إعادة جلب SHA ثم إعادة المحاولة
  - backoff أسي: 1s → 2s → 4s (3 محاولات)
  - worker thread واحد لكل ملف (لا تسابق على SHA)
══════════════════════════════════════════════════════════════
"""

import os
import json
import base64
import logging
import threading
import time
from collections import defaultdict

import requests as _req

logger = logging.getLogger(__name__)

# ── إعدادات المستودع ────────────────────────────────────────
_REPO   = "anwer1230/Web-browser"
_BRANCH = "main"

def _token():
    return os.environ.get("GITHUB_TOKEN", "")

def _headers():
    t = _token()
    h = {"Accept": "application/vnd.github.v3+json"}
    if t:
        h["Authorization"] = f"token {t}"
    return h

# ── كاش TTL ──────────────────────────────────────────────────
_CACHE: dict = {}           # { repo_path: {"data": any, "ts": float} }
_CACHE_TTL   = 60           # ثانية
_CACHE_LOCK  = threading.Lock()

# ── طابور الحفظ المركزي (coalescing queue) ──────────────────
# لكل ملف: {"data": آخر قيمة, "event": threading.Event}
_QUEUE: dict = {}           # { repo_path: {"pending": any, "local_path": str, "commit_msg": str} }
_QUEUE_LOCK  = threading.Lock()
_WORKERS: dict = {}         # { repo_path: threading.Thread }

# ── قراءة من GitHub ──────────────────────────────────────────

def _gh_get_file(repo_path: str):
    """يُرجع (content_bytes, sha) أو (None, None)"""
    if not _token():
        return None, None
    url = f"https://api.github.com/repos/{_REPO}/contents/{repo_path}"
    try:
        r = _req.get(url, headers=_headers(), params={"ref": _BRANCH}, timeout=10)
        if r.status_code == 200:
            d = r.json()
            raw = d.get("content", "").replace("\n", "")
            sha = d.get("sha")
            return (base64.b64decode(raw) if raw else b"", sha)
        if r.status_code not in (404, 422):
            logger.debug(f"github_db get {repo_path}: HTTP {r.status_code}")
    except Exception as e:
        logger.debug(f"github_db get {repo_path}: {e}")
    return None, None


def gh_load(repo_path: str, local_path: str = None, default=None):
    """
    يحمّل JSON من GitHub (TTL cache) → ملف محلي → قيمة افتراضية.
    يحدّث الملف المحلي بهدوء من GitHub للحفاظ على نسخة حديثة.
    """
    if default is None:
        default = {}
    now = time.time()

    with _CACHE_LOCK:
        cached = _CACHE.get(repo_path)
        if cached and (now - cached["ts"]) < _CACHE_TTL:
            return cached["data"]

    content_bytes, _ = _gh_get_file(repo_path)
    if content_bytes is not None:
        try:
            data = json.loads(content_bytes.decode("utf-8"))
            with _CACHE_LOCK:
                _CACHE[repo_path] = {"data": data, "ts": now}
            if local_path:
                try:
                    os.makedirs(os.path.dirname(local_path), exist_ok=True)
                    with open(local_path, "w", encoding="utf-8") as f:
                        json.dump(data, f, ensure_ascii=False, indent=2)
                except Exception:
                    pass
            return data
        except Exception as e:
            logger.warning(f"github_db load JSON error {repo_path}: {e}")

    if local_path and os.path.exists(local_path):
        try:
            with open(local_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            with _CACHE_LOCK:
                _CACHE[repo_path] = {"data": data, "ts": now}
            return data
        except Exception as e:
            logger.warning(f"github_db load local fallback {local_path}: {e}")

    return default


# ── الكتابة إلى GitHub (worker مع retry + 409 handling) ──────

def _upload_with_retry(repo_path: str, content_bytes: bytes, commit_msg: str,
                       max_retries: int = 3):
    """يرفع الملف مع retry أسي ومعالجة 409 (conflict)."""
    if not _token():
        return
    url = f"https://api.github.com/repos/{_REPO}/contents/{repo_path}"

    for attempt in range(max_retries):
        # دائماً اجلب SHA الحالي قبل كل محاولة لتجنب 409
        _, sha = _gh_get_file(repo_path)

        payload: dict = {
            "message": commit_msg,
            "content": base64.b64encode(content_bytes).decode("utf-8"),
            "branch": _BRANCH,
        }
        if sha:
            payload["sha"] = sha

        try:
            r = _req.put(url, headers=_headers(), json=payload, timeout=30)
            if r.status_code in (200, 201):
                logger.debug(f"github_db ✓ {repo_path} (محاولة {attempt+1})")
                return
            if r.status_code == 409:
                # تعارض — أعد المحاولة مباشرة (SHA تحدّث أعلاه)
                logger.debug(f"github_db 409 conflict {repo_path}, إعادة المحاولة")
                time.sleep(0.5 * (attempt + 1))
                continue
            # 422 أو خطأ آخر
            logger.warning(f"github_db ✗ {repo_path} HTTP {r.status_code}: {r.text[:80]}")
        except Exception as e:
            logger.warning(f"github_db ✗ استثناء {repo_path}: {e}")

        # backoff أسي للأخطاء الشبكية
        if attempt < max_retries - 1:
            time.sleep(2 ** attempt)

    logger.error(f"github_db ✗ فشل رفع {repo_path} بعد {max_retries} محاولات")


def _file_worker(repo_path: str):
    """
    Worker thread واحد لكل ملف.
    ينتظر وجود بيانات معلّقة، يرفعها، ثم يتوقف.
    يدعم coalescing: إذا تراكمت طلبات أثناء الرفع، يرفع آخر قيمة فقط.
    """
    while True:
        with _QUEUE_LOCK:
            entry = _QUEUE.get(repo_path)
            if not entry or entry.get("pending") is _SENTINEL:
                _WORKERS.pop(repo_path, None)
                return
            data      = entry["pending"]
            local_p   = entry["local_path"]
            commit    = entry["commit_msg"]
            # امسح pending — إذا وصل طلب جديد سيُعيَّن مجدداً
            entry["pending"] = _SENTINEL

        content = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
        _upload_with_retry(repo_path, content, commit)

        # تحقق مما إذا جاء طلب جديد أثناء الرفع
        with _QUEUE_LOCK:
            entry = _QUEUE.get(repo_path)
            if not entry or entry.get("pending") is _SENTINEL:
                _WORKERS.pop(repo_path, None)
                return
        # يوجد طلب جديد — استمر في الحلقة


_SENTINEL = object()  # قيمة خاصة تعني "لا يوجد pending"


def gh_save(repo_path: str, local_path: str, data, commit_msg: str = "تحديث بيانات"):
    """
    يحفظ JSON:
    1. محلياً فوراً (غير محجوب).
    2. في الكاش.
    3. يضع البيانات في طابور coalescing → worker واحد يرفعها إلى GitHub.
    """
    content_str = json.dumps(data, ensure_ascii=False, indent=2)
    content_bytes = content_str.encode("utf-8")

    # ── حفظ محلي فوري ────────────────────────────────────────
    if local_path:
        try:
            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            with open(local_path, "w", encoding="utf-8") as f:
                f.write(content_str)
        except Exception as e:
            logger.error(f"github_db local save failed {local_path}: {e}")

    # ── تحديث الكاش ──────────────────────────────────────────
    with _CACHE_LOCK:
        _CACHE[repo_path] = {"data": data, "ts": time.time()}

    # ── إضافة إلى طابور coalescing + بدء worker إذا لزم ──────
    if not _token():
        return

    with _QUEUE_LOCK:
        if repo_path not in _QUEUE:
            _QUEUE[repo_path] = {}
        _QUEUE[repo_path]["pending"]    = data
        _QUEUE[repo_path]["local_path"] = local_path
        _QUEUE[repo_path]["commit_msg"] = commit_msg

        # أنشئ worker جديد فقط إذا لم يكن يعمل
        if repo_path not in _WORKERS or not _WORKERS[repo_path].is_alive():
            t = threading.Thread(
                target=_file_worker,
                args=(repo_path,),
                daemon=True,
                name=f"ghdb-{repo_path.split('/')[-1]}",
            )
            _WORKERS[repo_path] = t
            t.start()


def invalidate(repo_path: str):
    """إبطال الكاش لمسار محدد."""
    with _CACHE_LOCK:
        _CACHE.pop(repo_path, None)


def invalidate_all():
    """إبطال كامل الكاش."""
    with _CACHE_LOCK:
        _CACHE.clear()
