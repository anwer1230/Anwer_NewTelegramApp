import React, { useState, useEffect, useRef } from 'react';
import { ShieldAlert, Smartphone, Loader2, CheckCircle2, Zap } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

const API_BASE = '/api';

export default function Login() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<1 | 2>(1);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [phoneCodeHash, setPhoneCodeHash] = useState('');
  const [loadingSend, setLoadingSend] = useState(false);
  const [loadingVerify, setLoadingVerify] = useState(false);
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [autoDetected, setAutoDetected] = useState(false);
  const [autoVerifying, setAutoVerifying] = useState(false);
  const [dots, setDots] = useState('');
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!autoDetecting) return;
    const interval = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.');
    }, 400);
    return () => clearInterval(interval);
  }, [autoDetecting]);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  const goToDashboard = async () => {
    await queryClient.invalidateQueries();
    window.location.href = '/';
  };

  const startOtpStream = () => {
    eventSourceRef.current?.close();
    setAutoDetecting(true);

    const es = new EventSource(`${API_BASE}/auth/otp-stream`);
    eventSourceRef.current = es;

    es.addEventListener('otp', (e) => {
      const { code: detectedCode } = JSON.parse(e.data);
      setCode(detectedCode);
      setAutoDetected(true);
      setAutoDetecting(false);
      setAutoVerifying(true);
      toast({ title: '✅ تم اكتشاف الكود', description: `${detectedCode} — جاري التحقق تلقائياً...` });
    });

    es.addEventListener('verified', async (e) => {
      const data = JSON.parse(e.data);
      setAutoVerifying(false);
      if (data.success) {
        toast({ title: '🎉 تم تسجيل الدخول!', description: 'مرحباً بك في برنامج أنور' });
        await goToDashboard();
      } else {
        toast({ title: 'فشل التحقق التلقائي', description: data.error || 'أدخل الكود يدوياً', variant: 'destructive' });
      }
      es.close();
    });

    es.onerror = () => {
      setAutoDetecting(false);
    };
  };

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone) {
      toast({ title: 'خطأ', description: 'أدخل رقم الهاتف', variant: 'destructive' });
      return;
    }
    setLoadingSend(true);
    try {
      const res = await fetch(`${API_BASE}/auth/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل إرسال الرمز');
      setPhoneCodeHash(data.phoneCodeHash);
      setStep(2);
      toast({ title: '✅ تم الإرسال', description: 'جاري البحث عن الكود تلقائياً...' });
      startOtpStream();
    } catch (err: any) {
      toast({ title: 'خطأ', description: err.message, variant: 'destructive' });
    } finally {
      setLoadingSend(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code) {
      toast({ title: 'خطأ', description: 'أدخل رمز التحقق', variant: 'destructive' });
      return;
    }
    eventSourceRef.current?.close();
    setLoadingVerify(true);
    try {
      const res = await fetch(`${API_BASE}/auth/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code, phoneCodeHash }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'رمز التحقق غير صحيح');
      toast({ title: '🎉 تم تسجيل الدخول', description: 'مرحباً بك' });
      await goToDashboard();
    } catch (err: any) {
      toast({ title: 'خطأ', description: err.message, variant: 'destructive' });
    } finally {
      setLoadingVerify(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md telegram-glass rounded-3xl p-8 shadow-2xl border border-border/50 animate-slide-up">
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-tr from-primary to-accent rounded-2xl flex items-center justify-center shadow-lg shadow-primary/25 mb-6 rotate-3">
            <ShieldAlert className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">برنامج أنور</h1>
          <p className="text-muted-foreground mt-2 font-english">Anwer Monitor Login</p>
        </div>

        {/* Step 1: Phone */}
        {step === 1 && (
          <form onSubmit={handleRequestCode} className="space-y-5">
            <div className="space-y-1">
              <label className="text-sm font-semibold flex justify-between">
                <span>رقم الهاتف <span className="text-destructive">*</span></span>
                <span className="text-muted-foreground font-english text-xs">Phone Number</span>
              </label>
              <div className="relative">
                <Smartphone className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  dir="ltr"
                  placeholder="+966xxxxxxxxx"
                  className="w-full bg-secondary/50 border-2 border-border rounded-xl py-3 pl-4 pr-12 text-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-english"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loadingSend}
              className="w-full mt-6 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary text-primary-foreground font-bold py-4 rounded-xl shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loadingSend ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Zap className="w-5 h-5" />
                  <span>طلب الكود (Request Code)</span>
                </>
              )}
            </button>

            <p className="text-xs text-center text-muted-foreground mt-4">
              سيُرسَل رمز التحقق إلى تطبيق تيليغرام الخاص بك
            </p>
          </form>
        )}

        {/* Step 2: OTP */}
        {step === 2 && (
          <div className="space-y-5 animate-fade-in">
            {/* Auto-detect status */}
            {autoVerifying ? (
              <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-2xl flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-green-400 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-green-400">تم اكتشاف الكود — جاري التحقق...</p>
                  <p className="text-xs text-muted-foreground font-english" dir="ltr">{code}</p>
                </div>
                <Loader2 className="w-5 h-5 animate-spin text-green-400" />
              </div>
            ) : autoDetecting ? (
              <div className="p-4 bg-primary/10 border border-primary/20 rounded-2xl flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                  <Zap className="w-4 h-4 text-primary animate-pulse" />
                </div>
                <div>
                  <p className="text-sm font-bold text-primary">جاري البحث عن الكود تلقائياً{dots}</p>
                  <p className="text-xs text-muted-foreground">سيتم التحقق فوراً عند وصول الكود</p>
                </div>
              </div>
            ) : autoDetected ? (
              <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-2xl flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-green-400 flex-shrink-0" />
                <p className="text-sm font-bold text-green-400">تم اكتشاف الكود: {code}</p>
              </div>
            ) : (
              <div className="p-4 bg-secondary/50 border border-border/50 rounded-2xl text-center">
                <p className="text-sm font-semibold text-foreground mb-1">تم إرسال الكود إلى تيليغرام</p>
                <p className="text-xs text-muted-foreground font-english" dir="ltr">{phone}</p>
              </div>
            )}

            <form onSubmit={handleVerifyCode} className="space-y-5">
              <div className="space-y-1">
                <label className="text-sm font-semibold flex justify-between">
                  <span>رمز التحقق</span>
                  <span className="text-xs text-muted-foreground">أو أدخله يدوياً</span>
                </label>
                <input
                  type="text"
                  dir="ltr"
                  placeholder="12345"
                  className={`w-full border-2 rounded-xl py-4 px-4 text-center tracking-[0.4em] text-2xl font-bold text-foreground focus:outline-none focus:ring-4 transition-all font-english ${
                    autoDetected || autoVerifying
                      ? 'bg-green-500/10 border-green-500/30 focus:border-green-500 focus:ring-green-500/10'
                      : 'bg-secondary/50 border-border focus:border-primary focus:ring-primary/10'
                  }`}
                  value={code}
                  onChange={(e) => { setCode(e.target.value); setAutoDetected(false); }}
                  disabled={autoVerifying || loadingVerify}
                  autoFocus={!autoDetecting}
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                    setAutoDetecting(false);
                    setAutoDetected(false);
                    setAutoVerifying(false);
                    setCode('');
                    eventSourceRef.current?.close();
                  }}
                  className="px-5 py-4 rounded-xl font-bold border border-border hover:bg-secondary transition-colors"
                >
                  رجوع
                </button>
                <button
                  type="submit"
                  disabled={loadingVerify || autoVerifying || !code}
                  className="flex-1 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary text-primary-foreground font-bold py-4 rounded-xl shadow-lg shadow-primary/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loadingVerify || autoVerifying ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <span>تحقق يدوياً</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
