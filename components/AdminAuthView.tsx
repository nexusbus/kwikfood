
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
                    if (company.isActive === false) {
                        setError('Acesso negado. Por favor, contacte a empresa NexusBus LDA para reativar a sua conta.');
                    } else {
                        onSuccess('COMPANY', company.id);
                    }
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
        <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB] selection:bg-red-500 selection:text-white relative overflow-hidden p-6 font-sans">
            <div className="w-full max-w-[440px] relative z-10 animate-fade-in flex flex-col gap-8">

                {/* Header with Logo */}
                <div className="text-center">
                    <div className="size-24 bg-white rounded-[2rem] shadow-[0_20px_50px_-15px_rgba(225,29,72,0.15)] flex items-center justify-center mx-auto mb-6 border border-white group hover:scale-105 transition-all duration-500">
                        <Logo variant="icon" size={56} className="transform transition-transform duration-500" />
                    </div>
                    <h1 className="text-xl font-black text-[#111111] uppercase tracking-[0.4em] mb-2 leading-none">KWIKFOOD</h1>
                </div>

                {/* Control Panel Card */}
                <div className="bg-white rounded-[3rem] p-10 sm:p-12 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.05)] border border-white relative overflow-hidden">
                    <div className="text-center mb-10">
                        <h2 className="text-3xl font-black text-[#111111] tracking-tight mb-3">
                            Terminal de Controlo
                        </h2>
                        <div className="flex items-center justify-center gap-2">
                            <span className="size-2.5 rounded-full bg-[#E11D48] animate-pulse"></span>
                            <span className="text-[#E11D48] font-black uppercase text-[11px] tracking-[0.2em]">SISTEMA DE SEGURANÇA</span>
                        </div>
                    </div>

                    <form onSubmit={handleAction} className="space-y-8">
                        <div className="space-y-3">
                            <label className="text-[11px] font-black text-[#666666] uppercase tracking-[0.2em] ml-1">Email Administrativo</label>
                            <div className="relative group">
                                <span className="material-symbols-outlined absolute left-6 top-1/2 -translate-y-1/2 text-[#BBBBBB] group-focus-within:text-[#E11D48] transition-colors">alternate_email</span>
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full h-16 sm:h-20 bg-white border border-[#F3F4F6] rounded-3xl pl-16 pr-8 font-bold text-lg text-secondary focus:border-[#E11D48]/30 focus:shadow-[0_0_20px_rgba(225,29,72,0.05)] transition-all outline-none"
                                    placeholder="exemplo@kwikfood.com"
                                />
                            </div>
                        </div>

                        <div className="space-y-3">
                            <label className="text-[11px] font-black text-[#666666] uppercase tracking-[0.2em] ml-1">Chave de Acesso</label>
                            <div className="relative group">
                                <span className="material-symbols-outlined absolute left-6 top-1/2 -translate-y-1/2 text-[#BBBBBB] group-focus-within:text-[#E11D48] transition-colors">key</span>
                                <input
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full h-16 sm:h-20 bg-white border border-[#F3F4F6] rounded-3xl pl-16 pr-8 font-bold text-lg text-secondary focus:border-[#E11D48]/30 focus:shadow-[0_0_20px_rgba(225,29,72,0.05)] transition-all outline-none"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="p-5 bg-red-50 text-red-600 text-xs font-black rounded-2xl flex items-center gap-3 animate-shake border border-red-100">
                                <span className="material-symbols-outlined text-xl">gpp_maybe</span>
                                <span className="uppercase tracking-widest">{error}</span>
                            </div>
                        )}

                        <div className="pt-2">
                            <button
                                type="submit"
                                disabled={actionLoading}
                                className="w-full h-20 bg-[#E11D48] hover:bg-[#BE123C] text-white rounded-3xl font-black text-sm uppercase tracking-[0.3em] shadow-[0_15px_30px_-5px_rgba(225,29,72,0.3)] flex items-center justify-center gap-4 transition-all active:scale-[0.97] disabled:opacity-50 group"
                            >
                                {actionLoading ? (
                                    <div className="size-7 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                    <>
                                        <span>{isRegistering ? 'ATIVAR SISTEMA' : 'DESBLOQUEAR'}</span>
                                        <span className="material-symbols-outlined text-2xl group-hover:translate-x-1.5 transition-transform">login</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>

                {/* Back Link */}
                <button
                    type="button"
                    onClick={onBack}
                    className="w-full py-2 text-[#64748B] hover:text-[#111111] font-black text-[11px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 group"
                >
                    <span className="material-symbols-outlined text-xl group-hover:-translate-x-1.5 transition-transform">arrow_back</span>
                    RETORNAR AO TERMINAL
                </button>

                {/* Terms Footer */}
                <div className="text-center">
                    <button
                        type="button"
                        onClick={onShowTerms}
                        className="text-[10px] font-black text-[#BBBBBB] hover:text-[#E11D48] uppercase tracking-[0.1em] transition-colors"
                    >
                        Termos de Utilização & Privacidade
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AdminAuthView;
