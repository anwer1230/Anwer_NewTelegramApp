import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, Loader2, CheckCircle, AlertCircle, Phone } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';

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
  const [error, setError] = useState<string | null>(null);
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
      setTimeout(() => {
        toast({ title: '✅ تم اكتشاف الكود', description: `${detectedCode} — جاري التحقق تلقائياً...` });
      }, 0);
    });

    es.addEventListener('verified', async (e) => {
      const data = JSON.parse(e.data);
      setAutoVerifying(false);
      if (data.success) {
        setTimeout(() => {
          toast({ title: '🎉 تم تسجيل الدخول!', description: 'مرحباً بك في برنامج أنور' });
        }, 0);
        await goToDashboard();
      } else {
        setError(data.error || 'فشل التحقق التلقائي — أدخل الكود يدوياً');
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
      setError('أدخل رقم الهاتف');
      return;
    }
    setError(null);
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
      setTimeout(() => {
        startOtpStream();
      }, 0);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingSend(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || code.length < 5) {
      setError('أدخل رمز التحقق كاملاً');
      return;
    }
    eventSourceRef.current?.close();
    setError(null);
    setLoadingVerify(true);
    try {
      const res = await fetch(`${API_BASE}/auth/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code, phoneCodeHash }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'رمز التحقق غير صحيح');
      setTimeout(() => {
        toast({ title: '🎉 تم تسجيل الدخول', description: 'مرحباً بك في برنامج أنور' });
      }, 0);
      await goToDashboard();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingVerify(false);
    }
  };

  const handleBack = () => {
    setStep(1);
    setAutoDetecting(false);
    setAutoDetected(false);
    setAutoVerifying(false);
    setCode('');
    setError(null);
    eventSourceRef.current?.close();
  };

  const loading = loadingSend || loadingVerify || autoVerifying;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md space-y-6 animate-slide-up">
        {/* Title above card */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-foreground">برنامج أنور</h1>
          <p className="text-muted-foreground mt-1 text-sm">نظام مراقبة وبث تيليجرام</p>
        </div>

        <Card className="w-full shadow-lg">
          <CardHeader className="text-center pb-4">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full gradient-telegram flex items-center justify-center">
              <MessageCircle className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-xl">الاتصال بتيليجرام</CardTitle>
            <CardDescription>
              {step === 1
                ? 'أدخل رقم هاتفك للمتابعة'
                : `تم إرسال الكود إلى ${phone}`}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            {/* Error alert */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Step 1: Phone Number */}
            {step === 1 && (
              <form onSubmit={handleRequestCode} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="phone" className="flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    رقم الهاتف
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    dir="ltr"
                    placeholder="+966xxxxxxxxx"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); setError(null); }}
                    disabled={loadingSend}
                    autoFocus
                    className="text-left font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    سيُرسَل رمز التحقق إلى تطبيق تيليغرام الخاص بك
                  </p>
                </div>

                <Button type="submit" className="w-full" disabled={loadingSend}>
                  {loadingSend ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin ml-2" />
                      جاري الإرسال...
                    </>
                  ) : (
                    'إرسال الكود'
                  )}
                </Button>
              </form>
            )}

            {/* Step 2: OTP Code */}
            {step === 2 && (
              <form onSubmit={handleVerifyCode} className="space-y-5">
                {/* Auto-detection status */}
                {autoVerifying ? (
                  <Alert className="border-green-500/30 bg-green-500/10">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <AlertDescription className="text-green-600 dark:text-green-400 font-semibold flex items-center gap-2">
                      تم اكتشاف الكود — جاري التحقق تلقائياً
                      <Loader2 className="w-4 h-4 animate-spin" />
                    </AlertDescription>
                  </Alert>
                ) : autoDetecting ? (
                  <Alert className="border-primary/30 bg-primary/10">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <AlertDescription className="text-primary font-semibold">
                      جاري البحث عن الكود تلقائياً{dots}
                    </AlertDescription>
                  </Alert>
                ) : autoDetected ? (
                  <Alert className="border-green-500/30 bg-green-500/10">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <AlertDescription className="text-green-600 dark:text-green-400 font-semibold">
                      تم اكتشاف الكود: {code}
                    </AlertDescription>
                  </Alert>
                ) : null}

                {/* OTP Input */}
                <div className="space-y-3">
                  <Label className="block text-center">أدخل رمز التحقق</Label>
                  <div className="flex justify-center" dir="ltr">
                    <InputOTP
                      maxLength={6}
                      value={code}
                      onChange={(val) => { setCode(val); setError(null); setAutoDetected(false); }}
                      disabled={autoVerifying || loadingVerify}
                    >
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleBack}
                    disabled={loading}
                    className="px-5"
                  >
                    رجوع
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={loading || code.length < 5}
                  >
                    {loadingVerify ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin ml-2" />
                        جاري التحقق...
                      </>
                    ) : (
                      'تحقق'
                    )}
                  </Button>
                </div>
              </form>
            )}

            {/* Progress dots */}
            <div className="flex items-center justify-center gap-2 pt-2">
              <div className={`w-3 h-3 rounded-full transition-colors duration-300 ${
                step >= 1 ? 'bg-primary' : 'bg-muted'
              }`} />
              <div className={`w-8 h-0.5 transition-colors duration-300 ${
                step === 2 ? 'bg-primary' : 'bg-muted'
              }`} />
              <div className={`w-3 h-3 rounded-full transition-colors duration-300 ${
                step === 2 ? 'bg-primary' : 'bg-muted'
              }`} />
              <div className="w-8 h-0.5 bg-muted" />
              <div className="w-3 h-3 rounded-full bg-muted" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
