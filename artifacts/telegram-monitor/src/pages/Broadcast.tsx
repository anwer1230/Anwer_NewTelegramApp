import React, { useState } from 'react';
import { 
  useGetGroups, 
  useSendMessage, 
  useEditMessage, 
  useDeleteMessage 
} from '@workspace/api-client-react';
import { Send, Edit3, Trash2, Users, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/components/Layout';

export default function Broadcast() {
  const { toast } = useToast();
  const { data: groupsData, isLoading: loadingGroups } = useGetGroups();
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [text, setText] = useState('');

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

  const validate = () => {
    if (selectedGroups.length === 0) {
      toast({ title: 'تنبيه', description: 'الرجاء اختيار مجموعة واحدة على الأقل', variant: 'destructive' });
      return false;
    }
    return true;
  };

  const onSend = () => {
    if (!validate() || !text) {
      if (!text) toast({ title: 'تنبيه', description: 'الرجاء كتابة الرسالة', variant: 'destructive' });
      return;
    }
    sendMut.mutate({ data: { groupIds: selectedGroups, text } }, {
      onSuccess: () => toast({ title: 'نجاح', description: 'تم الإرسال بنجاح' }),
      onError: () => toast({ title: 'خطأ', description: 'فشل الإرسال', variant: 'destructive' })
    });
  };

  const onEdit = () => {
    if (!validate() || !text) return;
    editMut.mutate({ data: { groupIds: selectedGroups, newText: text } }, {
      onSuccess: () => toast({ title: 'نجاح', description: 'تم التعديل بنجاح' }),
      onError: () => toast({ title: 'خطأ', description: 'فشل التعديل', variant: 'destructive' })
    });
  };

  const onDelete = () => {
    if (!validate()) return;
    if (confirm('هل أنت متأكد من حذف آخر رسالة من هذه المجموعات؟')) {
      deleteMut.mutate({ data: { groupIds: selectedGroups } }, {
        onSuccess: () => toast({ title: 'نجاح', description: 'تم الحذف بنجاح' }),
        onError: () => toast({ title: 'خطأ', description: 'فشل الحذف', variant: 'destructive' })
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">إرسال رسائل (Broadcast)</h1>
        <p className="text-muted-foreground mt-2">أرسل، عدل أو احذف الرسائل في المجموعات المحددة.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Editor */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card border border-border/50 rounded-3xl p-6 shadow-lg">
            <label className="block text-sm font-bold mb-3">
              نص الرسالة (Message Text)
            </label>
            <textarea
              className="w-full h-64 bg-background border-2 border-border rounded-2xl p-4 text-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all resize-none leading-relaxed"
              placeholder="اكتب رسالتك هنا... (يدعم النصوص الطويلة والأسطر المتعددة)"
              value={text}
              onChange={(e) => setText(e.target.value)}
              dir="auto"
            />

            <div className="flex flex-wrap gap-3 mt-6 pt-6 border-t border-border/50">
              <button
                onClick={onSend}
                disabled={sendMut.isPending}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all disabled:opacity-50"
              >
                {sendMut.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 ml-1" />}
                إرسال (Send)
              </button>
              <button
                onClick={onEdit}
                disabled={editMut.isPending}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold bg-secondary hover:bg-secondary/80 text-foreground border border-border transition-all disabled:opacity-50"
              >
                {editMut.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Edit3 className="w-5 h-5" />}
                تعديل الأخير (Edit)
              </button>
              <button
                onClick={onDelete}
                disabled={deleteMut.isPending}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-all disabled:opacity-50"
              >
                {deleteMut.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                حذف الأخير (Delete)
              </button>
            </div>
          </div>
        </div>

        {/* Groups Sidebar */}
        <div className="bg-card border border-border/50 rounded-3xl p-6 shadow-lg flex flex-col h-[600px]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              المجموعات ({groupsData?.groups?.length || 0})
            </h3>
            <button 
              onClick={handleSelectAll}
              className="text-xs font-bold text-primary hover:underline px-2 py-1 bg-primary/10 rounded-lg"
            >
              تحديد الكل
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
            {loadingGroups ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            ) : groupsData?.groups?.length === 0 ? (
              <div className="text-center text-muted-foreground mt-10">لا توجد مجموعات</div>
            ) : (
              groupsData?.groups?.map(group => (
                <label 
                  key={group.id}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border",
                    selectedGroups.includes(group.id) 
                      ? "bg-primary/10 border-primary/30" 
                      : "bg-background border-border/50 hover:border-border"
                  )}
                >
                  <div className="relative flex items-center justify-center w-5 h-5">
                    <input
                      type="checkbox"
                      className="peer appearance-none w-5 h-5 border-2 border-muted-foreground rounded bg-background checked:bg-primary checked:border-primary transition-all cursor-pointer"
                      checked={selectedGroups.includes(group.id)}
                      onChange={() => handleToggleGroup(group.id)}
                    />
                    <div className="absolute text-primary-foreground opacity-0 peer-checked:opacity-100 pointer-events-none">
                      <svg width="12" height="10" viewBox="0 0 12 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M1 5L4.5 8.5L11 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
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
