import React, { useState } from 'react';
import {
  useGetGroups,
  useSendMessage,
  useEditMessage,
  useDeleteMessage,
} from '@workspace/api-client-react';
import { Send, Edit3, Trash2, Users, Loader2, CheckCircle2, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/components/Layout';

type Mode = 'send' | 'edit';

export default function Broadcast() {
  const { toast } = useToast();
  const { data: groupsData, isLoading: loadingGroups } = useGetGroups();
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [editText, setEditText] = useState('');
  const [mode, setMode] = useState<Mode>('send');
  const [lastSentText, setLastSentText] = useState('');
  const [justSent, setJustSent] = useState(false);

  const sendMut = useSendMessage();
  const editMut = useEditMessage();
  const deleteMut = useDeleteMessage();

  const handleToggleGroup = (id: string) => {
    setSelectedGroups(prev =>
      prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (!groupsData?.groups) return;
    if (selectedGroups.length === groupsData.groups.length) {
      setSelectedGroups([]);
    } else {
      setSelectedGroups(groupsData.groups.map(g => g.id));
    }
  };

  const validate = (needText = true) => {
    if (selectedGroups.length === 0) {
      toast({ title: 'تنبيه', description: 'اختر مجموعة واحدة على الأقل', variant: 'destructive' });
      return false;
    }
    if (needText && !text.trim()) {
      toast({ title: 'تنبيه', description: 'اكتب نص الرسالة', variant: 'destructive' });
      return false;
    }
    return true;
  };

  const onSend = () => {
    if (!validate()) return;
    sendMut.mutate({ data: { groupIds: selectedGroups, text } }, {
      onSuccess: () => {
        toast({ title: '✅ تم الإرسال', description: `أُرسلت إلى ${selectedGroups.length} مجموعة` });
        setLastSentText(text);
        setJustSent(true);
        setTimeout(() => setJustSent(false), 3000);
      },
      onError: (err: any) => toast({ title: 'خطأ', description: err?.message || 'فشل الإرسال', variant: 'destructive' }),
    });
  };

  const enterEditMode = () => {
    if (selectedGroups.length === 0) {
      toast({ title: 'تنبيه', description: 'اختر المجموعات التي تريد تعديل رسالتها', variant: 'destructive' });
      return;
    }
    setEditText(lastSentText || text);
    setMode('edit');
  };

  const onConfirmEdit = () => {
    if (!editText.trim()) {
      toast({ title: 'تنبيه', description: 'اكتب النص الجديد للتعديل', variant: 'destructive' });
      return;
    }
    editMut.mutate({ data: { groupIds: selectedGroups, newText: editText } }, {
      onSuccess: () => {
        toast({ title: '✅ تم التعديل', description: 'عُدِّلت آخر رسالة بنجاح' });
        setLastSentText(editText);
        setMode('send');
        setText(editText);
      },
      onError: (err: any) => toast({ title: 'خطأ', description: err?.message || 'فشل التعديل', variant: 'destructive' }),
    });
  };

  const onDelete = () => {
    if (selectedGroups.length === 0) {
      toast({ title: 'تنبيه', description: 'اختر المجموعات', variant: 'destructive' });
      return;
    }
    if (!confirm('هل أنت متأكد من حذف آخر رسالة من المجموعات المحددة؟')) return;
    deleteMut.mutate({ data: { groupIds: selectedGroups } }, {
      onSuccess: () => {
        toast({ title: '✅ تم الحذف', description: 'حُذفت آخر رسالة بنجاح' });
        setLastSentText('');
        setMode('send');
        setText('');
      },
      onError: (err: any) => toast({ title: 'خطأ', description: err?.message || 'فشل الحذف', variant: 'destructive' }),
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">إرسال رسائل (Broadcast)</h1>
        <p className="text-muted-foreground mt-2">أرسل، عدل أو احذف رسائلك في المجموعات المحددة.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Editor Panel */}
        <div className="lg:col-span-2 space-y-4">

          {/* SEND MODE */}
          {mode === 'send' && (
            <div className="bg-card border border-border/50 rounded-3xl p-6 shadow-lg space-y-4">
              {justSent && (
                <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 text-sm font-semibold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>تم الإرسال — يمكنك الآن التعديل أو الحذف</span>
                </div>
              )}

              <label className="block text-sm font-bold">نص الرسالة (Message Text)</label>
              <textarea
                className="w-full h-52 bg-background border-2 border-border rounded-2xl p-4 text-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all resize-none leading-relaxed"
                placeholder="اكتب رسالتك هنا... يدعم النصوص الطويلة والأسطر المتعددة"
                value={text}
                onChange={(e) => setText(e.target.value)}
                dir="auto"
              />

              <div className="flex flex-wrap gap-3 pt-4 border-t border-border/50">
                <button
                  onClick={onSend}
                  disabled={sendMut.isPending}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25 transition-all disabled:opacity-50"
                >
                  {sendMut.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  إرسال
                </button>

                <button
                  onClick={enterEditMode}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold bg-secondary hover:bg-secondary/80 text-foreground border border-border transition-all"
                >
                  <Edit3 className="w-5 h-5" />
                  تعديل الأخير
                </button>

                <button
                  onClick={onDelete}
                  disabled={deleteMut.isPending}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold bg-destructive/10 text-destructive hover:bg-destructive hover:text-white transition-all disabled:opacity-50"
                >
                  {deleteMut.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                  حذف الأخير
                </button>
              </div>
            </div>
          )}

          {/* EDIT MODE */}
          {mode === 'edit' && (
            <div className="bg-card border-2 border-primary/30 rounded-3xl p-6 shadow-lg space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Edit3 className="w-5 h-5 text-primary" />
                  <h2 className="font-bold text-primary">تعديل الرسالة الأخيرة</h2>
                </div>
                <button
                  onClick={() => setMode('send')}
                  className="p-2 hover:bg-secondary rounded-lg transition-colors text-muted-foreground"
                  title="إلغاء"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {lastSentText && (
                <div className="p-3 bg-secondary/50 rounded-xl border border-border/50">
                  <p className="text-xs text-muted-foreground mb-1 font-semibold">الرسالة الحالية:</p>
                  <p className="text-sm text-foreground/70 whitespace-pre-wrap" dir="auto">{lastSentText}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-bold mb-2 text-primary">
                  ✏️ النص الجديد — اكتب هنا ما تريد تغييره:
                </label>
                <textarea
                  className="w-full h-52 bg-background border-2 border-primary/40 rounded-2xl p-4 text-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all resize-none leading-relaxed"
                  placeholder="اكتب النص الجديد الذي سيحل محل الرسالة السابقة..."
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  dir="auto"
                  autoFocus
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setMode('send')}
                  className="px-5 py-3 rounded-xl font-bold border border-border hover:bg-secondary transition-colors"
                >
                  إلغاء
                </button>
                <button
                  onClick={onConfirmEdit}
                  disabled={editMut.isPending || !editText.trim()}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25 transition-all disabled:opacity-50"
                >
                  {editMut.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Edit3 className="w-5 h-5" />}
                  تأكيد التعديل
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Groups List */}
        <div className="bg-card border border-border/50 rounded-3xl p-6 shadow-lg flex flex-col h-[500px]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              المجموعات ({groupsData?.groups?.length || 0})
            </h3>
            <button
              onClick={handleSelectAll}
              className="text-xs font-bold text-primary hover:underline px-2 py-1 bg-primary/10 rounded-lg"
            >
              {selectedGroups.length === (groupsData?.groups?.length || 0) && selectedGroups.length > 0
                ? 'إلغاء الكل'
                : 'تحديد الكل'}
            </button>
          </div>

          {selectedGroups.length > 0 && (
            <div className="mb-3 px-3 py-2 bg-primary/10 border border-primary/20 rounded-xl text-xs font-semibold text-primary">
              ✓ محدد: {selectedGroups.length} مجموعة
            </div>
          )}

          <div className="flex-1 overflow-y-auto pr-1 space-y-2">
            {loadingGroups ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            ) : !groupsData?.groups?.length ? (
              <div className="text-center text-muted-foreground mt-10 text-sm">لا توجد مجموعات</div>
            ) : (
              groupsData.groups.map(group => (
                <label
                  key={group.id}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border select-none',
                    selectedGroups.includes(group.id)
                      ? 'bg-primary/10 border-primary/30'
                      : 'bg-background border-border/50 hover:border-border'
                  )}
                >
                  <div className="relative flex items-center justify-center w-5 h-5 flex-shrink-0">
                    <input
                      type="checkbox"
                      className="peer appearance-none w-5 h-5 border-2 border-muted-foreground rounded bg-background checked:bg-primary checked:border-primary transition-all cursor-pointer"
                      checked={selectedGroups.includes(group.id)}
                      onChange={() => handleToggleGroup(group.id)}
                    />
                    <div className="absolute text-primary-foreground opacity-0 peer-checked:opacity-100 pointer-events-none">
                      <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                        <path d="M1 5L4.5 8.5L11 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate" dir="auto">{group.name}</div>
                    <div className="text-xs text-muted-foreground font-english">{group.type}</div>
                  </div>
                </label>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
