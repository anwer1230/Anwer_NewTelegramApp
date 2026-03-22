import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { ShieldAlert, Smartphone, Key, KeyRound, Loader2, CheckCircle2, Zap } from 'lucide-react';
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
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [autoDetected, setAutoDetected] = useState(false);
  const [autoVerifying, setAutoVerifying] = useState(false);
  const [dots, setDots] = useState('');
  const eventSourceRef = useRef<EventSource | null>(null);

  const sendCodeMutation = useSendCode();
  const verifyCodeMutation = useVerifyCode();

  useEffect(() => {
    if (!autoDetecting) return;
    const interval = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.');
    }, 400);
    return () => clearInterval(interval);
  }, [autoDetecting]);

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const startOtpStream = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setAutoDetecting(true);

    const es = new EventSource('/api/auth/otp-stream');
    eventSourceRef.current = es;

    es.addEventListener('otp', (e) => {
      const data = JSON.parse(e.data);
      const detectedCode = data.code;
      setCode(detectedCode);
      setAutoDetected(true);
      setAutoDetecting(false);
      setAutoVerifying(true);
      toast({
        title: '✅ تم اكتشاف الكود تلقائياً',
        description: `رمز التحقق: ${detectedCode} - جاري التحقق...`,
      });
    });

    es.addEventListener('verified', async (e) => {
      const data = JSON.parse(e.data);
      setAutoVerifying(false);
      if (data.success) {
        toast({ title: '🎉 تم تسجيل الدخول تلقائياً!', description: 'مرحباً بك في برنامج أنور' });
        await refetchAuth();
        setLocation('/');
      } else {
        toast({
          title: 'خطأ في التحقق التلقائي',
          description: data.error || 'أدخل الكود يدوياً',
          variant: 'destructive',
        });
        setAutoVerifying(false);
      }
      es.close();
    });

    es.onerror = () => {
      setAutoDetecting(false);
    };
  };

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
            toast({ title: '✅ نجاح', description: 'تم إرسال رمز التحقق - جاري البحث عنه تلقائياً...' });
            startOtpStream();
          } else {
            toast({ title: 'خطأ', description: 'فشل إرسال الرمز', variant: 'destructive' });
          }
        },
        onError: (err: any) => {
          toast({
            title: 'خطأ في الاتصال',
            description: err?.response?.data?.error || 'حدث خطأ في الاتصال بـ Telegram',
            variant: 'destructive',
          });
        },
      }
    );
  };

  const handleVerifyCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code) {
      toast({ title: 'خطأ', description: 'الرجاء إدخال رمز التحقق', variant: 'destructive' });
      return;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    verifyCodeMutation.mutate(
      { data: { phone, code, phoneCodeHash } },
      {
        onSuccess: async (res) => {
          if (res.success) {
            toast({ title: '🎉 نجاح', description: 'تم تسجيل الدخول بنجاح' });
            await refetchAuth();
            setLocation('/');
          } else {
            toast({ title: 'خطأ', description: 'رمز التحقق غير صحيح', variant: 'destructive' });
          }
        },
        onError: (err: any) => {
          toast({
            title: 'خطأ',
            description: err?.response?.data?.error || 'فشل التحقق من الرمز',
            variant: 'destructive',
          });
        },
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
          backgroundPosition: 'center',
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
                <Smartphone className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
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
              <label className="text-sm font-semibold">
                API ID <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <Key className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
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
              <label className="text-sm font-semibold">
                API Hash <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <KeyRound className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
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
                  <span>طلب الكود (Request Code)</span>
                  <Zap className="w-5 h-5" />
                </>
              )}
            </button>
            <p className="text-xs text-center text-muted-foreground mt-4">
              احصل على API ID و Hash من{' '}
              <a href="https://my.telegram.org" target="_blank" rel="noreferrer" className="text-primary hover:underline">
                my.telegram.org
              </a>
            </p>
          </form>
        ) : (
          <div className="space-y-5 animate-fade-in">
            {/* Auto-detect Status Banner */}
            {autoVerifying ? (
              <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-2xl flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-green-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-green-400">تم اكتشاف الكود - جاري التحقق...</p>
                  <p className="text-xs text-muted-foreground font-english" dir="ltr">{code}</p>
                </div>
                <Loader2 className="w-5 h-5 animate-spin text-green-400 mr-auto" />
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
                <div>
                  <p className="text-sm font-bold text-green-400">تم اكتشاف الكود: {code}</p>
                </div>
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
                  onChange={(e) => {
                    setCode(e.target.value);
                    setAutoDetected(false);
                  }}
                  disabled={autoVerifying}
                  autoFocus={!autoDetecting}
                />
              </div>

              <div className="flex gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                    setAutoDetecting(false);
                    setAutoDetected(false);
                    setAutoVerifying(false);
                    if (eventSourceRef.current) {
                      eventSourceRef.current.close();
                    }
                  }}
                  className="px-4 py-4 rounded-xl font-bold border border-border hover:bg-secondary transition-colors"
                >
                  رجوع
                </button>
                <button
                  type="submit"
                  disabled={verifyCodeMutation.isPending || autoVerifying || !code}
                  className="flex-1 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary text-primary-foreground font-bold py-4 rounded-xl shadow-lg shadow-primary/25 hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {verifyCodeMutation.isPending || autoVerifying ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <span>تحقق يدوياً (Verify)</span>
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
