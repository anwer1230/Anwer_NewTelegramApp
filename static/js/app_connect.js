/**
 * app_connect.js — مركز سرعة إنجاز
 * الربط الكامل بين الواجهة الأمامية وجميع مسارات الخادم الخلفي
 * يُحمَّل بعد app.js و app_ext.js
 */
'use strict';

/* ═══════════════════════════════════════════════════════════════════
   أداة الجلب المساعدة المشتركة
   ═══════════════════════════════════════════════════════════════════ */
async function _apiFetch(url, opts = {}) {
    const defaults = { headers: { 'Content-Type': 'application/json' } };
    if (opts.body && typeof opts.body === 'object') {
        opts.body = JSON.stringify(opts.body);
    }
    const res = await fetch(url, { ...defaults, ...opts });
    return res.json();
}

/* ═══════════════════════════════════════════════════════════════════
   1. إدارة المجلدات — /api/folders
   ═══════════════════════════════════════════════════════════════════ */
let _folders = [];

async function loadFolders() {
    try {
        const data = await _apiFetch('/api/folders');
        if (!data.success) return;
        _folders = data.folders || [];
        _renderFolderTabs();
    } catch (_) {}
}

function _renderFolderTabs() {
    const tabs = document.getElementById('folderTabs');
    if (!tabs) return;
    if (!_folders.length) { tabs.classList.add('hidden'); return; }
    tabs.classList.remove('hidden');
    tabs.innerHTML = `<div class="folder-tab active" onclick="filterByFolder(null)">All</div>` +
        _folders.map(f =>
            `<div class="folder-tab" onclick="filterByFolder(${f.id})" data-fid="${f.id}">
                ${escHtml ? escHtml(f.name) : f.name}
             </div>`
        ).join('');
}

function filterByFolder(folderId) {
    document.querySelectorAll('.folder-tab').forEach(t =>
        t.classList.toggle('active', folderId === null
            ? !t.dataset.fid
            : String(t.dataset.fid) === String(folderId))
    );
    if (typeof renderChatList === 'function') {
        if (folderId === null) {
            renderChatList();
            return;
        }
        const folder = _folders.find(f => f.id == folderId);
        const ids = folder ? (folder.chat_ids || []) : [];
        renderChatList('', ids);
    }
}

async function createFolder() {
    const name = prompt('📁 اسم المجلد الجديد:');
    if (!name || !name.trim()) return;
    try {
        const data = await _apiFetch('/api/folders', {
            method: 'POST',
            body: { name: name.trim(), chat_ids: [], member_ids: [] }
        });
        if (data.success) {
            showToast('✅ تم إنشاء المجلد', 2000);
            await loadFolders();
        } else {
            showToast('❌ ' + (data.message || 'فشل الإنشاء'));
        }
    } catch (_) { showToast('❌ خطأ في الاتصال'); }
}

async function addChatToFolder(folderId, chatId) {
    const folder = _folders.find(f => f.id == folderId);
    if (!folder) return;
    const ids = [...new Set([...(folder.chat_ids || []), chatId])];
    try {
        await _apiFetch('/api/folders', {
            method: 'POST',
            body: { id: folderId, name: folder.name, chat_ids: ids, member_ids: folder.member_ids || [] }
        });
        await loadFolders();
    } catch (_) {}
}

/* ═══════════════════════════════════════════════════════════════════
   2. تبديل الحسابات — /api/switch_user + /api/get_account_info
   ═══════════════════════════════════════════════════════════════════ */
let _accounts = [];

async function loadAccounts() {
    try {
        const data = await _apiFetch('/api/get_account_info');
        if (data.success) {
            _accounts = data.accounts || [];
        }
    } catch (_) {}
}

async function showAccountSwitcher() {
    await loadAccounts();
    // إنشاء نافذة تبديل الحسابات
    const existing = document.getElementById('accountSwitcherModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'accountSwitcherModal';
    modal.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:5000;
        display:flex;align-items:center;justify-content:center;
    `;
    modal.innerHTML = `
        <div style="background:#1a1a2e;border-radius:16px;width:90%;max-width:400px;
                    max-height:80vh;overflow:hidden;border:1px solid rgba(255,255,255,.08);
                    box-shadow:0 20px 60px rgba(0,0,0,.6);">
            <div style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.06);
                        display:flex;align-items:center;gap:12px;">
                <i class="fas fa-users" style="color:#2AABEE;font-size:18px;"></i>
                <span style="font-weight:700;font-size:16px;color:#fff;">تبديل الحساب</span>
                <button onclick="document.getElementById('accountSwitcherModal').remove()"
                        style="margin-right:auto;background:none;border:none;color:#888;
                               font-size:18px;cursor:pointer;padding:4px;">✕</button>
            </div>
            <div style="padding:12px;max-height:50vh;overflow-y:auto;">
                ${_accounts.length === 0
                    ? '<div style="text-align:center;color:#555;padding:30px;">لا توجد حسابات مضافة</div>'
                    : _accounts.map((acc, i) => `
                    <div onclick="switchAccount(${acc.slot || i + 1})"
                         style="display:flex;align-items:center;gap:14px;padding:12px 14px;
                                border-radius:12px;cursor:pointer;margin-bottom:6px;
                                background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.04);
                                transition:background .2s;" 
                         onmouseover="this.style.background='rgba(42,171,238,.1)'"
                         onmouseout="this.style.background='rgba(255,255,255,.03)'">
                        <div style="width:44px;height:44px;border-radius:50%;
                                    background:linear-gradient(135deg,#2AABEE,#179CDE);
                                    display:flex;align-items:center;justify-content:center;
                                    font-weight:700;font-size:18px;color:#fff;flex-shrink:0;">
                            ${(acc.name || acc.phone || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div style="flex:1;min-width:0;">
                            <div style="font-weight:600;color:#e0e0e0;font-size:14px;">
                                ${acc.name || 'مستخدم ' + (i + 1)}
                            </div>
                            <div style="font-size:12px;color:#888;margin-top:2px;">
                                ${acc.phone || ''} ${acc.is_active ? '🟢' : '⚪'}
                            </div>
                        </div>
                        ${acc.is_active ? '<span style="color:#2AABEE;font-size:12px;font-weight:600;">الحالي</span>' : ''}
                    </div>`).join('')}
            </div>
            <div style="padding:12px 16px;border-top:1px solid rgba(255,255,255,.06);">
                <button onclick="document.getElementById('accountSwitcherModal').remove();addNewAccount()"
                        style="width:100%;padding:10px;background:rgba(42,171,238,.15);
                               border:1px solid rgba(42,171,238,.3);border-radius:10px;
                               color:#2AABEE;font-size:14px;cursor:pointer;font-family:inherit;">
                    <i class="fas fa-plus"></i> إضافة حساب جديد
                </button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

async function switchAccount(slot) {
    const modal = document.getElementById('accountSwitcherModal');
    if (modal) modal.remove();
    showToast('⏳ جارٍ تبديل الحساب...', 2000);
    try {
        const data = await _apiFetch('/api/switch_user', {
            method: 'POST',
            body: { slot }
        });
        if (data.success) {
            showToast('✅ تم تبديل الحساب بنجاح', 2000);
            setTimeout(() => window.location.reload(), 1000);
        } else {
            showToast('❌ ' + (data.message || 'فشل التبديل'));
        }
    } catch (_) { showToast('❌ خطأ في الاتصال'); }
}

async function addNewAccount() {
    try {
        const data = await _apiFetch('/api/add_account_slot', { method: 'POST' });
        if (data.success) {
            showToast('✅ ' + (data.message || 'تم إضافة حساب — قم بتسجيل الدخول'), 3000);
            setTimeout(() => window.location.href = '/login', 1500);
        } else {
            showToast('❌ ' + (data.message || 'فشلت الإضافة'));
        }
    } catch (_) { showToast('❌ خطأ في الاتصال'); }
}

/* ═══════════════════════════════════════════════════════════════════
   3. حفظ الملف الشخصي — /api/update_profile_name + username + photo
   ═══════════════════════════════════════════════════════════════════ */
async function saveProfileChanges(firstName, lastName, username, statusText) {
    const results = [];
    try {
        // 1. تحديث الاسم
        if (firstName || lastName) {
            const d = await _apiFetch('/api/update_profile_name', {
                method: 'POST',
                body: { first_name: firstName || '', last_name: lastName || '' }
            });
            results.push({ ok: d.success, label: 'الاسم', msg: d.message });
        }
        // 2. تحديث اسم المستخدم
        if (username !== undefined) {
            const d = await _apiFetch('/api/update_username', {
                method: 'POST',
                body: { username: username.replace('@', '') }
            });
            results.push({ ok: d.success, label: 'اسم المستخدم', msg: d.message });
        }
        // 3. تحديث الحالة النصية عبر الإعدادات
        if (statusText !== undefined) {
            await _apiFetch('/api/settings', {
                method: 'POST',
                body: { key: 'user_status', value: statusText }
            });
        }
        const failed = results.filter(r => !r.ok);
        if (failed.length === 0) {
            showToast('✅ تم حفظ الملف الشخصي بنجاح', 2500);
        } else {
            showToast('⚠️ بعض التغييرات فشلت: ' + failed.map(f => f.label).join(', '));
        }
    } catch (_) { showToast('❌ خطأ في الاتصال'); }
}

async function saveProfilePhoto(file) {
    if (!file) return;
    const formData = new FormData();
    formData.append('photo', file);
    showToast('⏳ جارٍ رفع الصورة...', 2000);
    try {
        const res = await fetch('/api/update_profile_photo', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (data.success) {
            showToast('✅ تم تحديث صورة الملف الشخصي', 2500);
        } else {
            showToast('❌ ' + (data.message || 'فشل رفع الصورة'));
        }
    } catch (_) { showToast('❌ خطأ في الاتصال'); }
}

/* ═══════════════════════════════════════════════════════════════════
   4. الإشعارات — /api/push/settings
   ═══════════════════════════════════════════════════════════════════ */
async function savePushSettings(settings) {
    try {
        await _apiFetch('/api/push/settings', {
            method: 'POST',
            body: settings
        });
    } catch (_) {}
}

async function loadPushSettings() {
    try {
        const data = await _apiFetch('/api/push/settings');
        return data.settings || {};
    } catch (_) { return {}; }
}

async function togglePushNotification(key, enabled) {
    const settings = await loadPushSettings();
    settings[key] = enabled;
    await savePushSettings(settings);
    showToast(enabled ? '🔔 تم التفعيل' : '🔕 تم الإيقاف', 1500);
}

/* ═══════════════════════════════════════════════════════════════════
   5. الردود التلقائية — /api/auto_replies + add + delete + toggle
   ═══════════════════════════════════════════════════════════════════ */
let _autoReplies = [];

async function loadAutoReplies() {
    try {
        const data = await _apiFetch('/api/auto_replies');
        _autoReplies = data.replies || data.auto_replies || [];
        return _autoReplies;
    } catch (_) { return []; }
}

async function addAutoReply(keyword, reply, caseSensitive = false) {
    if (!keyword || !reply) {
        showToast('⚠️ الكلمة المفتاحية والرد مطلوبان');
        return false;
    }
    try {
        const data = await _apiFetch('/api/add_auto_reply', {
            method: 'POST',
            body: { keyword, reply, case_sensitive: caseSensitive }
        });
        if (data.success) {
            showToast('✅ تم إضافة القاعدة', 2000);
            await loadAutoReplies();
            return true;
        } else {
            showToast('❌ ' + (data.message || 'فشلت الإضافة'));
            return false;
        }
    } catch (_) { showToast('❌ خطأ في الاتصال'); return false; }
}

async function deleteAutoReply(keyword) {
    if (!confirm(`⚠️ حذف قاعدة الرد للكلمة: "${keyword}"؟`)) return;
    try {
        const data = await _apiFetch('/api/delete_auto_reply', {
            method: 'POST',
            body: { keyword }
        });
        if (data.success) {
            showToast('✅ تم الحذف', 1500);
            await loadAutoReplies();
        } else {
            showToast('❌ ' + (data.message || 'فشل الحذف'));
        }
    } catch (_) { showToast('❌ خطأ في الاتصال'); }
}

async function toggleAutoReplyEnabled(enabled) {
    try {
        const data = await _apiFetch('/api/toggle_auto_reply', {
            method: 'POST',
            body: { enabled }
        });
        if (!data.success) showToast('❌ ' + (data.message || 'فشل'));
    } catch (_) {}
}

async function getAutoReplyStatus() {
    try {
        const data = await _apiFetch('/api/auto_reply_status');
        return data;
    } catch (_) { return {}; }
}

/* ═══════════════════════════════════════════════════════════════════
   6. الروابط المحفوظة (Bookmarks) — /api/messages/bookmarks
   ═══════════════════════════════════════════════════════════════════ */
async function loadBookmarks() {
    try {
        const data = await _apiFetch('/api/messages/bookmarks');
        return data.bookmarks || [];
    } catch (_) { return []; }
}

async function addBookmark(msgId, text, chatId) {
    try {
        const data = await _apiFetch('/api/messages/bookmark', {
            method: 'POST',
            body: { message_id: msgId, text, chat_id: chatId }
        });
        if (data.success) {
            showToast('🔖 تم الحفظ', 1500);
        } else {
            showToast('❌ ' + (data.message || 'فشل الحفظ'));
        }
    } catch (_) { showToast('❌ خطأ في الاتصال'); }
}

async function showBookmarksPanel() {
    const bms = await loadBookmarks();
    const existing = document.getElementById('bookmarksModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'bookmarksModal';
    modal.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:5000;
        display:flex;align-items:center;justify-content:center;
    `;
    modal.innerHTML = `
        <div style="background:#1a1a2e;border-radius:16px;width:92%;max-width:480px;
                    max-height:80vh;overflow:hidden;border:1px solid rgba(255,255,255,.08);">
            <div style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.06);
                        display:flex;align-items:center;gap:12px;">
                <i class="fas fa-bookmark" style="color:#f9ca24;font-size:18px;"></i>
                <span style="font-weight:700;font-size:16px;color:#fff;">الرسائل المحفوظة</span>
                <button onclick="document.getElementById('bookmarksModal').remove()"
                        style="margin-right:auto;background:none;border:none;color:#888;font-size:18px;cursor:pointer;">✕</button>
            </div>
            <div style="padding:12px;max-height:60vh;overflow-y:auto;">
                ${!bms.length
                    ? '<div style="text-align:center;color:#555;padding:40px;font-size:14px;">لا توجد رسائل محفوظة</div>'
                    : bms.map(bm => `
                    <div style="background:rgba(255,255,255,.03);border-radius:10px;
                                padding:12px 14px;margin-bottom:8px;
                                border:1px solid rgba(255,255,255,.05);">
                        <div style="font-size:13px;color:#ccc;margin-bottom:6px;">
                            ${bm.text ? bm.text.substring(0, 150) : '(بدون نص)'}
                        </div>
                        <div style="font-size:11px;color:#555;">
                            ${bm.date ? new Date(bm.date * 1000).toLocaleString('ar') : ''}
                        </div>
                    </div>`).join('')}
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

/* ═══════════════════════════════════════════════════════════════════
   7. البوت التعليمي — /api/learning/status + toggle
   ═══════════════════════════════════════════════════════════════════ */
async function getLearningStatus() {
    try {
        const data = await _apiFetch('/api/learning/status');
        return data;
    } catch (_) { return {}; }
}

async function toggleLearningBot(enabled) {
    try {
        const data = await _apiFetch('/api/learning/toggle', {
            method: 'POST',
            body: { enabled }
        });
        if (data.success) {
            showToast(enabled ? '🧠 تم تفعيل البوت التعليمي' : '⏹ تم إيقاف البوت التعليمي', 2000);
        } else {
            showToast('❌ ' + (data.message || 'فشل التبديل'));
        }
        return data.success;
    } catch (_) { showToast('❌ خطأ في الاتصال'); return false; }
}

async function toggleAllLearning(enabled) {
    try {
        const data = await _apiFetch('/api/learning/toggle_all', {
            method: 'POST',
            body: { enabled }
        });
        if (data.success) showToast(enabled ? '🧠 التعلم الذكي: مفعّل' : '⏹ التعلم الذكي: موقوف', 2000);
        return data.success;
    } catch (_) { return false; }
}

/* ═══════════════════════════════════════════════════════════════════
   8. الإرسال الفوري — /api/send_now
   ═══════════════════════════════════════════════════════════════════ */
async function sendNowAPI({ message, groups = '', sendToAll = false, images = [], action = 'send' }) {
    if (!message && !images.length) {
        showToast('⚠️ أدخل رسالة أو صورة للإرسال');
        return null;
    }
    showToast('⏳ جارٍ الإرسال...', 2000);
    try {
        const data = await _apiFetch('/api/send_now', {
            method: 'POST',
            body: { message, groups, send_to_all: sendToAll, images, action }
        });
        if (data.success) {
            showToast('✅ ' + (data.message || 'تم الإرسال'), 3000);
        } else {
            showToast('❌ ' + (data.message || 'فشل الإرسال'));
        }
        return data;
    } catch (_) { showToast('❌ خطأ في الاتصال'); return null; }
}

/* ═══════════════════════════════════════════════════════════════════
   9. المراقبة — /api/start_monitoring + stop + save_settings
   ═══════════════════════════════════════════════════════════════════ */
async function startMonitoringAPI(settings = {}) {
    try {
        const data = await _apiFetch('/api/start_monitoring', {
            method: 'POST',
            body: settings
        });
        if (data.success) {
            showToast('🚀 بدأت المراقبة', 2000);
        } else {
            showToast('❌ ' + (data.message || 'فشل بدء المراقبة'));
        }
        return data;
    } catch (_) { showToast('❌ خطأ في الاتصال'); return null; }
}

async function stopMonitoringAPI() {
    try {
        const data = await _apiFetch('/api/stop_monitoring', { method: 'POST' });
        if (data.success) {
            showToast('⏹ توقفت المراقبة', 2000);
        } else {
            showToast('❌ ' + (data.message || 'فشل الإيقاف'));
        }
        return data;
    } catch (_) { showToast('❌ خطأ في الاتصال'); return null; }
}

async function saveMonitorSettings(settings) {
    try {
        const data = await _apiFetch('/api/save_settings', {
            method: 'POST',
            body: settings
        });
        if (data.success) {
            showToast('✅ تم حفظ الإعدادات', 1500);
        } else {
            showToast('❌ ' + (data.message || 'فشل الحفظ'));
        }
        return data;
    } catch (_) { showToast('❌ خطأ في الاتصال'); return null; }
}

async function getMonitoringStatus() {
    try {
        const data = await _apiFetch('/api/get_login_status');
        return data;
    } catch (_) { return {}; }
}

/* ═══════════════════════════════════════════════════════════════════
   10. جدولة الرسائل — /api/rotating/save + start + stop + status
   ═══════════════════════════════════════════════════════════════════ */
async function saveRotatingSettings(settings) {
    try {
        const data = await _apiFetch('/api/rotating/save', {
            method: 'POST',
            body: settings
        });
        if (data.success) showToast('✅ تم حفظ إعدادات الجدولة', 1500);
        else showToast('❌ ' + (data.message || 'فشل الحفظ'));
        return data;
    } catch (_) { showToast('❌ خطأ في الاتصال'); return null; }
}

async function startRotatingAPI() {
    try {
        const data = await _apiFetch('/api/rotating/start', { method: 'POST' });
        if (data.success) showToast('🔄 بدأ الإرسال الدوري', 2000);
        else showToast('❌ ' + (data.message || 'فشل البدء'));
        return data;
    } catch (_) { showToast('❌ خطأ في الاتصال'); return null; }
}

async function stopRotatingAPI() {
    try {
        const data = await _apiFetch('/api/rotating/stop', { method: 'POST' });
        if (data.success) showToast('⏹ توقف الإرسال الدوري', 2000);
        else showToast('❌ ' + (data.message || 'فشل الإيقاف'));
        return data;
    } catch (_) { showToast('❌ خطأ في الاتصال'); return null; }
}

async function getRotatingStatus() {
    try {
        return await _apiFetch('/api/rotating/status');
    } catch (_) { return {}; }
}

/* ═══════════════════════════════════════════════════════════════════
   11. الجلسات النشطة (API مباشر) — /api/auth/sessions
   ═══════════════════════════════════════════════════════════════════ */
async function revokeAllSessions() {
    if (!confirm('⚠️ هل تريد إنهاء جميع الجلسات الأخرى؟')) return;
    try {
        const data = await _apiFetch('/api/auth/revoke_all_sessions', { method: 'POST' });
        if (data.success) {
            showToast('✅ تم إنهاء جميع الجلسات الأخرى', 2500);
            if (typeof loadSessions === 'function') loadSessions();
        } else {
            // جرب المسار البديل
            const d2 = await _apiFetch('/api/force_reset_session', { method: 'POST' });
            if (d2.success) {
                showToast('✅ تم إنهاء الجلسات', 2500);
                if (typeof loadSessions === 'function') loadSessions();
            } else {
                showToast('❌ ' + (data.message || d2.message || 'فشل'));
            }
        }
    } catch (_) { showToast('❌ خطأ في الاتصال'); }
}

async function revokeSession(sessionId) {
    if (!confirm('⚠️ إنهاء هذه الجلسة؟')) return;
    try {
        const data = await _apiFetch('/api/auth/revoke_session', {
            method: 'POST',
            body: { session_id: sessionId }
        });
        if (data.success) {
            showToast('✅ تم إنهاء الجلسة', 2000);
            if (typeof loadSessions === 'function') loadSessions();
        } else {
            showToast('❌ ' + (data.message || 'فشل'));
        }
    } catch (_) { showToast('❌ خطأ في الاتصال'); }
}

/* ═══════════════════════════════════════════════════════════════════
   12. حظر مستخدمين — /admin/api/user/<slot>
   ═══════════════════════════════════════════════════════════════════ */
async function blockUserBySlot(slot, userId) {
    if (!confirm(`🚫 حظر هذا المستخدم؟`)) return;
    try {
        const data = await _apiFetch(`/admin/api/user/${slot}`, {
            method: 'POST',
            body: { action: 'block', blocked: true, user_id: userId }
        });
        if (data.success) {
            showToast('🚫 تم حظر المستخدم', 2000);
        } else {
            showToast('❌ ' + (data.message || 'فشل الحظر'));
        }
    } catch (_) { showToast('❌ خطأ في الاتصال'); }
}

async function showBlockUserDialog() {
    const userId = prompt('🚫 أدخل معرف المستخدم (User ID) لحظره:');
    if (!userId || !userId.trim()) return;
    const slot = 1; // الحساب الرئيسي
    await blockUserBySlot(slot, userId.trim());
}

/* ═══════════════════════════════════════════════════════════════════
   13. تسجيل الدخول بكلمة مرور 2FA — /api/auth/check-password
   ═══════════════════════════════════════════════════════════════════ */
async function checkTwoFactorPassword(password) {
    try {
        const data = await _apiFetch('/api/auth/check-password', {
            method: 'POST',
            body: { password }
        });
        return data;
    } catch (_) { return { success: false, message: 'خطأ في الاتصال' }; }
}

/* ═══════════════════════════════════════════════════════════════════
   14. الإعدادات العامة — /api/settings
   ═══════════════════════════════════════════════════════════════════ */
async function saveSetting(key, value) {
    try {
        await _apiFetch('/api/settings', {
            method: 'POST',
            body: { key, value }
        });
    } catch (_) {}
}

async function getSetting(key) {
    try {
        const data = await _apiFetch('/api/settings');
        return data.settings ? data.settings[key] : undefined;
    } catch (_) { return undefined; }
}

/* ═══════════════════════════════════════════════════════════════════
   15. مزامنة GitHub — /api/sync/github
   ═══════════════════════════════════════════════════════════════════ */
async function syncToGithub() {
    showToast('⏳ جارٍ المزامنة مع GitHub...', 2000);
    try {
        const data = await _apiFetch('/api/sync/github', { method: 'POST' });
        if (data.success) {
            showToast('✅ تمت المزامنة مع GitHub', 2500);
        } else {
            showToast('❌ ' + (data.message || 'فشلت المزامنة'));
        }
    } catch (_) { showToast('❌ خطأ في الاتصال'); }
}

async function getSyncStatus() {
    try {
        return await _apiFetch('/api/sync/status');
    } catch (_) { return {}; }
}

/* ═══════════════════════════════════════════════════════════════════
   16. نظام الإحصاءات — /api/get_stats
   ═══════════════════════════════════════════════════════════════════ */
async function getStats() {
    try {
        return await _apiFetch('/api/get_stats');
    } catch (_) { return {}; }
}

/* ═══════════════════════════════════════════════════════════════════
   17. معلومات النظام — /api/system_health
   ═══════════════════════════════════════════════════════════════════ */
async function getSystemHealth() {
    try {
        return await _apiFetch('/api/system_health');
    } catch (_) { return {}; }
}

/* ═══════════════════════════════════════════════════════════════════
   18. لوحة الإعدادات الموسّعة — تُفتح من الـ Drawer
   ═══════════════════════════════════════════════════════════════════ */
function showExtendedSettings() {
    const existing = document.getElementById('extSettingsModal');
    if (existing) { existing.remove(); return; }

    const modal = document.createElement('div');
    modal.id = 'extSettingsModal';
    modal.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:5000;
        display:flex;align-items:flex-end;justify-content:center;
    `;
    modal.innerHTML = `
        <div style="background:#1a1a2e;border-radius:20px 20px 0 0;width:100%;max-width:600px;
                    max-height:85vh;overflow:hidden;border:1px solid rgba(255,255,255,.08);
                    border-bottom:none;display:flex;flex-direction:column;">
            <div style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.06);
                        display:flex;align-items:center;gap:12px;flex-shrink:0;">
                <i class="fas fa-cog" style="color:#00d2ff;font-size:18px;"></i>
                <span style="font-weight:700;font-size:16px;color:#fff;">الإعدادات المتقدمة</span>
                <button onclick="document.getElementById('extSettingsModal').remove()"
                        style="margin-right:auto;background:none;border:none;color:#888;font-size:18px;cursor:pointer;">✕</button>
            </div>
            <div style="overflow-y:auto;flex:1;padding:16px;">

                <!-- حسابات -->
                <div style="margin-bottom:20px;">
                    <div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;font-weight:600;">الحسابات</div>
                    <div style="background:rgba(255,255,255,.03);border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,.05);">
                        <div onclick="document.getElementById('extSettingsModal').remove();showAccountSwitcher()"
                             style="display:flex;align-items:center;gap:14px;padding:14px 16px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.04);"
                             onmouseover="this.style.background='rgba(255,255,255,.04)'" onmouseout="this.style.background=''">
                            <i class="fas fa-users" style="color:#2AABEE;width:20px;text-align:center;"></i>
                            <span style="flex:1;color:#e0e0e0;font-size:14px;">تبديل الحساب</span>
                            <i class="fas fa-chevron-left" style="color:#444;font-size:12px;"></i>
                        </div>
                        <div onclick="addNewAccount()"
                             style="display:flex;align-items:center;gap:14px;padding:14px 16px;cursor:pointer;"
                             onmouseover="this.style.background='rgba(255,255,255,.04)'" onmouseout="this.style.background=''">
                            <i class="fas fa-plus-circle" style="color:#2ecc71;width:20px;text-align:center;"></i>
                            <span style="flex:1;color:#e0e0e0;font-size:14px;">إضافة حساب جديد</span>
                            <i class="fas fa-chevron-left" style="color:#444;font-size:12px;"></i>
                        </div>
                    </div>
                </div>

                <!-- المجلدات -->
                <div style="margin-bottom:20px;">
                    <div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;font-weight:600;">المجلدات</div>
                    <div style="background:rgba(255,255,255,.03);border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,.05);">
                        <div onclick="createFolder()"
                             style="display:flex;align-items:center;gap:14px;padding:14px 16px;cursor:pointer;"
                             onmouseover="this.style.background='rgba(255,255,255,.04)'" onmouseout="this.style.background=''">
                            <i class="fas fa-folder-plus" style="color:#f9ca24;width:20px;text-align:center;"></i>
                            <span style="flex:1;color:#e0e0e0;font-size:14px;">إنشاء مجلد جديد</span>
                            <i class="fas fa-chevron-left" style="color:#444;font-size:12px;"></i>
                        </div>
                    </div>
                </div>

                <!-- الرسائل المحفوظة -->
                <div style="margin-bottom:20px;">
                    <div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;font-weight:600;">الرسائل</div>
                    <div style="background:rgba(255,255,255,.03);border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,.05);">
                        <div onclick="document.getElementById('extSettingsModal').remove();showBookmarksPanel()"
                             style="display:flex;align-items:center;gap:14px;padding:14px 16px;cursor:pointer;"
                             onmouseover="this.style.background='rgba(255,255,255,.04)'" onmouseout="this.style.background=''">
                            <i class="fas fa-bookmark" style="color:#f9ca24;width:20px;text-align:center;"></i>
                            <span style="flex:1;color:#e0e0e0;font-size:14px;">الرسائل المحفوظة</span>
                            <i class="fas fa-chevron-left" style="color:#444;font-size:12px;"></i>
                        </div>
                    </div>
                </div>

                <!-- الأمان -->
                <div style="margin-bottom:20px;">
                    <div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;font-weight:600;">الأمان</div>
                    <div style="background:rgba(255,255,255,.03);border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,.05);">
                        <div onclick="typeof showActiveSessions==='function'?showActiveSessions():null"
                             style="display:flex;align-items:center;gap:14px;padding:14px 16px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.04);"
                             onmouseover="this.style.background='rgba(255,255,255,.04)'" onmouseout="this.style.background=''">
                            <i class="fas fa-shield-alt" style="color:#00d2ff;width:20px;text-align:center;"></i>
                            <span style="flex:1;color:#e0e0e0;font-size:14px;">الجلسات النشطة</span>
                            <i class="fas fa-chevron-left" style="color:#444;font-size:12px;"></i>
                        </div>
                        <div onclick="showBlockUserDialog()"
                             style="display:flex;align-items:center;gap:14px;padding:14px 16px;cursor:pointer;"
                             onmouseover="this.style.background='rgba(255,255,255,.04)'" onmouseout="this.style.background=''">
                            <i class="fas fa-user-slash" style="color:#ff4757;width:20px;text-align:center;"></i>
                            <span style="flex:1;color:#e0e0e0;font-size:14px;">حظر مستخدم</span>
                            <i class="fas fa-chevron-left" style="color:#444;font-size:12px;"></i>
                        </div>
                    </div>
                </div>

                <!-- مزامنة -->
                <div style="margin-bottom:20px;">
                    <div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;font-weight:600;">البيانات</div>
                    <div style="background:rgba(255,255,255,.03);border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,.05);">
                        <div onclick="syncToGithub()"
                             style="display:flex;align-items:center;gap:14px;padding:14px 16px;cursor:pointer;"
                             onmouseover="this.style.background='rgba(255,255,255,.04)'" onmouseout="this.style.background=''">
                            <i class="fab fa-github" style="color:#e0e0e0;width:20px;text-align:center;"></i>
                            <span style="flex:1;color:#e0e0e0;font-size:14px;">مزامنة مع GitHub</span>
                            <i class="fas fa-chevron-left" style="color:#444;font-size:12px;"></i>
                        </div>
                    </div>
                </div>

            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

/* ═══════════════════════════════════════════════════════════════════
   19. نافذة إضافة محادثة جديدة — /api/search
   ═══════════════════════════════════════════════════════════════════ */
async function openNewChatDialog() {
    const query = prompt('🔍 ابحث عن مستخدم أو مجموعة:');
    if (!query || !query.trim()) return;
    showToast('⏳ جارٍ البحث...', 2000);
    try {
        const data = await _apiFetch(`/api/search?q=${encodeURIComponent(query)}&limit=10`);
        if (!data.success || !data.results?.length) {
            showToast('لا توجد نتائج للبحث');
            return;
        }
        // عرض نتائج البحث في نافذة
        const existing = document.getElementById('newChatModal');
        if (existing) existing.remove();
        const modal = document.createElement('div');
        modal.id = 'newChatModal';
        modal.style.cssText = `
            position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:5000;
            display:flex;align-items:center;justify-content:center;
        `;
        modal.innerHTML = `
            <div style="background:#1a1a2e;border-radius:16px;width:92%;max-width:420px;
                        max-height:70vh;overflow:hidden;border:1px solid rgba(255,255,255,.08);">
                <div style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.06);
                            display:flex;align-items:center;gap:12px;">
                    <i class="fas fa-search" style="color:#2AABEE;"></i>
                    <span style="font-weight:700;color:#fff;">نتائج البحث عن: ${query}</span>
                    <button onclick="document.getElementById('newChatModal').remove()"
                            style="margin-right:auto;background:none;border:none;color:#888;font-size:18px;cursor:pointer;">✕</button>
                </div>
                <div style="max-height:50vh;overflow-y:auto;padding:8px;">
                    ${data.results.map(r => `
                    <div onclick="document.getElementById('newChatModal').remove();
                                  typeof selectChat==='function'&&selectChat(${r.id})"
                         style="display:flex;align-items:center;gap:14px;padding:12px 14px;
                                border-radius:10px;cursor:pointer;margin-bottom:4px;"
                         onmouseover="this.style.background='rgba(42,171,238,.1)'"
                         onmouseout="this.style.background=''">
                        <div style="width:42px;height:42px;border-radius:50%;
                                    background:linear-gradient(135deg,#2AABEE,#179CDE);
                                    display:flex;align-items:center;justify-content:center;
                                    font-weight:700;color:#fff;font-size:16px;flex-shrink:0;">
                            ${(r.name || r.title || '?').charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <div style="font-weight:600;color:#e0e0e0;font-size:14px;">${r.name || r.title || 'مجهول'}</div>
                            <div style="font-size:12px;color:#888;">${r.username ? '@' + r.username : (r.type || '')}</div>
                        </div>
                    </div>`).join('')}
                </div>
            </div>`;
        document.body.appendChild(modal);
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    } catch (_) { showToast('❌ فشل البحث'); }
}

/* ═══════════════════════════════════════════════════════════════════
   20. تحديث دالة openNewChat الموجودة في index.html
   ═══════════════════════════════════════════════════════════════════ */
// نستبدل الدالة الوهمية بدالة حقيقية
if (typeof window !== 'undefined') {
    window.openNewChat = openNewChatDialog;
}

/* ═══════════════════════════════════════════════════════════════════
   تهيئة app_connect عند تحميل الصفحة
   ═══════════════════════════════════════════════════════════════════ */
async function initAppConnect() {
    // تحميل المجلدات
    await loadFolders();

    // تحميل حالة الحسابات في الخلفية
    loadAccounts().catch(() => {});

    // تحميل حالة المراقبة في الخلفية
    getMonitoringStatus().catch(() => {});

    // إضافة زر الإعدادات المتقدمة للـ Drawer
    _injectDrawerEnhancements();
}

function _injectDrawerEnhancements() {
    // إضافة زر الإعدادات المتقدمة في الـ drawer إذا لم يكن موجوداً
    const drawerBody = document.querySelector('.drawer-body');
    if (!drawerBody) return;

    // إضافة رابط تبديل الحسابات
    const existing = document.getElementById('drawerAccountsBtn');
    if (!existing) {
        const switchBtn = document.createElement('div');
        switchBtn.id = 'drawerAccountsBtn';
        switchBtn.className = 'drawer-item';
        switchBtn.innerHTML = '<i class="fas fa-exchange-alt"></i> تبديل الحساب';
        switchBtn.onclick = () => { closeDrawer(); showAccountSwitcher(); };
        // إدراج في أول الـ drawer body
        drawerBody.insertBefore(switchBtn, drawerBody.firstChild);
    }

    // إضافة زر الإعدادات المتقدمة
    const extSettBtn = document.getElementById('drawerExtSettBtn');
    if (!extSettBtn) {
        const btn = document.createElement('div');
        btn.id = 'drawerExtSettBtn';
        btn.className = 'drawer-item';
        btn.innerHTML = '<i class="fas fa-sliders-h"></i> إعدادات متقدمة';
        btn.onclick = () => { closeDrawer(); showExtendedSettings(); };
        // إضافة قبل آخر عنصر
        const lastItem = drawerBody.lastElementChild;
        if (lastItem) drawerBody.insertBefore(btn, lastItem);
        else drawerBody.appendChild(btn);
    }
}

// تشغيل عند اكتمال تحميل الصفحة
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // انتظر initExt من app_ext.js إن وُجد
        setTimeout(initAppConnect, 500);
    });
} else {
    setTimeout(initAppConnect, 500);
}
