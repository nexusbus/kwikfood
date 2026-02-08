
import React, { useState, useEffect } from 'react';
import { supabase } from '../src/lib/supabase';

interface AdminAuthViewProps {
    onSuccess: (type: 'SUPER' | 'COMPANY', id?: number) => void;
    onBack: () => void;
}

const AdminAuthView: React.FC<AdminAuthViewProps> = ({ onSuccess, onBack }) => {
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
        <div className="min-h-screen flex items-center justify-center bg-background selection:bg-primary selection:text-white relative overflow-hidden p-6">
            {/* Decorative Background */}
            <div className="fixed top-0 left-0 w-full h-full pointer-events-none opacity-40">
                <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[60%] bg-primary/5 rounded-full blur-[150px]"></div>
                <div className="absolute bottom-[-10%] left-[-20%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[150px]"></div>
            </div>

            <div className="w-full max-w-[500px] relative z-10 animate-scale-in">
                <div className="bg-surface rounded-[4.5rem] p-16 shadow-premium border border-white/60 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-16 -mt-16"></div>

                    <header className="text-center mb-12">
                        <div className="size-24 bg-primary text-white rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 shadow-premium transform hover:rotate-12 transition-transform duration-500">
                            <span className="material-symbols-outlined text-5xl">
                                {isRegistering ? 'admin_panel_settings' : 'lock_open'}
                            </span>
                        </div>
                        <h2 className="text-4xl font-black text-secondary tracking-tighter leading-none mb-4">
                            {isRegistering ? 'Setup Master' : 'Portal de Acesso'}
                        </h2>
                        <div className="flex items-center justify-center gap-3">
                            <span className="size-2 bg-primary rounded-full animate-pulse-soft"></span>
                            <p className="text-text-muted font-black uppercase text-[11px] tracking-[0.4em]">
                                {isRegistering ? 'CONSOLA DE INFRAESTRUTURA' : 'SISTEMA DE SEGURANÇA'}
                            </p>
                        </div>
                    </header>

                    <form onSubmit={handleAction} className="space-y-8">
                        <div className="space-y-3">
                            <label className="text-[11px] font-black text-secondary uppercase tracking-[0.4em] ml-2 opacity-50">Email Administrativo</label>
                            <div className="relative group">
                                <span className="material-symbols-outlined absolute left-6 top-1/2 -translate-y-1/2 text-text-muted/40 group-focus-within:text-primary transition-colors">alternate_email</span>
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full h-20 bg-background border-2 border-border/40 rounded-[1.8rem] pl-16 pr-8 font-black text-lg text-secondary focus:border-primary transition-all outline-none"
                                    placeholder="admin@kwikfood.com"
                                />
                            </div>
                        </div>

                        <div className="space-y-3">
                            <label className="text-[11px] font-black text-secondary uppercase tracking-[0.4em] ml-2 opacity-50">Chave de Acesso</label>
                            <div className="relative group">
                                <span className="material-symbols-outlined absolute left-6 top-1/2 -translate-y-1/2 text-text-muted/40 group-focus-within:text-primary transition-colors">key</span>
                                <input
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full h-20 bg-background border-2 border-border/40 rounded-[1.8rem] pl-16 pr-8 font-black text-lg text-secondary focus:border-primary transition-all outline-none"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="p-6 bg-primary-soft text-primary text-[12px] font-black rounded-2xl flex items-center gap-4 animate-shake border border-primary/10">
                                <span className="material-symbols-outlined">warning</span>
                                <span className="uppercase tracking-widest">{error}</span>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={actionLoading}
                            className="w-full h-24 bg-primary hover:bg-secondary text-white rounded-[2rem] font-black text-[14px] uppercase tracking-[0.4em] shadow-premium flex items-center justify-center gap-4 transition-all active:scale-[0.96] disabled:opacity-50 mt-10 relative overflow-hidden group"
                        >
                            <div className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 skew-x-12"></div>
                            {actionLoading ? (
                                <div className="size-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                <>
                                    <span>{isRegistering ? 'Confirmar Setup' : 'Desbloquear'}</span>
                                    <span className="material-symbols-outlined text-2xl group-hover:translate-x-2 transition-transform">login</span>
                                </>
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={onBack}
                            className="w-full py-6 text-text-muted hover:text-secondary font-black text-[11px] uppercase tracking-[0.4em] transition-all flex items-center justify-center gap-3 group"
                        >
                            <span className="material-symbols-outlined text-xl group-hover:-translate-x-2 transition-transform">arrow_back</span>
                            Retornar ao Terminal
                        </button>
                    </form>
                </div>

                <div className="mt-12 text-center">
                    <p className="text-[10px] font-black text-text-muted/40 uppercase tracking-[0.5em]">
                        &copy; 2024 KwikFood Angola &bull; Secure Infrastructure
                    </p>
                </div>
            </div>
        </div>
    );
};

export default AdminAuthView;
