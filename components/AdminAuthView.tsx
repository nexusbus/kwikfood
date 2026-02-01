
import React, { useState, useEffect } from 'react';
import { supabase } from '../src/lib/supabase';

interface AdminAuthViewProps {
    onSuccess: (type: 'SUPER' | 'COMPANY', id?: string) => void;
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
                // Table might not exist yet, we'll assume we need to register if it fails
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
                // Register Super Admin
                const { data, error: registerError } = await supabase
                    .from('super_admins')
                    .insert([{ email, password }])
                    .select()
                    .single();

                if (registerError) throw registerError;
                onSuccess('SUPER');
            } else {
                // Login Logic
                // 1. Check Super Admin
                const { data: superAdmin, error: superError } = await supabase
                    .from('super_admins')
                    .select('*')
                    .eq('email', email)
                    .eq('password', password)
                    .single();

                if (superAdmin) {
                    onSuccess('SUPER');
                    return;
                }

                // 2. Check Company Admin if not Super
                const { data: company, error: companyError } = await supabase
                    .from('companies')
                    .select('*')
                    .eq('email', email)
                    .eq('password', password)
                    .single();

                if (company) {
                    onSuccess('COMPANY', company.id);
                } else {
                    setError('Email ou senha inválidos.');
                }
            }
        } catch (err: any) {
            setError(err.message || 'Ocorreu um erro. Tente novamente.');
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="size-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-[#F4F4F5] font-inter">
            <div className="w-full max-w-[440px] bg-white rounded-[3rem] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.1)] p-12 border border-white">
                <div className="text-center mb-10">
                    <div className="size-20 bg-primary rounded-[2rem] flex items-center justify-center text-white mx-auto mb-6 shadow-2xl shadow-primary/30">
                        <span className="material-symbols-outlined text-4xl">
                            {isRegistering ? 'person_add' : 'security'}
                        </span>
                    </div>
                    <h2 className="text-3xl font-black text-black tracking-tighter">
                        {isRegistering ? 'Setup Master' : 'Acesso Restrito'}
                    </h2>
                    <p className="text-gray-400 text-sm font-medium mt-3 leading-relaxed">
                        {isRegistering
                            ? 'Configure o acesso de administrador mestre para começar.'
                            : 'Insira as suas credenciais de administrador.'}
                    </p>
                </div>

                <form onSubmit={handleAction} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-[11px] font-black text-black uppercase tracking-[0.2em] ml-1 opacity-30">E-mail Corporativo</label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full h-16 bg-gray-50 border-2 border-gray-50 rounded-2xl px-6 focus:ring-primary focus:border-primary focus:bg-white transition-all outline-none font-bold text-black"
                            placeholder="exemplo@kwikfood.com"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[11px] font-black text-black uppercase tracking-[0.2em] ml-1 opacity-30">Palavra-passe</label>
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full h-16 bg-gray-50 border-2 border-gray-50 rounded-2xl px-6 focus:ring-primary focus:border-primary focus:bg-white transition-all outline-none font-bold text-black"
                            placeholder="••••••••"
                        />
                    </div>

                    {error && (
                        <div className="p-5 bg-red-50 border border-red-100 text-primary text-xs font-black rounded-2xl flex items-center gap-3 animate-shake">
                            <span className="material-symbols-outlined text-xl">warning</span>
                            <span className="uppercase tracking-wider leading-tight">{error}</span>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={actionLoading}
                        className="w-full h-18 py-5 bg-black hover:bg-primary text-white rounded-2xl font-black text-sm tracking-[0.2em] transition-all flex items-center justify-center gap-3 active:scale-[0.98] disabled:opacity-50 mt-6 shadow-2xl shadow-black/10 uppercase"
                    >
                        {actionLoading ? (
                            <div className="size-6 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                            <>
                                <span>{isRegistering ? 'Confirmar Registo' : 'Autenticar'}</span>
                                <span className="material-symbols-outlined font-black">login</span>
                            </>
                        )}
                    </button>

                    <button
                        type="button"
                        onClick={onBack}
                        className="w-full text-center text-gray-300 text-[10px] font-black hover:text-black transition-all py-4 uppercase tracking-[0.4em]"
                    >
                        Voltar ao Menu
                    </button>
                </form>
            </div>
        </div>
    );
};

export default AdminAuthView;
