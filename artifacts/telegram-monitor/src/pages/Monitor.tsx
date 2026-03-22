import React, { useState, useEffect } from 'react';
import { 
  useGetMonitorSettings, 
  useSaveMonitorSettings,
  useGetGroups,
  useStartMonitor,
  useStopMonitor,
  useGetMonitorStatus
} from '@workspace/api-client-react';
import { Settings, Play, Square, Loader2, Save, Tags, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/components/Layout';

export default function Monitor() {
  const { toast } = useToast();
  
  const { data: settingsData, isLoading: loadingSettings, refetch: refetchSettings } = useGetMonitorSettings();
  const { data: groupsData } = useGetGroups();
  const { data: statusData, refetch: refetchStatus } = useGetMonitorStatus({
    query: { refetchInterval: 5000 } // Auto-refresh status
  });

  const saveMut = useSaveMonitorSettings();
  const startMut = useStartMonitor();
  const stopMut = useStopMonitor();

  // Local state for the form
  const [monitorGroupIds, setMonitorGroupIds] = useState<string[]>([]);
  const [keywords, setKeywords] = useState('');
  const [autoReplyText, setAutoReplyText] = useState('');
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);

  // Initialize form when data loads
  useEffect(() => {
    if (settingsData) {
      setMonitorGroupIds(settingsData.monitorGroupIds || []);
      setKeywords((settingsData.keywords || []).join(', '));
      setAutoReplyText(settingsData.autoReplyText || '');
      setAutoReplyEnabled(settingsData.autoReplyEnabled ?? false);
    }
  }, [settingsData]);

  const handleSave = () => {
    const kws = keywords.split(',').map(k => k.trim()).filter(Boolean);
    
    saveMut.mutate({
      data: {
        monitorGroupIds,
        keywords: kws,
        autoReplyText,
        autoReplyEnabled,
        targetGroupIds: settingsData?.targetGroupIds || [] // Keep existing if not exposed here
      }
    }, {
      onSuccess: () => {
        toast({ title: 'نجاح', description: 'تم حفظ الإعدادات' });
        refetchSettings();
      },
      onError: () => toast({ title: 'خطأ', description: 'فشل حفظ الإعدادات', variant: 'destructive' })
    });
  };

  const handleStart = () => {
    startMut.mutate(undefined, {
      onSuccess: () => {
        toast({ title: 'نجاح', description: 'تم تشغيل المراقبة (Monitor Started)' });
        refetchStatus();
      },
      onError: () => toast({ title: 'خطأ', description: 'فشل التشغيل', variant: 'destructive' })
    });
  };

  const handleStop = () => {
    stopMut.mutate(undefined, {
      onSuccess: () => {
        toast({ title: 'نجاح', description: 'تم إيقاف المراقبة (Monitor Stopped)' });
        refetchStatus();
      },
      onError: () => toast({ title: 'خطأ', description: 'فشل الإيقاف', variant: 'destructive' })
    });
  };

  const toggleGroup = (id: string) => {
    setMonitorGroupIds(prev => 
      prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]
    );
  };

  if (loadingSettings) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  const isRunning = statusData?.running;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">إعدادات المراقبة (Monitor)</h1>
          <p className="text-muted-foreground mt-2">راقب المجموعات ورد تلقائياً عند ظهور الكلمات المفتاحية.</p>
        </div>
        <div className="flex items-center gap-3 bg-card p-2 rounded-2xl border border-border/50 shadow-sm">
          <button
            onClick={handleStart}
            disabled={isRunning || startMut.isPending}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-all",
              isRunning 
                ? "bg-green-500/10 text-green-500 cursor-not-allowed" 
                : "bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/20"
            )}
          >
            {startMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            تشغيل
          </button>
          <button
            onClick={handleStop}
            disabled={!isRunning || stopMut.isPending}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-all",
              !isRunning 
                ? "bg-destructive/10 text-destructive cursor-not-allowed" 
                : "bg-destructive hover:bg-destructive/90 text-white shadow-lg shadow-destructive/20"
            )}
          >
            {stopMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4 fill-current" />}
            إيقاف
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Settings Column */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card border border-border/50 rounded-3xl p-6 shadow-lg">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Settings className="w-5 h-5 text-primary" />
                قواعد الرد التلقائي
              </h2>
              
              <label className="flex items-center gap-3 cursor-pointer">
                <span className="text-sm font-bold text-muted-foreground">تفعيل الرد التلقائي</span>
                <div className="relative inline-block w-12 h-6 rounded-full transition-colors duration-300 ease-in-out">
                  <input 
                    type="checkbox" 
                    className="peer absolute w-full h-full opacity-0 cursor-pointer"
                    checked={autoReplyEnabled}
                    onChange={(e) => setAutoReplyEnabled(e.target.checked)}
                  />
                  <div className="block bg-secondary w-full h-full rounded-full peer-checked:bg-primary transition-all shadow-inner"></div>
                  <div className="absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform duration-300 ease-out peer-checked:translate-x-6 shadow-md"></div>
                </div>
              </label>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-bold mb-2 flex items-center gap-2">
                  <Tags className="w-4 h-4 text-muted-foreground" />
                  الكلمات المفتاحية (افصل بينها بفاصلة ,)
                </label>
                <input
                  type="text"
                  dir="auto"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="مثال: واجبات, تقارير, مشروع تخرج"
                  className="w-full bg-background border-2 border-border rounded-xl py-3 px-4 text-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-bold mb-2">نص الرد التلقائي</label>
                <textarea
                  value={autoReplyText}
                  onChange={(e) => setAutoReplyText(e.target.value)}
                  dir="auto"
                  placeholder="اكتب الرد التلقائي هنا... (يدعم الرسائل الكبيرة)"
                  className="w-full h-48 bg-background border-2 border-border rounded-xl p-4 text-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all resize-none leading-relaxed"
                />
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-border/50 flex justify-end">
              <button
                onClick={handleSave}
                disabled={saveMut.isPending}
                className="flex items-center gap-2 px-8 py-3 rounded-xl font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all disabled:opacity-50"
              >
                {saveMut.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                حفظ الإعدادات (Save)
              </button>
            </div>
          </div>
        </div>

        {/* Groups Column */}
        <div className="bg-card border border-border/50 rounded-3xl p-6 shadow-lg flex flex-col h-[600px]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold flex items-center gap-2">
              <Users className="w-5 h-5 text-accent" />
              مراقبة المجموعات
            </h3>
            <span className="text-xs bg-accent/10 text-accent px-2 py-1 rounded-lg font-bold">
              {monitorGroupIds.length} محدد
            </span>
          </div>
          
          <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
            {groupsData?.groups?.length === 0 ? (
              <div className="text-center text-muted-foreground mt-10">لا توجد مجموعات</div>
            ) : (
              groupsData?.groups?.map(group => (
                <label 
                  key={group.id}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border",
                    monitorGroupIds.includes(group.id) 
                      ? "bg-accent/10 border-accent/30" 
                      : "bg-background border-border/50 hover:border-border"
                  )}
                >
                  <div className="relative flex items-center justify-center w-5 h-5">
                    <input
                      type="checkbox"
                      className="peer appearance-none w-5 h-5 border-2 border-muted-foreground rounded bg-background checked:bg-accent checked:border-accent transition-all cursor-pointer"
                      checked={monitorGroupIds.includes(group.id)}
                      onChange={() => toggleGroup(group.id)}
                    />
                    <div className="absolute text-accent-foreground opacity-0 peer-checked:opacity-100 pointer-events-none">
                      <svg width="12" height="10" viewBox="0 0 12 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M1 5L4.5 8.5L11 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate" dir="auto">{group.name}</div>
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
