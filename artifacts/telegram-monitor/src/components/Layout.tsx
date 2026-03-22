import React from 'react';
import { Link, useLocation } from 'wouter';
import { Activity, Send, Settings, LogOut, User as UserIcon, ShieldAlert } from 'lucide-react';
import { useGetAuthStatus, useLogout } from '@workspace/api-client-react';
import { InstallPWA } from './InstallPWA';
import { useToast } from '@/hooks/use-toast';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: authStatus, refetch } = useGetAuthStatus();
  const { mutate: logout, isPending: isLoggingOut } = useLogout();
  const { toast } = useToast();

  const handleLogout = () => {
    logout(undefined, {
      onSuccess: () => {
        toast({ title: 'تم تسجيل الخروج بنجاح', description: 'Logged out successfully' });
        refetch();
        setLocation('/login');
      },
      onError: () => {
        toast({ title: 'حدث خطأ', description: 'Failed to logout', variant: 'destructive' });
      }
    });
  };

  const navItems = [
    { path: '/', label: 'لوحة التحكم', eng: 'Dashboard', icon: Activity },
    { path: '/broadcast', label: 'إرسال رسائل', eng: 'Broadcast', icon: Send },
    { path: '/monitor', label: 'إعدادات المراقبة', eng: 'Monitor Settings', icon: Settings },
  ];

  if (location === '/login') {
    return <div className="min-h-screen relative">{children}</div>;
  }

  if (!authStatus?.authorized) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background relative overflow-hidden">
      {/* Background Image Overlay */}
      <div 
        className="absolute inset-0 z-0 opacity-5 pointer-events-none"
        style={{ 
          backgroundImage: `url(${import.meta.env.BASE_URL}images/telegram-bg.png)`,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      />

      {/* Sidebar / Mobile Header */}
      <aside className="telegram-glass border-b md:border-b-0 md:border-l border-border/50 w-full md:w-72 flex-shrink-0 flex flex-col z-10">
        <div className="p-6 flex items-center justify-between md:justify-center border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20">
              <ShieldAlert className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">برنامج أنور</h1>
              <p className="text-xs text-muted-foreground font-english">Anwer Monitor</p>
            </div>
          </div>
          <div className="md:hidden">
            <InstallPWA />
          </div>
        </div>

        <div className="p-4 flex-1 flex flex-col gap-2 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.path;
            return (
              <Link 
                key={item.path} 
                href={item.path}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
                  isActive 
                    ? "bg-primary/10 text-primary font-bold shadow-sm" 
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <Icon className={cn("w-5 h-5", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                <div className="flex flex-col">
                  <span>{item.label}</span>
                  <span className="text-[10px] opacity-70 font-english">{item.eng}</span>
                </div>
              </Link>
            );
          })}
        </div>

        <div className="p-4 border-t border-border/50">
          <div className="hidden md:block mb-4">
            <InstallPWA />
          </div>
          
          <div className="flex items-center justify-between bg-card p-3 rounded-xl border border-border/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                <UserIcon className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="overflow-hidden">
                <p className="text-sm font-bold truncate max-w-[120px]">
                  {authStatus?.user?.firstName || 'User'}
                </p>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                  <span className="text-xs text-muted-foreground">متصل (Online)</span>
                </div>
              </div>
            </div>
            
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
              title="تسجيل الخروج (Logout)"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden z-10">
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-4xl mx-auto w-full animate-fade-in">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
