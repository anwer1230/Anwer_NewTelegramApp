import React from 'react';
import { Download } from 'lucide-react';
import { usePWA } from '@/hooks/use-pwa';

export function InstallPWA() {
  const { isInstallable, isInstalled, promptInstall } = usePWA();

  if (!isInstallable || isInstalled) {
    return null;
  }

  return (
    <button
      onClick={promptInstall}
      className="
        flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold
        bg-gradient-to-r from-primary to-accent text-primary-foreground
        shadow-lg shadow-primary/20 hover:shadow-primary/40
        hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200
      "
    >
      <Download className="w-4 h-4" />
      <span>تثبيت التطبيق (Install App)</span>
    </button>
  );
}
