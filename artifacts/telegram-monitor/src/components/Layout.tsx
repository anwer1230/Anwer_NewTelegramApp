import React, { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'wouter';
import {
  Activity, Send, Settings, LogOut, UserPlus, MessageCircle, Sun, Moon,
  Check, Trash2, ChevronDown, ChevronUp, Loader2
} from 'lucide-react';
import { useGetAuthStatus, useLogout } from '@workspace/api-client-react';
import { InstallPWA } from './InstallPWA';
import { useTheme } from './ThemeProvider';
import { useToast } from '@/hooks/use-toast';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface AccountInfo {
  id: string;
  phone: string;
  authorized: boolean;
  isActive: boolean;
  userInfo: { firstName: string; lastName: string; username: string; phone: string } | null;
}

function useAccounts() {
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/accounts');
      if (res.ok) {
        const data = await res.json();
        setAccounts(data.accounts || []);
        setActiveId(data.activeId || null);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const switchAccount = async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/accounts/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: id }),
      });
      if (res.ok) {
        await fetchAccounts();
        window.location.href = '/';
      }
    } catch {} finally { setLoading(false); }
  };

  const removeAccount = async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchAccounts();
        window.location.href = '/';
      }
    } catch {} finally { setLoading(false); }
  };

  return { accounts, activeId, loading, fetchAccounts, switchAccount, removeAccount };
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: authStatus, refetch } = useGetAuthStatus();
  const { mutate: logout, isPending: isLoggingOut } = useLogout();
  const { toast } = useToast();
  const { theme, toggleTheme } = useTheme();
  const { accounts, loading: accountsLoading, switchAccount, removeAccount, fetchAccounts } = useAccounts();
  const [showAccounts, setShowAccounts] = useState(false);

  // Refresh accounts when auth status changes
  useEffect(() => { fetchAccounts(); }, [authStatus, fetchAccounts]);

  const handleLogout = () => {
    logout(undefined, {
      onSuccess: () => {
        setTimeout(() => toast({ title: 'تم تسجيل الخروج بنجاح' }), 0);
        refetch();
        fetchAccounts();
        setLocation('/login');
      },
      onError: () => {
        setTimeout(() => toast({ title: 'حدث خطأ أثناء تسجيل الخروج', variant: 'destructive' }), 0);
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

  const activeAccount = accounts.find(a => a.isActive);
  const displayName = authStatus?.user?.firstName || activeAccount?.userInfo?.firstName || 'مستخدم';
  const displayPhone = authStatus?.user?.phone || activeAccount?.userInfo?.phone || activeAccount?.phone || '';

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background" dir="rtl">
      {/* Sidebar */}
      <aside className="bg-sidebar border-b md:border-b-0 md:border-l border-sidebar-border w-full md:w-64 flex-shrink-0 flex flex-col">

        {/* App Header */}
        <div className="p-5 flex items-center justify-between border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full gradient-telegram flex items-center justify-center shadow-md flex-shrink-0">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            <div className="overflow-hidden">
              <h1 className="font-bold text-sm text-sidebar-foreground leading-tight">برنامج أنور</h1>
              <p className="text-xs text-sidebar-foreground/50 truncate">Anwer Monitor</p>
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
            <div className="md:hidden"><InstallPWA /></div>
          </div>
        </div>

        {/* Nav Links */}
        <nav className="flex flex-row md:flex-col p-3 gap-1 overflow-x-auto md:overflow-x-visible">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.path;
            return (
              <Link
                key={item.path}
                href={item.path}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg transition-all whitespace-nowrap",
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

        {/* Accounts Panel (desktop) */}
        <div className="hidden md:flex flex-col mt-auto p-3 gap-2 border-t border-sidebar-border">
          <InstallPWA />

          {/* Accounts Switcher */}
          <div className="rounded-xl border border-sidebar-border overflow-hidden">
            {/* Active Account Row */}
            <button
              onClick={() => setShowAccounts(prev => !prev)}
              className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-sidebar-accent transition-colors"
            >
              <div className="w-8 h-8 rounded-full gradient-telegram flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 overflow-hidden text-right">
                <p className="text-sm font-semibold text-sidebar-foreground truncate">{displayName}</p>
                <p className="text-xs text-sidebar-foreground/50 truncate" dir="ltr">{displayPhone}</p>
              </div>
              <div className="flex items-center gap-1">
                {accountsLoading && <Loader2 className="w-3 h-3 animate-spin text-sidebar-foreground/40" />}
                {showAccounts ? <ChevronUp className="w-4 h-4 text-sidebar-foreground/50" /> : <ChevronDown className="w-4 h-4 text-sidebar-foreground/50" />}
              </div>
            </button>

            {/* Accounts List Dropdown */}
            {showAccounts && (
              <div className="border-t border-sidebar-border bg-sidebar-accent/30">
                {/* Other accounts */}
                {accounts.map((acc) => {
                  const name = acc.userInfo?.firstName || acc.phone || acc.id.slice(-6);
                  const phone = acc.userInfo?.phone || acc.phone;
                  return (
                    <div key={acc.id} className={cn(
                      "flex items-center gap-2 px-3 py-2 group",
                      acc.isActive ? "bg-sidebar-accent/50" : "hover:bg-sidebar-accent/50"
                    )}>
                      <button
                        onClick={() => !acc.isActive && switchAccount(acc.id)}
                        disabled={acc.isActive || accountsLoading}
                        className="flex-1 flex items-center gap-2 text-right overflow-hidden"
                        title={acc.isActive ? 'الحساب النشط' : `التبديل إلى ${name}`}
                      >
                        <div className={cn(
                          "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold",
                          acc.isActive ? "gradient-telegram text-white" : "bg-sidebar-border text-sidebar-foreground"
                        )}>
                          {name.charAt(0).toUpperCase()}
                        </div>
                        <div className="overflow-hidden flex-1">
                          <p className={cn("text-xs font-semibold truncate", acc.isActive ? "text-primary" : "text-sidebar-foreground")}>
                            {name}
                            {acc.isActive && <span className="mr-1 text-[9px] opacity-70">(نشط)</span>}
                          </p>
                          <p className="text-[10px] text-sidebar-foreground/50 truncate" dir="ltr">{phone}</p>
                        </div>
                        {acc.isActive && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                      </button>
                      {!acc.isActive && (
                        <button
                          onClick={() => removeAccount(acc.id)}
                          disabled={accountsLoading}
                          className="p-1 rounded text-sidebar-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                          title="إزالة الحساب"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}

                {/* Add Account */}
                <Link
                  href="/login?mode=add"
                  className="flex items-center gap-2 px-3 py-2.5 text-primary hover:bg-sidebar-accent transition-colors border-t border-sidebar-border"
                  onClick={() => setShowAccounts(false)}
                >
                  <div className="w-7 h-7 rounded-full border-2 border-dashed border-primary/40 flex items-center justify-center flex-shrink-0">
                    <UserPlus className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-semibold">إضافة حساب جديد</span>
                </Link>

                {/* Logout active account */}
                <button
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-destructive/80 hover:text-destructive hover:bg-destructive/10 transition-colors border-t border-sidebar-border"
                >
                  {isLoggingOut ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                  <span className="text-xs font-semibold">تسجيل خروج الحساب النشط</span>
                </button>
              </div>
            )}
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
