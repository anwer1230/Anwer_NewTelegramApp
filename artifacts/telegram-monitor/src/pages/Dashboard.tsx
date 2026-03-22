import React from 'react';
import { useGetAuthStatus, useGetMonitorStatus } from '@workspace/api-client-react';
import { Activity, ShieldCheck, MessagesSquare, Zap, Clock } from 'lucide-react';
import { Link } from 'wouter';

export default function Dashboard() {
  const { data: authStatus } = useGetAuthStatus();
  const { data: monitorStatus } = useGetMonitorStatus({
    query: { refetchInterval: 5000 }
  });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">مرحباً، {authStatus?.user?.firstName || 'مستخدم'}!</h1>
          <p className="text-muted-foreground mt-2">نظرة عامة على حالة البرنامج (Overview)</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Status Card */}
        <div className="bg-card border border-border/50 rounded-2xl p-6 shadow-lg shadow-black/5 hover:border-primary/30 transition-all group">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg">حالة الحساب</h3>
            <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
              <ShieldCheck className="w-6 h-6 text-green-500" />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold text-green-500">متصل</span>
            <span className="text-sm text-muted-foreground mb-1 font-english">Connected</span>
          </div>
          <p className="text-sm text-muted-foreground mt-2 font-english" dir="ltr">{authStatus?.user?.phone}</p>
        </div>

        {/* Monitor Engine Card */}
        <div className="bg-card border border-border/50 rounded-2xl p-6 shadow-lg shadow-black/5 hover:border-accent/30 transition-all group">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg">محرك المراقبة</h3>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 ${monitorStatus?.running ? 'bg-primary/10' : 'bg-muted'}`}>
              <Activity className={`w-6 h-6 ${monitorStatus?.running ? 'text-primary' : 'text-muted-foreground'}`} />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <span className={`text-3xl font-bold ${monitorStatus?.running ? 'text-primary' : 'text-muted-foreground'}`}>
              {monitorStatus?.running ? 'يعمل' : 'متوقف'}
            </span>
            <span className="text-sm text-muted-foreground mb-1 font-english">
              {monitorStatus?.running ? 'Running' : 'Stopped'}
            </span>
          </div>
          <div className="mt-4 pt-4 border-t border-border/50 flex justify-between text-sm">
            <span className="text-muted-foreground">الردود المرسلة:</span>
            <span className="font-bold">{monitorStatus?.autoRepliesSent || 0}</span>
          </div>
        </div>

        {/* Messages Processed */}
        <div className="bg-card border border-border/50 rounded-2xl p-6 shadow-lg shadow-black/5 hover:border-border transition-all group">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg">الرسائل المستلمة</h3>
            <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center group-hover:scale-110 transition-transform">
              <MessagesSquare className="w-6 h-6 text-muted-foreground" />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold text-foreground">
              {monitorStatus?.messagesReceived || 0}
            </span>
            <span className="text-sm text-muted-foreground mb-1 font-english">Processed</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
        <Link href="/broadcast">
          <div className="bg-gradient-to-br from-primary/10 to-transparent border border-primary/20 hover:border-primary/50 rounded-3xl p-8 cursor-pointer transition-all hover:shadow-xl hover:shadow-primary/5 group relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
            <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-primary/30 group-hover:-translate-y-1 transition-transform">
              <Zap className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-2xl font-bold mb-2">إرسال رسائل جماعية</h2>
            <p className="text-muted-foreground">أرسل إعلانات ورسائل إلى مجموعاتك المحددة بضغطة زر واحدة.</p>
          </div>
        </Link>
        
        <Link href="/monitor">
          <div className="bg-gradient-to-br from-accent/10 to-transparent border border-accent/20 hover:border-accent/50 rounded-3xl p-8 cursor-pointer transition-all hover:shadow-xl hover:shadow-accent/5 group relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-accent/50 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
            <div className="w-14 h-14 bg-accent rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-accent/30 group-hover:-translate-y-1 transition-transform">
              <Clock className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-2xl font-bold mb-2">إعدادات الرد التلقائي</h2>
            <p className="text-muted-foreground">راقب الكلمات المفتاحية وقم بإعداد الردود التلقائية للمجموعات.</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
