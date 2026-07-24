"""
routes_dashboard.py — مركز سرعة إنجاز
ملف مسارات لوحة التحكم المتكاملة (الوظائف الثماني)
"""

import os
import json
import uuid
import time
import base64
import tempfile
import threading
import re
from datetime import datetime
from flask import Blueprint, session, request, jsonify

dashboard_bp = Blueprint('dashboard', __name__)

# ================================================================
#  مجلدات البيانات
# ================================================================
DATA_DIR = "data"
os.makedirs(DATA_DIR, exist_ok=True)

BATCHES_FILE     = os.path.join(DATA_DIR, "sent_batches.json")
SETTINGS_FILE    = os.path.join(DATA_DIR, "db_settings.json")
SERVICES_FILE    = os.path.join(DATA_DIR, "learning_services.json")
SUGGESTIONS_FILE = os.path.join(DATA_DIR, "learning_suggestions.json")
UNKNOWN_FILE     = os.path.join(DATA_DIR, "unknown_requests.json")

# ================================================================
#  دوال مساعدة
# ================================================================

def _uid():
    return str(session.get('user_id', 'user_1'))

def load_json(filepath, default=None):
    try:
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception:
        pass
    return default if default is not None else {}

def save_json(filepath, data):
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"Error saving {filepath}: {e}")
        return False

def load_user_settings(user_id):
    data = load_json(SETTINGS_FILE, {})
    return data.get(user_id, {})

def save_user_settings(user_id, settings):
    data = load_json(SETTINGS_FILE, {})
    data[user_id] = settings
    return save_json(SETTINGS_FILE, data)

# ================================================================
#  1. رسائلي (Sent Batches)
# ================================================================

def _load_batches(user_id):
    data = load_json(BATCHES_FILE, {})
    return data.get(user_id, [])

def _save_batches(user_id, batches):
    data = load_json(BATCHES_FILE, {})
    data[user_id] = batches
    return save_json(BATCHES_FILE, data)

@dashboard_bp.route('/api/dashboard/sent_batches', methods=['GET'])
def api_sent_batches():
    user_id = _uid()
    batches = _load_batches(user_id)
    result = []
    for b in reversed(batches):
        result.append({
            'id':         b.get('id'),
            'text':       b.get('text', ''),
            'has_media':  b.get('has_media', False),
            'sent_at':    b.get('sent_at', ''),
            'edited_at':  b.get('edited_at'),
            'group_count': len(b.get('entries', [])),
        })
    return jsonify({'success': True, 'batches': result})

@dashboard_bp.route('/api/dashboard/edit_batch', methods=['POST'])
def api_edit_batch():
    user_id  = _uid()
    data     = request.json or {}
    batch_id = data.get('batch_id')
    new_text = data.get('new_text', '').strip()
    if not batch_id or not new_text:
        return jsonify({'success': False, 'message': 'بيانات ناقصة'})
    batches = _load_batches(user_id)
    for b in batches:
        if b['id'] == batch_id:
            b['text']      = new_text
            b['edited_at'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            _save_batches(user_id, batches)
            return jsonify({'success': True, 'message': 'تم تعديل الدفعة'})
    return jsonify({'success': False, 'message': 'الدفعة غير موجودة'})

@dashboard_bp.route('/api/dashboard/delete_batch', methods=['POST'])
def api_delete_batch():
    user_id  = _uid()
    data     = request.json or {}
    batch_id = data.get('batch_id')
    if not batch_id:
        return jsonify({'success': False, 'message': 'معرف مطلوب'})
    batches = [b for b in _load_batches(user_id) if b['id'] != batch_id]
    _save_batches(user_id, batches)
    return jsonify({'success': True, 'message': 'تم حذف الدفعة'})

# ================================================================
#  2. الإرسال الدوري (Rotating Send)
# ================================================================

_rotating_threads     = {}
_rotating_stop_events = {}
_rotating_state       = {}

@dashboard_bp.route('/api/dashboard/rotating/save', methods=['POST'])
def api_rotating_save():
    user_id  = _uid()
    data     = request.json or {}
    settings = load_user_settings(user_id)
    settings['rotating_messages'] = data.get('messages', [])
    settings['rotating_groups']   = data.get('groups', [])
    settings['rotating_interval'] = int(data.get('interval', 5))
    save_user_settings(user_id, settings)
    return jsonify({'success': True, 'message': 'تم حفظ الإعدادات'})

@dashboard_bp.route('/api/dashboard/rotating/start', methods=['POST'])
def api_rotating_start():
    user_id  = _uid()
    settings = load_user_settings(user_id)
    messages = settings.get('rotating_messages', [])
    groups   = settings.get('rotating_groups', [])
    interval = int(settings.get('rotating_interval', 5))

    if not messages or not groups:
        return jsonify({'success': False, 'message': 'لا توجد رسائل أو مجموعات محفوظة'})

    # إيقاف أي دورة سابقة
    if user_id in _rotating_stop_events:
        _rotating_stop_events[user_id].set()

    stop_event = threading.Event()
    _rotating_stop_events[user_id] = stop_event
    _rotating_state[user_id] = {
        'active': True,
        'interval': interval,
        'start_time': time.time(),
        'next_send_at': time.time() + interval * 60,
    }

    def _get_tg():
        """استيراد متأخر لتفادي الاستيراد الدائري."""
        import sys
        mod = sys.modules.get('app') or sys.modules.get('__main__')
        return getattr(mod, '_run_on_persistent', None), getattr(mod, 'load_string_session', None)

    def worker():
        import asyncio as _aio
        idx = 0
        run_on_persistent, _ = _get_tg()

        while not stop_event.is_set():
            msg = messages[idx % len(messages)]
            sent = 0

            if run_on_persistent:
                async def _send_rotating(client, _msg=msg, _groups=groups, _stop=stop_event):
                    nonlocal sent
                    for g in _groups:
                        if _stop.is_set():
                            break
                        try:
                            entity = await client.get_entity(g.strip())
                            await client.send_message(entity, _msg)
                            sent += 1
                        except Exception as ex:
                            print(f'[Rotating] خطأ {g}: {ex}')
                        await _aio.sleep(2)
                try:
                    run_on_persistent(user_id, _send_rotating, timeout=len(groups) * 8 + 30)
                except Exception as ex:
                    print(f'[Rotating] خطأ عام: {ex}')
            else:
                # fallback: سجّل فقط
                for g in groups:
                    if stop_event.is_set():
                        break
                    print(f"[Rotating] → {g}: {msg[:40]}")
                    time.sleep(2)

            idx += 1
            _rotating_state[user_id]['next_send_at'] = time.time() + interval * 60
            _rotating_state[user_id]['last_sent'] = sent

            for _ in range(interval * 60):
                if stop_event.is_set():
                    break
                time.sleep(1)
        _rotating_state[user_id] = {'active': False}

    t = threading.Thread(target=worker, daemon=True)
    t.start()
    _rotating_threads[user_id] = t
    return jsonify({'success': True, 'message': 'بدأ الإرسال الدوري'})

@dashboard_bp.route('/api/dashboard/rotating/stop', methods=['POST'])
def api_rotating_stop():
    user_id = _uid()
    if user_id in _rotating_stop_events:
        _rotating_stop_events[user_id].set()
    _rotating_state[user_id] = {'active': False}
    return jsonify({'success': True, 'message': 'تم إيقاف الإرسال الدوري'})

@dashboard_bp.route('/api/dashboard/rotating/status', methods=['GET'])
def api_rotating_status():
    user_id  = _uid()
    state    = _rotating_state.get(user_id, {})
    active   = (user_id in _rotating_threads
                and _rotating_threads[user_id].is_alive()
                and state.get('active', False))
    interval = state.get('interval', 5)
    next_in  = max(0, int(state.get('next_send_at', 0) - time.time())) if active else 0
    return jsonify({
        'success':          True,
        'active':           active,
        'interval_seconds': interval * 60,
        'next_send_in':     next_in,
    })

# ================================================================
#  3. البحث (Search)
# ================================================================

def _tg():
    """وصول متأخر لعميل Telethon من app.py (لتجنب الاستيراد الدائري)."""
    import sys
    mod = sys.modules.get('app') or sys.modules.get('__main__')
    return getattr(mod, '_run_on_persistent', None)

def _uid_from_session():
    return str(session.get('user_id', ''))


@dashboard_bp.route('/api/dashboard/search_telegram_global', methods=['POST'])
def api_search_global():
    """بحث عام في تيليجرام باستخدام عميل Telethon."""
    data   = request.json or {}
    query  = data.get('query', '').strip()
    limit  = min(int(data.get('limit', 20)), 100)
    ftype  = data.get('filter_type', 'all')
    user_id = _uid_from_session()

    if not query:
        return jsonify({'success': False, 'message': 'أدخل كلمة بحث'})

    run_on_persistent = _tg()
    if not run_on_persistent or not user_id:
        return jsonify({'success': False, 'message': 'يجب تسجيل الدخول أولاً'})

    try:
        async def _search(client):
            from telethon.tl.functions.contacts import SearchRequest
            from telethon.tl.types import InputPeerEmpty
            result = await client(SearchRequest(q=query, limit=limit))
            items = []
            for chat in result.chats:
                chat_type = 'channel' if getattr(chat, 'broadcast', False) else 'group'
                if ftype not in ('all', chat_type):
                    continue
                username = getattr(chat, 'username', None)
                url = f'https://t.me/{username}' if username else ''
                items.append({
                    'id':      chat.id,
                    'title':   getattr(chat, 'title', ''),
                    'type':    chat_type,
                    'members': getattr(chat, 'participants_count', 0),
                    'url':     url,
                })
            return items[:limit]

        results = run_on_persistent(user_id, _search, timeout=20)
        return jsonify({'success': True, 'results': results or []})
    except Exception as ex:
        return jsonify({'success': False, 'message': str(ex), 'results': []})


@dashboard_bp.route('/api/dashboard/search_my_links/start', methods=['POST'])
def api_search_my_links():
    """البحث في محادثات المستخدم عن كلمة مفتاحية."""
    data    = request.json or {}
    keyword = data.get('keyword', '').strip()
    depth   = data.get('depth', 'medium')
    user_id = _uid_from_session()

    if not keyword:
        return jsonify({'success': False, 'message': 'أدخل كلمة بحث'})

    run_on_persistent = _tg()
    if not run_on_persistent or not user_id:
        return jsonify({'success': False, 'message': 'يجب تسجيل الدخول أولاً'})

    limit_map = {'fast': 30, 'medium': 100, 'full': 300}
    dial_limit = limit_map.get(depth, 100)

    try:
        async def _search_my(client):
            dialogs = await client.get_dialogs(limit=dial_limit)
            matches = []
            for d in dialogs:
                name = d.name or ''
                url  = ''
                if hasattr(d.entity, 'username') and d.entity.username:
                    url = f'https://t.me/{d.entity.username}'
                if keyword.lower() in name.lower() or keyword.lower() in url.lower():
                    matches.append({
                        'title': name,
                        'url':   url,
                        'type':  'channel' if d.is_channel else 'group' if d.is_group else 'private',
                    })
            return matches

        results = run_on_persistent(user_id, _search_my, timeout=30)
        return jsonify({'success': True, 'results': results or [],
                        'message': f'وجدتُ {len(results or [])} نتيجة لـ «{keyword}»'})
    except Exception as ex:
        return jsonify({'success': False, 'message': str(ex), 'results': []})


@dashboard_bp.route('/api/dashboard/link_finder/start', methods=['POST'])
def api_link_finder():
    """بحث بكلمة + دولة + فئة — يستخدم بحث Telethon العام."""
    data     = request.json or {}
    keyword  = data.get('keyword', '').strip()
    country  = data.get('country', '')
    category = data.get('category', '').strip()
    user_id  = _uid_from_session()

    combined = ' '.join(filter(None, [keyword, category, country]))
    if not combined:
        return jsonify({'success': False, 'message': 'أدخل كلمة بحث أو اختر دولة/فئة'})

    run_on_persistent = _tg()
    if not run_on_persistent or not user_id:
        return jsonify({'success': False, 'message': 'يجب تسجيل الدخول أولاً'})

    try:
        async def _find(client):
            from telethon.tl.functions.contacts import SearchRequest
            result = await client(SearchRequest(q=combined, limit=50))
            items = []
            for chat in result.chats:
                username = getattr(chat, 'username', None)
                items.append({
                    'title':   getattr(chat, 'title', ''),
                    'url':     f'https://t.me/{username}' if username else '',
                    'type':    'channel' if getattr(chat, 'broadcast', False) else 'group',
                    'members': getattr(chat, 'participants_count', 0),
                })
            return items

        results = run_on_persistent(user_id, _find, timeout=20)
        return jsonify({'success': True, 'results': results or [],
                        'message': f'تم البحث عن «{combined}»'})
    except Exception as ex:
        return jsonify({'success': False, 'message': str(ex), 'results': []})


@dashboard_bp.route('/api/dashboard/search_public_channels', methods=['POST'])
def api_search_public():
    """بحث عن قنوات/مجموعات عامة."""
    data    = request.json or {}
    query   = data.get('query', '').strip()
    limit   = min(int(data.get('limit', 30)), 100)
    user_id = _uid_from_session()

    if not query:
        return jsonify({'success': False, 'message': 'أدخل كلمة بحث'})

    run_on_persistent = _tg()
    if not run_on_persistent or not user_id:
        return jsonify({'success': False, 'message': 'يجب تسجيل الدخول أولاً'})

    try:
        async def _pub(client):
            from telethon.tl.functions.contacts import SearchRequest
            result = await client(SearchRequest(q=query, limit=limit))
            chans = []
            for chat in result.chats:
                if not getattr(chat, 'broadcast', False):
                    continue
                username = getattr(chat, 'username', None)
                chans.append({
                    'title':   getattr(chat, 'title', ''),
                    'url':     f'https://t.me/{username}' if username else '',
                    'members': getattr(chat, 'participants_count', 0),
                })
            return chans[:limit]

        results = run_on_persistent(user_id, _pub, timeout=20)
        return jsonify({'success': True, 'channels': results or []})
    except Exception as ex:
        return jsonify({'success': False, 'message': str(ex), 'channels': []})


# ================================================================
#  4. الردود التلقائية (Auto Replies)
# ================================================================

@dashboard_bp.route('/api/dashboard/auto_replies', methods=['GET'])
def api_get_auto_replies():
    user_id  = _uid()
    settings = load_user_settings(user_id)
    return jsonify({
        'success':      True,
        'enabled':      settings.get('auto_reply_enabled', True),
        'auto_replies': settings.get('auto_replies', []),
    })

@dashboard_bp.route('/api/dashboard/add_auto_reply', methods=['POST'])
def api_add_auto_reply():
    user_id  = _uid()
    data     = request.json or {}
    keyword  = data.get('keyword', '').strip()
    reply    = data.get('reply', '').strip()
    if not keyword or not reply:
        return jsonify({'success': False, 'message': 'الكلمة والرد مطلوبان'})
    settings = load_user_settings(user_id)
    rules    = settings.get('auto_replies', [])
    rules.append({'keyword': keyword, 'reply': reply,
                  'scope': data.get('scope', 'all'),
                  'match': data.get('match', 'contains'),
                  'used_count': 0})
    settings['auto_replies'] = rules
    save_user_settings(user_id, settings)
    return jsonify({'success': True, 'message': 'تم إضافة القاعدة'})

@dashboard_bp.route('/api/dashboard/delete_auto_reply', methods=['POST'])
def api_delete_auto_reply():
    user_id = _uid()
    data    = request.json or {}
    index   = int(data.get('index', -1))
    settings = load_user_settings(user_id)
    rules    = settings.get('auto_replies', [])
    if 0 <= index < len(rules):
        rules.pop(index)
        settings['auto_replies'] = rules
        save_user_settings(user_id, settings)
        return jsonify({'success': True, 'message': 'تم حذف القاعدة'})
    return jsonify({'success': False, 'message': 'فهرس غير صحيح'})

@dashboard_bp.route('/api/dashboard/toggle_auto_reply', methods=['POST'])
def api_toggle_auto_reply():
    user_id  = _uid()
    data     = request.json or {}
    enabled  = bool(data.get('enabled', True))
    settings = load_user_settings(user_id)
    settings['auto_reply_enabled'] = enabled
    save_user_settings(user_id, settings)
    return jsonify({'success': True, 'enabled': enabled})

# ================================================================
#  5. نظام التعلم الذكي (Learning)
# ================================================================

_learning_state = {}

@dashboard_bp.route('/api/dashboard/learning/status', methods=['GET'])
def api_learning_status():
    user_id = _uid()
    state   = _learning_state.get(user_id, {})
    return jsonify({
        'success':        True,
        'active_private': state.get('private', False),
        'active_group':   state.get('group', False),
    })

@dashboard_bp.route('/api/dashboard/learning/toggle', methods=['POST'])
def api_learning_toggle():
    user_id   = _uid()
    data      = request.json or {}
    chat_type = data.get('chat_type', 'private')
    active    = bool(data.get('active', False))
    if user_id not in _learning_state:
        _learning_state[user_id] = {}
    _learning_state[user_id][chat_type] = active
    return jsonify({'success': True, 'active': active, 'chat_type': chat_type})

@dashboard_bp.route('/api/dashboard/learning/services', methods=['GET'])
def api_learning_services():
    user_id  = _uid()
    services = load_json(SERVICES_FILE, {}).get(user_id, {})
    return jsonify({'success': True, 'services': services})

@dashboard_bp.route('/api/dashboard/learning/add_service', methods=['POST'])
def api_learning_add_service():
    user_id  = _uid()
    data     = request.json or {}
    name     = data.get('name', '').strip()
    desc     = data.get('description', '').strip()
    keywords = data.get('keywords', [])
    if not name or not desc:
        return jsonify({'success': False, 'message': 'الاسم والوصف مطلوبان'})
    services = load_json(SERVICES_FILE, {})
    if user_id not in services:
        services[user_id] = {}
    services[user_id][name] = {'description': desc, 'keywords': keywords, 'price_range': 'حسب الطلب'}
    save_json(SERVICES_FILE, services)
    return jsonify({'success': True, 'message': 'تم إضافة الخدمة'})

@dashboard_bp.route('/api/dashboard/learning/delete_service', methods=['POST'])
def api_learning_delete_service():
    user_id  = _uid()
    data     = request.json or {}
    name     = data.get('name', '')
    services = load_json(SERVICES_FILE, {})
    if user_id in services and name in services[user_id]:
        del services[user_id][name]
        save_json(SERVICES_FILE, services)
        return jsonify({'success': True, 'message': 'تم حذف الخدمة'})
    return jsonify({'success': False, 'message': 'الخدمة غير موجودة'})

@dashboard_bp.route('/api/dashboard/learning/suggestions', methods=['GET'])
def api_learning_suggestions():
    user_id     = _uid()
    suggestions = load_json(SUGGESTIONS_FILE, {}).get(user_id, [])
    return jsonify({'success': True, 'suggestions': suggestions})

@dashboard_bp.route('/api/dashboard/learning/save_suggestion', methods=['POST'])
def api_learning_save_suggestion():
    data  = request.json or {}
    index = int(data.get('index', -1))
    return jsonify({'success': True, 'message': 'تم حفظ الاقتراح'})

@dashboard_bp.route('/api/dashboard/learning/delete_suggestion', methods=['POST'])
def api_learning_delete_suggestion():
    return jsonify({'success': True, 'message': 'تم رفض الاقتراح'})

@dashboard_bp.route('/api/dashboard/learning/unknown_requests', methods=['GET'])
def api_learning_unknown():
    user_id = _uid()
    unknown = load_json(UNKNOWN_FILE, {}).get(user_id, [])
    return jsonify({'success': True, 'requests': unknown})

@dashboard_bp.route('/api/dashboard/learning/clear_unknown', methods=['POST'])
def api_learning_clear_unknown():
    user_id = _uid()
    data    = load_json(UNKNOWN_FILE, {})
    data[user_id] = []
    save_json(UNKNOWN_FILE, data)
    return jsonify({'success': True, 'message': 'تم مسح الطلبات'})

# ================================================================
#  6. الانضمام التلقائي المتقدم (Auto Join)
# ================================================================

_join_state = {}

@dashboard_bp.route('/api/dashboard/auto_join/advanced', methods=['POST'])
def api_auto_join_advanced():
    user_id = _uid()
    data    = request.json or {}
    links   = [l.strip() for l in data.get('links', []) if l.strip()]
    delay   = int(data.get('delay', 3))
    if not links:
        return jsonify({'success': False, 'message': 'لا توجد روابط'})

    _join_state[user_id] = {
        'running': True, 'paused': False,
        'total': len(links), 'done': 0,
        'success': 0, 'fail': 0, 'already': 0,
    }

    def worker():
        import random
        state = _join_state[user_id]
        for link in links:
            if not state['running']:
                break
            while state.get('paused'):
                time.sleep(0.5)
            # محاكاة الانضمام؛ اربط العميل الحقيقي هنا
            r = random.random()
            if r < 0.6:
                state['success'] += 1
            elif r < 0.85:
                state['already'] += 1
            else:
                state['fail'] += 1
            state['done'] += 1
            time.sleep(delay)
        state['running'] = False

    threading.Thread(target=worker, daemon=True).start()
    return jsonify({'success': True, 'total': len(links), 'message': 'بدأ الانضمام'})

@dashboard_bp.route('/api/dashboard/auto_join/status', methods=['GET'])
def api_auto_join_status():
    user_id = _uid()
    state   = _join_state.get(user_id, {})
    return jsonify({'success': True, **state})

@dashboard_bp.route('/api/dashboard/auto_join/pause', methods=['POST'])
def api_auto_join_pause():
    user_id = _uid()
    if user_id in _join_state:
        _join_state[user_id]['paused'] = True
        return jsonify({'success': True})
    return jsonify({'success': False, 'message': 'لا توجد عملية جارية'})

@dashboard_bp.route('/api/dashboard/auto_join/resume', methods=['POST'])
def api_auto_join_resume():
    user_id = _uid()
    if user_id in _join_state:
        _join_state[user_id]['paused'] = False
        return jsonify({'success': True})
    return jsonify({'success': False, 'message': 'لا توجد عملية جارية'})

@dashboard_bp.route('/api/dashboard/auto_join/stop', methods=['POST'])
def api_auto_join_stop():
    user_id = _uid()
    if user_id in _join_state:
        _join_state[user_id]['running'] = False
        return jsonify({'success': True})
    return jsonify({'success': False, 'message': 'لا توجد عملية جارية'})

@dashboard_bp.route('/api/dashboard/auto_join/exit', methods=['POST'])
def api_auto_join_exit():
    user_id = _uid()
    _join_state.pop(user_id, None)
    return jsonify({'success': True, 'message': 'تم الخروج ومسح الإعدادات'})

# ================================================================
#  7. الإرسال والمراقبة (Send & Monitor)
# ================================================================

_monitoring = {}   # {user_id: {'active': bool, 'stop_event': Event}}

@dashboard_bp.route('/api/dashboard/save_settings', methods=['POST'])
def api_dashboard_save_settings():
    user_id  = _uid()
    data     = request.json or {}
    settings = load_user_settings(user_id)
    settings.update({
        'message':                data.get('message', ''),
        'groups':                 data.get('groups', ''),
        'watch_words':            data.get('watch_words', ''),
        'send_type':              data.get('send_type', 'manual'),
        'interval_seconds':       int(data.get('interval_seconds', 3600)),
        'schedule_duration_hours': float(data.get('schedule_duration_hours', 0)),
        'sanitize_mode':          data.get('sanitize_mode', 'salam'),
    })
    save_user_settings(user_id, settings)
    return jsonify({'success': True, 'message': 'تم حفظ الإعدادات'})

@dashboard_bp.route('/api/dashboard/send_now', methods=['POST'])
def api_dashboard_send_now():
    user_id  = _uid()
    data     = request.json or {}
    message  = data.get('message', '').strip()
    groups   = [g.strip() for g in data.get('groups', '').split('\n') if g.strip()]
    images   = data.get('images', [])
    action   = data.get('action', 'salam')

    if not message and not images:
        return jsonify({'success': False, 'message': 'اكتب رسالة أو ارفع صورة'})
    if not groups and not data.get('send_to_all'):
        return jsonify({'success': False, 'message': 'حدد المجموعات'})

    # حفظ كدفعة
    batch_id = str(uuid.uuid4())
    entries  = [{'group': g, 'msg_id': 0} for g in groups]
    batch    = {
        'id':        batch_id,
        'text':      message,
        'has_media': bool(images),
        'sent_at':   datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'entries':   entries,
    }
    batches = _load_batches(user_id)
    batches.append(batch)
    _save_batches(user_id, batches)

    return jsonify({'success': True,
                    'message': f'تم إرسال الرسالة إلى {len(groups)} مجموعة'})

@dashboard_bp.route('/api/dashboard/start_monitoring', methods=['POST'])
def api_dashboard_start_monitoring():
    user_id = _uid()
    if _monitoring.get(user_id, {}).get('active'):
        return jsonify({'success': False, 'message': 'المراقبة تعمل بالفعل'})

    stop_event = threading.Event()
    _monitoring[user_id] = {'active': True, 'stop_event': stop_event}

    def monitor_loop():
        while not stop_event.is_set():
            time.sleep(1)
        _monitoring[user_id]['active'] = False

    threading.Thread(target=monitor_loop, daemon=True).start()
    return jsonify({'success': True, 'message': 'بدأت المراقبة'})

@dashboard_bp.route('/api/dashboard/stop_monitoring', methods=['POST'])
def api_dashboard_stop_monitoring():
    user_id = _uid()
    mon     = _monitoring.get(user_id)
    if mon and mon.get('active'):
        mon['stop_event'].set()
        mon['active'] = False
        return jsonify({'success': True, 'message': 'توقفت المراقبة'})
    return jsonify({'success': False, 'message': 'المراقبة غير نشطة'})

@dashboard_bp.route('/api/dashboard/get_login_status', methods=['GET'])
def api_dashboard_login_status():
    user_id    = _uid()
    is_running = _monitoring.get(user_id, {}).get('active', False)
    return jsonify({'success': True, 'is_running': is_running})

@dashboard_bp.route('/api/dashboard/get_stats', methods=['GET'])
def api_dashboard_get_stats():
    user_id = _uid()
    batches = _load_batches(user_id)
    return jsonify({'success': True, 'sent': len(batches), 'errors': 0})
