"""
╔══════════════════════════════════════════════════════════════╗
║   نظام تسجيل الدخول وإدارة الجلسات لكل مستخدم بشكل منفصل   ║
║            مركز سرعة انجاز - وحدة المصادقة المستقلة          ║
╚══════════════════════════════════════════════════════════════╝
"""

import os
import json
import asyncio
import logging
import threading

import threading as _threading
_OSThread = _threading.Thread

from telethon import TelegramClient
from telethon.sessions import StringSession

logger = logging.getLogger('auth')

# ── إعدادات Telegram API ─────────────────────────────────────
API_ID   = '22043994'
API_HASH = '56f64582b363d367280db96586b97801'

# ── مسار مجلد الجلسات ──────────────────────────────────────
SESSIONS_DIR = os.path.join('/tmp', 'sessions') if os.environ.get('RENDER') else "sessions"
if not os.path.exists(SESSIONS_DIR):
    os.makedirs(SESSIONS_DIR, exist_ok=True)


# ══════════════════════════════════════════════════════════
#  وظائف إدارة ملفات الجلسة — كل مستخدم له مجلده الخاص
# ══════════════════════════════════════════════════════════

def get_user_session_dir(user_id: str) -> str:
    """إرجاع مسار المجلد الخاص بالمستخدم، ويُنشئه إن لم يكن موجوداً"""
    user_dir = os.path.join(SESSIONS_DIR, str(user_id))
    os.makedirs(user_dir, exist_ok=True)
    return user_dir


def save_settings(user_id: str, settings: dict) -> bool:
    """حفظ إعدادات المستخدم في مجلده الخاص + نسخة احتياطية"""
    try:
        user_dir = get_user_session_dir(user_id)
        path = os.path.join(user_dir, "settings.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(settings, f, ensure_ascii=False, indent=4)
        # نسخة احتياطية للتوافق مع الكود القديم
        legacy_path = os.path.join(SESSIONS_DIR, f"{user_id}.json")
        with open(legacy_path, "w", encoding="utf-8") as f:
            json.dump(settings, f, ensure_ascii=False, indent=4)
        return True
    except Exception as e:
        logger.error(f"Error saving settings for {user_id}: {e}")
        return False


def load_settings(user_id: str) -> dict:
    """تحميل إعدادات المستخدم — يبحث أولاً في مجلده، ثم الملف القديم"""
    try:
        user_dir = get_user_session_dir(user_id)
        path = os.path.join(user_dir, "settings.json")
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        # fallback للملف القديم
        legacy_path = os.path.join(SESSIONS_DIR, f"{user_id}.json")
        if os.path.exists(legacy_path):
            with open(legacy_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            save_settings(user_id, data)   # ترحيل للمجلد الجديد
            return data
        return {}
    except Exception as e:
        logger.error(f"Error loading settings for {user_id}: {e}")
        return {}


def clear_user_session(user_id: str) -> bool:
    """حذف جميع ملفات الجلسة الخاصة بالمستخدم"""
    try:
        import shutil
        user_dir = get_user_session_dir(user_id)
        if os.path.exists(user_dir):
            shutil.rmtree(user_dir)
        for suffix in [".json", "_session.session", "_string.txt"]:
            p = os.path.join(SESSIONS_DIR, f"{user_id}{suffix}")
            if os.path.exists(p):
                os.remove(p)
        logger.info(f"Cleared session for {user_id}")
        return True
    except Exception as e:
        logger.error(f"Error clearing session for {user_id}: {e}")
        return False


def save_string_session(user_id: str, session_str: str) -> None:
    """حفظ سلسلة StringSession في ملف نصي خاص بالمستخدم"""
    try:
        os.makedirs(SESSIONS_DIR, exist_ok=True)
        path = os.path.join(SESSIONS_DIR, f"{user_id}_string.txt")
        with open(path, 'w') as f:
            f.write(session_str)
        logger.info(f"Saved StringSession for {user_id}")
    except Exception as e:
        logger.error(f"Failed to save StringSession for {user_id}: {e}")


def load_string_session(user_id: str):
    """تحميل سلسلة StringSession من الملف"""
    try:
        path = os.path.join(SESSIONS_DIR, f"{user_id}_string.txt")
        if os.path.exists(path):
            with open(path, 'r') as f:
                val = f.read().strip()
            if val:
                logger.info(f"Loaded StringSession for {user_id}")
                return val
    except Exception as e:
        logger.error(f"Failed to load StringSession for {user_id}: {e}")
    return None


# ══════════════════════════════════════════════════════════
#  TelegramLogin — نظام تسجيل الدخول المستقل لكل مستخدم
# ══════════════════════════════════════════════════════════

class TelegramLogin:
    """
    كائن مستقل لكل مستخدم يدير دورة حياة تسجيل الدخول بالكامل:
      1. إرسال كود التحقق
      2. التحقق من الكود
      3. التحقق الثنائي (2FA) إن وُجد
      4. تسجيل الخروج
    الجلسات محفوظة في مجلد خاص بكل مستخدم لعزلها تماماً.
    """

    def __init__(self, user_id: str):
        self.user_id           = user_id
        self.client            = None
        self.loop              = None
        self.thread            = None
        self.is_ready          = threading.Event()
        self.phone_code_hash   = None
        self.authenticated     = False
        self.connected         = False
        self.awaiting_code     = False
        self.awaiting_password = False
        self.phone_number      = None

    # ── الدورة الداخلية ────────────────────────────────────

    def _run_loop(self):
        """تشغيل حلقة asyncio في OS thread حقيقي — تبقى حية للأبد"""
        self.loop   = asyncio.new_event_loop()
        self.client = TelegramClient(StringSession(), int(API_ID), API_HASH)
        self.loop.run_until_complete(self._connect())
        try:
            self.loop.run_forever()
        finally:
            if not self.loop.is_closed():
                self.loop.close()

    async def _connect(self):
        """الاتصال بخوادم تيليجرام وضبط الحالة"""
        await self.client.connect()
        try:
            self.authenticated = await self.client.is_user_authorized()
        except Exception:
            self.authenticated = False
        self.connected = self.client.is_connected()
        self.is_ready.set()

    # ── الواجهة العامة ─────────────────────────────────────

    def start(self) -> bool:
        """بدء تشغيل العميل في OS thread حقيقي"""
        self.thread = _OSThread(target=self._run_loop, daemon=True)
        self.thread.start()
        return self.is_ready.wait(timeout=30)

    def stop(self):
        """إيقاف العميل وإنهاء الـ loop"""
        if self.loop and self.loop.is_running():
            if self.client:
                try:
                    asyncio.run_coroutine_threadsafe(
                        self.client.disconnect(), self.loop
                    ).result(timeout=5)
                except Exception:
                    pass
            self.loop.call_soon_threadsafe(self.loop.stop)

    def send_code(self, phone_number: str) -> dict:
        """الخطوة 1: إرسال كود التحقق إلى رقم الهاتف"""
        if not self.client or not self.client.is_connected():
            return {"success": False, "message": "العميل غير متصل"}
        try:
            future = asyncio.run_coroutine_threadsafe(
                self.client.send_code_request(phone_number), self.loop
            )
            result = future.result(timeout=30)
            self.phone_number      = phone_number
            self.phone_code_hash   = result.phone_code_hash
            self.awaiting_code     = True
            self.authenticated     = False
            return {
                "success": True,
                "message": "✅ تم إرسال الكود إلى هاتفك",
                "phone_code_hash": self.phone_code_hash
            }
        except Exception as e:
            error_msg = str(e)
            if "FLOOD_WAIT" in error_msg:
                return {"success": False, "message": "⏱️ انتظر قليلاً ثم حاول مرة أخرى"}
            return {"success": False, "message": f"❌ فشل إرسال الكود: {error_msg}"}

    def verify_code(self, code: str) -> dict:
        """الخطوة 2: التحقق من الكود المرسل"""
        if not self.phone_code_hash:
            return {"success": False, "message": "لم يتم طلب كود بعد. أرسل الكود أولاً"}
        if not self.client or not self.client.is_connected():
            return {"success": False, "message": "العميل غير متصل"}
        try:
            future = asyncio.run_coroutine_threadsafe(
                self.client.sign_in(
                    phone=self.phone_number,
                    code=code,
                    phone_code_hash=self.phone_code_hash
                ),
                self.loop
            )
            future.result(timeout=30)
            self.awaiting_code = False
            self.authenticated = True
            # حفظ الجلسة فوراً
            try:
                save_string_session(self.user_id, self.client.session.save())
            except Exception as _se:
                logger.error(f"Could not save session string: {_se}")
            me_future = asyncio.run_coroutine_threadsafe(self.client.get_me(), self.loop)
            me = me_future.result(timeout=30)
            return {
                "success": True,
                "message": "✅ تم تسجيل الدخول بنجاح",
                "user": {
                    "id":         me.id,
                    "first_name": me.first_name,
                    "last_name":  me.last_name,
                    "username":   me.username,
                    "phone":      me.phone,
                    "full_name":  f"{me.first_name or ''} {me.last_name or ''}".strip()
                }
            }
        except Exception as e:
            error_msg = str(e)
            if "PASSWORD" in error_msg.upper() or "SESSION_PASSWORD_NEEDED" in error_msg:
                self.awaiting_password = True
                self.awaiting_code     = False
                return {
                    "success": False,
                    "requires_password": True,
                    "message": "🔐 هذا الحساب محمي بالتحقق بخطوتين. الرجاء إدخال كلمة المرور"
                }
            return {"success": False, "message": f"❌ كود غير صحيح: {error_msg}"}

    def verify_password(self, password: str) -> dict:
        """الخطوة 3: إدخال كلمة مرور التحقق الثنائي (2FA)"""
        if not self.awaiting_password:
            if self.authenticated and self.client and self.client.is_connected():
                try:
                    me_future = asyncio.run_coroutine_threadsafe(self.client.get_me(), self.loop)
                    me = me_future.result(timeout=15)
                    return {
                        "success": True,
                        "message": "✅ تم تسجيل الدخول بنجاح",
                        "user": {
                            "id":         me.id,
                            "first_name": me.first_name,
                            "last_name":  me.last_name,
                            "username":   me.username,
                            "phone":      me.phone,
                            "full_name":  f"{me.first_name or ''} {me.last_name or ''}".strip()
                        }
                    }
                except Exception:
                    pass
            return {"success": False, "message": "الحساب لا يتطلب رمز تحقق ثانوي"}
        if not self.client or not self.client.is_connected():
            return {"success": False, "message": "العميل غير متصل"}
        try:
            future = asyncio.run_coroutine_threadsafe(
                self.client.sign_in(password=password), self.loop
            )
            future.result(timeout=45)
            self.awaiting_password = False
            self.authenticated     = True
            # حفظ الجلسة فوراً
            try:
                save_string_session(self.user_id, self.client.session.save())
            except Exception as _se:
                logger.error(f"Could not save session string (2FA): {_se}")
            me_future = asyncio.run_coroutine_threadsafe(self.client.get_me(), self.loop)
            me = me_future.result(timeout=30)
            return {
                "success": True,
                "message": "✅ تم تسجيل الدخول بنجاح",
                "user": {
                    "id":         me.id,
                    "first_name": me.first_name,
                    "last_name":  me.last_name,
                    "username":   me.username,
                    "phone":      me.phone,
                    "full_name":  f"{me.first_name or ''} {me.last_name or ''}".strip()
                }
            }
        except Exception as e:
            err = str(e)
            if "password" in err.lower() or "invalid" in err.lower():
                return {"success": False, "message": f"❌ كلمة مرور غير صحيحة: {err}"}
            return {"success": False, "message": f"❌ خطأ في التحقق: {err}"}

    def get_login_status(self) -> dict:
        """الحصول على حالة تسجيل الدخول الحالية للمستخدم"""
        status = {
            "authenticated":     self.authenticated,
            "awaiting_code":     self.awaiting_code,
            "awaiting_password": self.awaiting_password,
            "connected":         self.connected,
            "phone_number":      self.phone_number,
            "user":              None
        }
        if self.authenticated and self.client and self.client.is_connected():
            try:
                future = asyncio.run_coroutine_threadsafe(self.client.get_me(), self.loop)
                me = future.result(timeout=10)
                status["user"] = {
                    "id":         me.id,
                    "first_name": me.first_name,
                    "last_name":  me.last_name,
                    "username":   me.username,
                    "phone":      me.phone,
                    "full_name":  f"{me.first_name or ''} {me.last_name or ''}".strip()
                }
            except Exception:
                pass
        return status

    def logout(self) -> dict:
        """تسجيل الخروج من الحساب الحالي وحذف ملفات الجلسة"""
        try:
            if self.client and self.loop and self.client.is_connected():
                future = asyncio.run_coroutine_threadsafe(
                    self.client.log_out(), self.loop
                )
                future.result(timeout=30)
            session_file = os.path.join(SESSIONS_DIR, f"{self.user_id}_session.session")
            if os.path.exists(session_file):
                os.remove(session_file)
            self.authenticated     = False
            self.awaiting_code     = False
            self.awaiting_password = False
            self.phone_number      = None
            self.phone_code_hash   = None
            return {"success": True, "message": "✅ تم تسجيل الخروج بنجاح"}
        except Exception as e:
            return {"success": False, "message": f"❌ خطأ في تسجيل الخروج: {str(e)}"}


# ═══════════════════════════════════════════════════════════════════════════════
#  نظام المستخدمين الديناميكي + حسابات تسجيل الدخول  (يُضاف في نهاية auth.py)
# ═══════════════════════════════════════════════════════════════════════════════

import hashlib as _hashlib
import base64 as _base64
import json as _json

try:
    import requests as _requests
    _REQUESTS_OK = True
except ImportError:
    _REQUESTS_OK = False

# ── مسار مجلد البيانات ──────────────────────────────────────
_DYN_DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
os.makedirs(_DYN_DATA_DIR, exist_ok=True)
_DYNAMIC_USERS_FILE  = os.path.join(_DYN_DATA_DIR, "dyn_users.json")
_USER_ACCOUNTS_FILE  = os.path.join(_DYN_DATA_DIR, "user_accounts.json")

# ── دوال GitHub ──────────────────────────────────────────────

def _dyn_gh_headers(token):
    return {"Authorization": f"token {token}", "Accept": "application/vnd.github.v3+json"}

def _dyn_upload_github(file_path, content_bytes, token, repo, branch, message="تحديث"):
    if not token or not _REQUESTS_OK:
        return False
    url  = f"https://api.github.com/repos/{repo}/contents/{file_path}"
    hdrs = _dyn_gh_headers(token)
    sha  = None
    try:
        r = _requests.get(url, headers=hdrs, timeout=10)
        if r.status_code == 200:
            sha = r.json().get("sha")
    except Exception:
        pass
    body = {"message": message, "content": _base64.b64encode(content_bytes).decode(), "branch": branch}
    if sha:
        body["sha"] = sha
    try:
        r = _requests.put(url, headers=hdrs, json=body, timeout=20)
        return r.status_code in (200, 201)
    except Exception:
        return False

def _dyn_download_github(file_path, token, repo, branch):
    if not token or not _REQUESTS_OK:
        return None
    url  = f"https://api.github.com/repos/{repo}/contents/{file_path}?ref={branch}"
    hdrs = _dyn_gh_headers(token)
    try:
        r = _requests.get(url, headers=hdrs, timeout=10)
        if r.status_code == 200:
            b64 = r.json().get("content", "").replace("\n", "")
            if b64:
                return _base64.b64decode(b64)
    except Exception:
        pass
    return None

def _dyn_github_params():
    token  = os.environ.get("GITHUB_TOKEN", "")
    repo   = os.environ.get("GITHUB_REPO", "anwer1230/Web-browser")
    branch = os.environ.get("GITHUB_BRANCH", "main")
    return token, repo, branch

# ── المستخدمون الثابتون الافتراضيون ──────────────────────────

_DEFAULT_PREDEFINED_USERS = {}

_DYN_USERS_LOCK = __import__('threading').Lock()

# ── ذاكرة مؤقتة للمستخدمين (TTL 30 ثانية) لتقليل طلبات GitHub ──────────────
_DYN_USERS_CACHE      = None   # القاموس المخزّن مؤقتاً
_DYN_USERS_CACHE_TS   = 0.0    # وقت آخر تحميل (time.time())
_DYN_USERS_CACHE_TTL  = 30     # ثواني قبل إعادة التحميل

def invalidate_dynamic_users_cache():
    """إبطال الذاكرة المؤقتة فوراً — يستخدم بعد الحفظ مباشرةً"""
    global _DYN_USERS_CACHE, _DYN_USERS_CACHE_TS
    import time as _time
    with _DYN_USERS_LOCK:
        _DYN_USERS_CACHE    = None
        _DYN_USERS_CACHE_TS = 0.0

def load_dynamic_users():
    """تحميل قائمة المستخدمين — مع ذاكرة مؤقتة TTL=30s لتقليل طلبات GitHub"""
    global _DYN_USERS_CACHE, _DYN_USERS_CACHE_TS
    import time as _time
    with _DYN_USERS_LOCK:
        now = _time.time()
        # إعادة استخدام الذاكرة المؤقتة إذا لم تنتهِ صلاحيتها
        if _DYN_USERS_CACHE and (now - _DYN_USERS_CACHE_TS) < _DYN_USERS_CACHE_TTL:
            return dict(_DYN_USERS_CACHE)

        token, repo, branch = _dyn_github_params()
        content = _dyn_download_github("data/dyn_users.json", token, repo, branch)
        if content:
            try:
                data = _json.loads(content.decode('utf-8'))
                users = data.get("users", {})
                if users:
                    try:
                        with open(_DYNAMIC_USERS_FILE, 'w', encoding='utf-8') as f:
                            _json.dump({"users": users}, f, ensure_ascii=False, indent=2)
                    except Exception:
                        pass
                    _DYN_USERS_CACHE    = dict(users)
                    _DYN_USERS_CACHE_TS = now
                    return users
            except Exception:
                pass
        # محاولة القراءة من الملف المحلي (أسرع وأضمن بعد الحفظ المباشر)
        if os.path.exists(_DYNAMIC_USERS_FILE):
            try:
                with open(_DYNAMIC_USERS_FILE, 'r', encoding='utf-8') as f:
                    data = _json.load(f)
                    users = data.get("users", {})
                    if users:
                        _DYN_USERS_CACHE    = dict(users)
                        _DYN_USERS_CACHE_TS = now
                        return users
            except Exception:
                pass
        # الرجوع إلى المستخدمين الثابتين
        result = dict(_DEFAULT_PREDEFINED_USERS)
        _DYN_USERS_CACHE    = dict(result)
        _DYN_USERS_CACHE_TS = now
        return result

def save_dynamic_users(users_dict):
    """حفظ قائمة المستخدمين إلى الملف المحلي + GitHub"""
    global _DYN_USERS_CACHE, _DYN_USERS_CACHE_TS
    import time as _time
    with _DYN_USERS_LOCK:
        content = _json.dumps({"users": users_dict}, ensure_ascii=False, indent=2).encode('utf-8')
        try:
            with open(_DYNAMIC_USERS_FILE, 'w', encoding='utf-8') as f:
                f.write(content.decode('utf-8'))
        except Exception:
            pass
        # تحديث الذاكرة المؤقتة فوراً بعد الحفظ المحلي لتعكس التغيير في نفس العملية
        _DYN_USERS_CACHE    = dict(users_dict)
        _DYN_USERS_CACHE_TS = _time.time()
        token, repo, branch = _dyn_github_params()
        _dyn_upload_github("data/dyn_users.json", content, token, repo, branch, "تحديث قائمة المستخدمين")

def add_dynamic_user(user_id, name, icon="fas fa-user", color="#6c757d"):
    """إضافة مستخدم جديد"""
    users = load_dynamic_users()
    if user_id in users:
        return False, "المستخدم موجود بالفعل"
    if not user_id.startswith("user_"):
        return False, "يجب أن يبدأ المعرف بـ user_"
    users[user_id] = {"id": user_id, "name": name, "icon": icon, "color": color}
    save_dynamic_users(users)
    return True, "تم إضافة المستخدم بنجاح"

def delete_dynamic_user(user_id):
    """حذف مستخدم (لا يمكن حذف user_1)"""
    if user_id == "user_1":
        return False, "لا يمكن حذف المستخدم الأساسي"
    users = load_dynamic_users()
    if user_id not in users:
        return False, "المستخدم غير موجود"
    del users[user_id]
    save_dynamic_users(users)
    return True, "تم حذف المستخدم"

# ── حسابات تسجيل الدخول ──────────────────────────────────────

_ACCTS_LOCK = __import__('threading').Lock()

def load_user_accounts():
    with _ACCTS_LOCK:
        token, repo, branch = _dyn_github_params()
        content = _dyn_download_github("data/user_accounts.json", token, repo, branch)
        if content:
            try:
                data = _json.loads(content.decode('utf-8'))
                if data:
                    try:
                        with open(_USER_ACCOUNTS_FILE, 'w', encoding='utf-8') as f:
                            _json.dump(data, f, ensure_ascii=False, indent=2)
                    except Exception:
                        pass
                    return data
            except Exception:
                pass
        if os.path.exists(_USER_ACCOUNTS_FILE):
            try:
                with open(_USER_ACCOUNTS_FILE, 'r', encoding='utf-8') as f:
                    return _json.load(f)
            except Exception:
                pass
        # حساب افتراضي لن يُستخدم مباشرة
        return {}

def save_user_accounts(accounts):
    with _ACCTS_LOCK:
        content = _json.dumps(accounts, ensure_ascii=False, indent=2).encode('utf-8')
        try:
            with open(_USER_ACCOUNTS_FILE, 'w', encoding='utf-8') as f:
                f.write(content.decode('utf-8'))
        except Exception:
            pass
        token, repo, branch = _dyn_github_params()
        _dyn_upload_github("data/user_accounts.json", content, token, repo, branch, "تحديث حسابات المستخدمين")

def authenticate_platform_user(username, password):
    """التحقق من بيانات الدخول — يعيد username أو None"""
    accounts = load_user_accounts()
    if username not in accounts:
        return None
    hashed = _hashlib.sha256(password.encode()).hexdigest()
    if accounts[username].get("password") == hashed:
        return username
    return None

def create_platform_account(username, password, role="user"):
    """إنشاء حساب جديد"""
    if len(username) < 3:
        return False, "اسم المستخدم يجب أن يكون 3 أحرف على الأقل"
    if len(password) < 6:
        return False, "كلمة المرور يجب أن تكون 6 أحرف على الأقل"
    accounts = load_user_accounts()
    if username in accounts:
        return False, "اسم المستخدم موجود مسبقاً"
    accounts[username] = {
        "username": username,
        "password": _hashlib.sha256(password.encode()).hexdigest(),
        "role": role,
        "created_at": __import__('datetime').datetime.now().isoformat(),
    }
    save_user_accounts(accounts)
    return True, "تم إنشاء الحساب بنجاح"

def delete_platform_account(username):
    accounts = load_user_accounts()
    if username not in accounts:
        return False, "الحساب غير موجود"
    del accounts[username]
    save_user_accounts(accounts)
    return True, "تم حذف الحساب"
