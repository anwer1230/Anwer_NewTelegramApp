import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { ShieldAlert, Smartphone, Key, KeyRound, ArrowRight, Loader2 } from 'lucide-react';
import { useSendCode, useVerifyCode, useGetAuthStatus } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { refetch: refetchAuth } = useGetAuthStatus();
  
  const [step, setStep] = useState<1 | 2>(1);
  const [phone, setPhone] = useState('');
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [code, setCode] = useState('');
  const [phoneCodeHash, setPhoneCodeHash] = useState('');

  const sendCodeMutation = useSendCode();
  const verifyCodeMutation = useVerifyCode();

  const handleRequestCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || !apiId || !apiHash) {
      toast({ title: 'خطأ', description: 'الرجاء تعبئة جميع الحقول', variant: 'destructive' });
      return;
    }

    sendCodeMutation.mutate(
      { data: { phone, apiId: parseInt(apiId), apiHash } },
      {
        onSuccess: (res) => {
          if (res.success && res.phoneCodeHash) {
            setPhoneCodeHash(res.phoneCodeHash);
            setStep(2);
            toast({ title: 'نجاح', description: 'تم إرسال رمز التحقق (Code sent)' });
          } else {
            toast({ title: 'خطأ', description: 'فشل إرسال الرمز', variant: 'destructive' });
          }
        },
        onError: (err: any) => {
          toast({ title: 'خطأ (Error)', description: err?.response?.data?.error || 'حدث خطأ في الاتصال', variant: 'destructive' });
        }
      }
    );
  };

  const handleVerifyCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code) {
      toast({ title: 'خطأ', description: 'الرجاء إدخال رمز التحقق', variant: 'destructive' });
      return;
    }

    verifyCodeMutation.mutate(
      { data: { phone, code, phoneCodeHash } },
      {
        onSuccess: async (res) => {
          if (res.success) {
            toast({ title: 'نجاح', description: 'تم تسجيل الدخول بنجاح (Logged in)' });
            await refetchAuth();
            setLocation('/');
          } else {
            toast({ title: 'خطأ', description: 'رمز التحقق غير صحيح', variant: 'destructive' });
          }
        },
        onError: (err: any) => {
          toast({ title: 'خطأ (Error)', description: err?.response?.data?.error || 'فشل التحقق', variant: 'destructive' });
        }
      }
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-background">
      <div 
        className="absolute inset-0 z-0 opacity-10 pointer-events-none"
        style={{ 
          backgroundImage: `url(${import.meta.env.BASE_URL}images/telegram-bg.png)`,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      />
      
      <div className="w-full max-w-md telegram-glass rounded-3xl p-8 shadow-2xl relative z-10 animate-slide-up border border-border/50">
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-tr from-primary to-accent rounded-2xl flex items-center justify-center shadow-lg shadow-primary/25 mb-6 rotate-3">
            <ShieldAlert className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">برنامج أنور</h1>
          <p className="text-muted-foreground mt-2 font-english">Anwer Monitor Login</p>
        </div>

        {step === 1 ? (
          <form onSubmit={handleRequestCode} className="space-y-5">
            <div className="space-y-1">
              <label className="text-sm font-semibold flex justify-between">
                <span>رقم الهاتف <span className="text-destructive">*</span></span>
                <span className="text-muted-foreground font-english text-xs">Phone Number</span>
              </label>
              <div className="relative">
                <Smartphone className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="text"
                  dir="ltr"
                  placeholder="+966xxxxxxxxx"
                  className="w-full bg-secondary/50 border-2 border-border rounded-xl py-3 pl-4 pr-12 text-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-english"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-semibold flex justify-between">
                <span>API ID <span className="text-destructive">*</span></span>
              </label>
              <div className="relative">
                <Key className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="text"
                  dir="ltr"
                  className="w-full bg-secondary/50 border-2 border-border rounded-xl py-3 pl-4 pr-12 text-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-english"
                  value={apiId}
                  onChange={(e) => setApiId(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-semibold flex justify-between">
                <span>API Hash <span className="text-destructive">*</span></span>
              </label>
              <div className="relative">
                <KeyRound className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="text"
                  dir="ltr"
                  className="w-full bg-secondary/50 border-2 border-border rounded-xl py-3 pl-4 pr-12 text-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-english"
                  value={apiHash}
                  onChange={(e) => setApiHash(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={sendCodeMutation.isPending}
              className="w-full mt-6 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary text-primary-foreground font-bold py-4 rounded-xl shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {sendCodeMutation.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <span>طلب الرمز (Request Code)</span>
                  <ArrowRight className="w-5 h-5 rotate-180" />
                </>
              )}
            </button>
            <p className="text-xs text-center text-muted-foreground mt-4">
              يمكنك الحصول على API ID و Hash من <a href="https://my.telegram.org" target="_blank" rel="noreferrer" className="text-primary hover:underline">my.telegram.org</a>
            </p>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="space-y-5 animate-fade-in">
            <div className="p-4 bg-primary/10 border border-primary/20 rounded-xl mb-6 flex flex-col items-center text-center">
              <p className="text-sm font-semibold text-primary mb-1">تم إرسال الرمز إلى هاتفك</p>
              <p className="text-xs text-muted-foreground font-english" dir="ltr">{phone}</p>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-semibold flex justify-between">
                <span>رمز التحقق <span className="text-destructive">*</span></span>
                <span className="text-muted-foreground font-english text-xs">Auth Code</span>
              </label>
              <input
                type="text"
                dir="ltr"
                placeholder="12345"
                className="w-full bg-secondary/50 border-2 border-border rounded-xl py-4 px-4 text-center tracking-[0.5em] text-2xl font-bold text-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-english"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoFocus
              />
            </div>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-4 rounded-xl font-bold border border-border hover:bg-secondary transition-colors"
              >
                رجوع
              </button>
              <button
                type="submit"
                disabled={verifyCodeMutation.isPending}
                className="flex-1 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary text-primary-foreground font-bold py-4 rounded-xl shadow-lg shadow-primary/25 hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {verifyCodeMutation.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <span>تسجيل الدخول (Login)</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
