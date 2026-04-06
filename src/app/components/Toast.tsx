import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useEffect } from 'react';

export type ToastType = 'error' | 'success' | 'info';

interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
  duration?: number;
}

export function Toast({ message, type, onClose, duration = 5000 }: ToastProps) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const config = {
    error: {
      icon: AlertCircle,
      bgClass: 'bg-red-500/10 border-red-500/50',
      iconClass: 'text-red-500',
      textClass: 'text-red-700 dark:text-red-300',
    },
    success: {
      icon: CheckCircle2,
      bgClass: 'bg-green-500/10 border-green-500/50',
      iconClass: 'text-green-500',
      textClass: 'text-green-700 dark:text-green-300',
    },
    info: {
      icon: Info,
      bgClass: 'bg-blue-500/10 border-blue-500/50',
      iconClass: 'text-blue-500',
      textClass: 'text-blue-700 dark:text-blue-300',
    },
  }[type];

  const Icon = config.icon;

  return (
    <div
      className={`fixed top-4 right-4 z-50 max-w-md w-full sm:w-auto min-w-[320px] rounded-sm border ${config.bgClass} shadow-lg animate-in slide-in-from-top-5 duration-300`}
    >
      <div className="flex items-start gap-3 p-4">
        <Icon className={`size-5 shrink-0 mt-0.5 ${config.iconClass}`} />
        <div className={`flex-1 text-sm ${config.textClass} break-words`}>
          {message}
        </div>
        <button
          onClick={onClose}
          className={`shrink-0 ${config.iconClass} hover:opacity-70 transition-opacity`}
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
