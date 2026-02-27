
import React, { useState, useEffect } from 'react';
import { supabase } from '../src/lib/supabase';
import Logo from './Logo';

interface AdminAuthViewProps {
    onSuccess: (type: 'SUPER' | 'COMPANY', id?: number) => void;
    onBack: () => void;
    onShowTerms: () => void;
}

const AdminAuthView: React.FC<AdminAuthViewProps> = ({ onSuccess, onBack, onShowTerms }) => {
    const [isRegistering, setIsRegistering] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        checkSuperAdmin();
    }, []);

    const checkSuperAdmin = async () => {
        try {
            const { count, error } = await supabase
                .from('super_admins')
                .select('*', { count: 'exact', head: true });

            if (error && error.code !== 'PGRST116') {
                setIsRegistering(true);
            } else {
                setIsRegistering(count === 0);
            }
        } catch (err) {
            setIsRegistering(true);
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setActionLoading(true);

        try {
            if (isRegistering) {
                const { error: registerError } = await supabase
                    .from('super_admins')
                    .insert([{ email, password }]);

                if (registerError) throw registerError;
                onSuccess('SUPER');
            } else {
                const { data: superAdmin } = await supabase
                    .from('super_admins')
                    .select('*')
                    .eq('email', email)
                    .eq('password', password)
                    .single();

                if (superAdmin) {
                    onSuccess('SUPER');
                    return;
                }

                const { data: company } = await supabase
                    .from('companies')
                    .select('*')
                    .eq('email', email)
                    .eq('password', password)
                    .single();

                if (company) {
                    onSuccess('COMPANY', company.id);
                } else {
                    setError('ACESSO NEGADO: Credenciais incorretas.');
                }
            }
        } catch (err: any) {
            setError(err.message || 'Falha crítica na autenticação.');
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="size-20 border-[6px] border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#f8f6f6] selection:bg-primary selection:text-white relative overflow-hidden p-4 sm:p-6 font-sans">
            {/* Immersive Background Nodes */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-[-10%] right-[-5%] w-[70%] h-[70%] bg-primary/5 rounded-full blur-[120px] animate-pulse-slow"></div>
                <div className="absolute bottom-[-15%] left-[-10%] w-[60%] h-[60%] bg-secondary/5 rounded-full blur-[150px] animate-pulse-slow" style={{ animationDelay: '2s' }}></div>
                <div className="absolute top-[20%] left-[10%] w-32 h-32 bg-primary/10 rounded-full blur-3xl"></div>
            </div>

            <div className="w-full max-w-[540px] relative z-10 animate-fade-in px-2">
                <div className="bg-white/80 backdrop-blur-3xl rounded-[3.5rem] sm:rounded-[4.5rem] p-8 sm:p-16 shadow-premium border border-white/60 relative overflow-hidden">
                    {/* Top Accent Bar */}
                    <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary via-secondary to-primary bg-[length:200%_auto] animate-gradient-x"></div>

                    <header className="text-center mb-10 sm:mb-14">
                        <div className="size-20 sm:size-24 bg-white rounded-[2rem] shadow-premium flex items-center justify-center mx-auto mb-8 border border-border/20 group hover:scale-110 transition-transform duration-500">
                            <Logo variant="icon" size={48} className="transform group-hover:rotate-12 transition-transform duration-500" />
                        </div>

                        <h2 className="text-3xl sm:text-5xl font-black text-secondary tracking-tighter mb-4 leading-none">
                            {isRegistering ? 'Configuração Inicial' : 'Acesso Restrito'}
                        </h2>

                        <div className="flex items-center justify-center gap-3">
                            <span className={`size-2 rounded-full animate-pulse-soft ${isRegistering ? 'bg-amber-500' : 'bg-primary'}`}></span>
                            <p className="text-text-muted font-bold uppercase text-[9px] sm:text-[11px] tracking-[0.4em]">
                                {isRegistering ? 'INFRAESTRUTURA DE DADOS' : 'PORTAL ADMINISTRATIVO'}
                            </p>
                        </div>
                    </header>

                    <form onSubmit={handleAction} className="space-y-6 sm:space-y-8">
                        <div className="space-y-3">
                            <label className="text-[9px] sm:text-[11px] font-black text-secondary uppercase tracking-[0.4em] ml-4 opacity-50">Identificação</label>
                            <div className="relative group">
                                <span className="material-symbols-outlined absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-primary transition-all duration-300">alternate_email</span>
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full h-16 sm:h-20 bg-background/50 border-2 border-border/40 rounded-[1.5rem] sm:rounded-[1.8rem] pl-16 pr-8 font-bold text-base sm:text-lg text-secondary focus:border-primary focus:bg-white transition-all outline-none shadow-sm"
                                    placeholder="email@exemplo.com"
                                />
                            </div>
                        </div>

                        <div className="space-y-3">
                            <label className="text-[9px] sm:text-[11px] font-black text-secondary uppercase tracking-[0.4em] ml-4 opacity-50">Chave de Segurança</label>
                            <div className="relative group">
                                <span className="material-symbols-outlined absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-primary transition-all duration-300">lock</span>
                                <input
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full h-16 sm:h-20 bg-background/50 border-2 border-border/40 rounded-[1.5rem] sm:rounded-[1.8rem] pl-16 pr-8 font-bold text-base sm:text-lg text-secondary focus:border-primary focus:bg-white transition-all outline-none shadow-sm"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="p-5 sm:p-6 bg-red-50 text-red-600 text-[10px] sm:text-[12px] font-black rounded-2xl flex items-center gap-4 animate-shake border border-red-100">
                                <span className="material-symbols-outlined">gpp_maybe</span>
                                <span className="uppercase tracking-widest">{error}</span>
                            </div>
                        )}

                        <div className="pt-4">
                            <button
                                type="submit"
                                disabled={actionLoading}
                                className="w-full h-20 sm:h-24 bg-primary hover:bg-secondary text-white rounded-[1.5rem] sm:rounded-[2rem] font-black text-[12px] sm:text-[14px] uppercase tracking-[0.4em] shadow-premium flex items-center justify-center gap-4 transition-all active:scale-[0.96] disabled:opacity-50 relative overflow-hidden group"
                            >
                                <div className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 skew-x-12"></div>
                                {actionLoading ? (
                                    <div className="size-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                    <>
                                        <span>{isRegistering ? 'ATIVAR SISTEMA' : 'DESBLOQUEAR'}</span>
                                        <span className="material-symbols-outlined text-2xl group-hover:translate-x-2 transition-transform">login</span>
                                    </>
                                )}
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={onBack}
                            className="w-full py-4 sm:py-6 text-text-muted hover:text-secondary font-black text-[9px] sm:text-[11px] uppercase tracking-[0.4em] transition-all flex items-center justify-center gap-3 group"
                        >
                            <span className="material-symbols-outlined text-xl group-hover:-translate-x-2 transition-transform">arrow_back</span>
                            Voltar ao Dashboard Público
                        </button>

                        <div className="pt-4 border-t border-border/10">
                            <button
                                type="button"
                                onClick={onShowTerms}
                                className="w-full text-[9px] font-black text-text-muted/60 hover:text-primary uppercase tracking-[0.2em] transition-colors"
                            >
                                Termos & Privacidade
                            </button>
                        </div>
                    </form>
                </div>

                <div className="mt-8 sm:mt-12 text-center px-6">
                    <p className="text-[8px] sm:text-[10px] font-black text-text-muted/40 uppercase tracking-[0.5em] leading-relaxed">
                        &copy; {new Date().getFullYear()} KwikFood Angola &bull; Infraestrutura Premium &bull; Todos os direitos reservados
                    </p>
                </div>
            </div>
        </div>
    );
};

export default AdminAuthView;
