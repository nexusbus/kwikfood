
import React from 'react';

interface ModernModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  icon?: string;
  footer?: React.ReactNode;
  variant?: 'info' | 'success' | 'warning' | 'error';
}

const ModernModal: React.FC<ModernModalProps> = ({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  icon = 'info', 
  footer,
  variant = 'info'
}) => {
  if (!isOpen) return null;

  const variantColors = {
    info: 'text-secondary bg-slate-50 border-slate-100',
    success: 'text-green-600 bg-green-50 border-green-100',
    warning: 'text-amber-600 bg-amber-50 border-amber-100',
    error: 'text-primary bg-red-50 border-red-100'
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 animate-fade-in group">
      <div 
        className="absolute inset-0 bg-secondary/40 backdrop-blur-md transition-opacity group-hover:opacity-100" 
        onClick={onClose}
      />
      
      <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-premium relative z-10 overflow-hidden animate-scale-in flex flex-col border border-white/20">
        <header className="p-8 pb-4 flex flex-col items-center text-center space-y-4">
          <div className={`size-16 rounded-2xl flex items-center justify-center shadow-lg transition-transform hover:rotate-6 ${variantColors[variant]}`}>
            <span className="material-symbols-outlined text-3xl font-light">{icon}</span>
          </div>
          <div className="space-y-1">
            <h3 className="text-2xl font-black text-secondary tracking-tight">{title}</h3>
            <div className="h-1 w-8 bg-primary/20 mx-auto rounded-full"></div>
          </div>
        </header>

        <div className="px-10 py-6 text-center text-slate-500 font-medium leading-relaxed">
          {children}
        </div>

        {footer ? (
          <footer className="p-8 pt-0 flex flex-col gap-3">
             {footer}
          </footer>
        ) : (
          <footer className="p-8 pt-0">
            <button 
              onClick={onClose}
              className="w-full h-14 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all active:scale-95"
            >
              FECHAR
            </button>
          </footer>
        )}
      </div>
    </div>
  );
};

export default ModernModal;
