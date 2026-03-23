import React from 'react';
import { Link, useLocation } from 'wouter';
import { Activity, Send, Settings, LogOut, User as UserIcon, MessageCircle, Sun, Moon } from 'lucide-react';
import { useGetAuthStatus, useLogout } from '@workspace/api-client-react';
import { InstallPWA } from './InstallPWA';
import { useTheme } from './ThemeProvider';
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
  const { theme, toggleTheme } = useTheme();

  const handleLogout = () => {
    logout(undefined, {
      onSuccess: () => {
        setTimeout(() => {
          toast({ title: 'تم تسجيل الخروج بنجاح' });
        }, 0);
        refetch();
        setLocation('/login');
      },
      onError: () => {
        setTimeout(() => {
          toast({ title: 'حدث خطأ أثناء تسجيل الخروج', variant: 'destructive' });
        }, 0);
      }
    });
  };

  const navItems = [
    { path: '/', label: 'لوحة التحكم', eng: 'Dashboard', icon: Activity },
    { path: '/broadcast', label: 'إرسال رسائل', eng: 'Broadcast', icon: Send },
    { path: '/monitor', label: 'إعدادات المراقبة', eng: 'Monitor Settings', icon: Settings },
  ];

  if (location === '/login' || !authStatus?.authorized) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background" dir="rtl">
      {/* Sidebar */}
      <aside className="bg-sidebar border-b md:border-b-0 md:border-l border-sidebar-border w-full md:w-64 flex-shrink-0 flex flex-col">
        {/* App Header */}
        <div className="p-5 flex items-center justify-between md:justify-center border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full gradient-telegram flex items-center justify-center shadow-md">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-base leading-tight text-sidebar-foreground">برنامج أنور</h1>
              <p className="text-xs text-sidebar-foreground/60">Anwer Monitor</p>
            </div>
          </div>
          <div className="md:hidden flex items-center gap-1">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
              title={theme === 'dark' ? 'وضع فاتح' : 'وضع داكن'}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <InstallPWA />
          </div>
        </div>

        {/* Nav Links */}
        <nav className="flex flex-row md:flex-col p-3 gap-1 overflow-x-auto md:overflow-x-visible md:flex-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.path;
            return (
              <Link
                key={item.path}
                href={item.path}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 whitespace-nowrap",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-sm"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <div className="flex flex-col">
                  <span className="text-sm">{item.label}</span>
                  <span className="text-[10px] opacity-60">{item.eng}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Footer: user info + actions */}
        <div className="hidden md:flex flex-col p-3 gap-2 border-t border-sidebar-border">
          <InstallPWA />

          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-sidebar-accent/50">
            <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center flex-shrink-0">
              <UserIcon className="w-4 h-4 text-sidebar-accent-foreground" />
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-semibold text-sidebar-foreground truncate">
                {authStatus?.user?.firstName || 'مستخدم'}
              </p>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                <span className="text-xs text-sidebar-foreground/60">متصل</span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={toggleTheme}
                className="p-1.5 rounded-md text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                title={theme === 'dark' ? 'وضع فاتح' : 'وضع داكن'}
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="p-1.5 rounded-md text-sidebar-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="تسجيل الخروج"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-4 md:p-6 max-w-4xl mx-auto w-full animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  );
}
