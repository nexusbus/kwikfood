
import React, { useState } from 'react';
import Logo from './Logo';

interface LegalTermsViewProps {
    onBack: () => void;
}

const LegalTermsView: React.FC<LegalTermsViewProps> = ({ onBack }) => {
    const [activeTab, setActiveTab] = useState<'TERMS' | 'PRIVACY'>('TERMS');

    return (
        <div className="min-h-screen bg-[#FDFCFD] flex flex-col font-sans selection:bg-primary/20 overflow-x-hidden">
            <header className="w-full max-w-5xl mx-auto px-6 py-6 flex justify-between items-center bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-border/10">
                <div className="flex items-center gap-3">
                    <Logo variant="icon" size={32} />
                    <span className="text-xl font-black tracking-tight text-[#111111]">Kwikfood Jurídico</span>
                </div>
                <button
                    onClick={onBack}
                    className="px-6 py-2 bg-primary text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-secondary transition-all shadow-premium active:scale-95"
                >
                    VOLTAR
                </button>
            </header>

            <main className="flex-1 w-full max-w-[800px] mx-auto px-6 py-12">
                <div className="flex gap-4 mb-12 bg-white p-2 rounded-[2rem] shadow-sm border border-border/20">
                    <button
                        onClick={() => setActiveTab('TERMS')}
                        className={`flex-1 py-4 rounded-[1.5rem] font-black text-[11px] uppercase tracking-widest transition-all ${activeTab === 'TERMS' ? 'bg-secondary text-white shadow-premium' : 'text-text-muted hover:bg-primary/5'}`}
                    >
                        Termos de Uso
                    </button>
                    <button
                        onClick={() => setActiveTab('PRIVACY')}
                        className={`flex-1 py-4 rounded-[1.5rem] font-black text-[11px] uppercase tracking-widest transition-all ${activeTab === 'PRIVACY' ? 'bg-secondary text-white shadow-premium' : 'text-text-muted hover:bg-primary/5'}`}
                    >
                        Privacidade
                    </button>
                </div>

                <div className="bg-white rounded-[3rem] p-10 sm:p-16 shadow-premium border border-border/10 animate-fade-in">
                    {activeTab === 'TERMS' ? (
                        <div className="prose prose-slate max-w-none space-y-8">
                            <section>
                                <h3 className="text-2xl font-black text-secondary uppercase tracking-tight mb-4">1. Aceitação dos Termos</h3>
                                <p className="text-slate-600 leading-bold">Ao aceder e utilizar a plataforma KwikFood, o utilizador concorda expressamente em cumprir e vincular-se aos presentes Termos e Condições de Utilização. Se não concordar com qualquer parte destes termos, não deverá utilizar os nossos serviços.</p>
                            </section>

                            <section>
                                <h3 className="text-2xl font-black text-secondary uppercase tracking-tight mb-4">2. Natureza do Serviço</h3>
                                <p className="text-slate-600 leading-bold">A KwikFood é uma plataforma tecnológica que facilita a gestão de filas e encomendas entre Clientes e Estabelecimentos Parceiros (Restaurantes, Cafés, etc.) em Angola. A KwikFood atua apenas como intermediária técnica.</p>
                            </section>

                            <section>
                                <h3 className="text-2xl font-black text-secondary uppercase tracking-tight mb-4">3. Responsabilidades do Utilizador</h3>
                                <ul className="list-disc pl-5 space-y-2 text-slate-600">
                                    <li>Fornecer informações verdadeiras e exatas (nome e telefone).</li>
                                    <li>Estar fisicamente presente (ou dentro do raio permitido) para entrar em filas presenciais.</li>
                                    <li>Assumir o compromisso de levantamento ou receção dos pedidos efetuados.</li>
                                </ul>
                            </section>

                            <section>
                                <h3 className="text-2xl font-black text-secondary uppercase tracking-tight mb-4">4. Pagamentos e Cancelamentos</h3>
                                <p className="text-slate-600 leading-bold">Os pagamentos são realizados diretamente ao Estabelecimento Parceiro via Numerário ou Transferência Bancária, conforme a disponibilidade do parceiro. A KwikFood não processa pagamentos financeiros diretamente. A política de cancelamento é definida por cada Estabelecimento Individual.</p>
                            </section>

                            <section>
                                <h3 className="text-2xl font-black text-secondary uppercase tracking-tight mb-4">5. Notificações SMS</h3>
                                <p className="text-slate-600 leading-bold">Ao registar o seu telemóvel, autoriza a KwikFood e o Estabelecimento Parceiro a enviar notificações SMS automáticas relativas ao estado do seu pedido (Confirmação, Preparação, Pronto e Entrega).</p>
                            </section>
                        </div>
                    ) : (
                        <div className="prose prose-slate max-w-none space-y-8">
                            <section>
                                <h3 className="text-2xl font-black text-secondary uppercase tracking-tight mb-4">1. Recolha de Dados</h3>
                                <p className="text-slate-600 leading-bold">Recolhemos apenas os dados estritamente necessários para o funcionamento do serviço: Nome, Número de Telefone e, opcionalmente, Dados de Localização para validação de presença ou entrega ao domicílio.</p>
                            </section>

                            <section>
                                <h3 className="text-2xl font-black text-secondary uppercase tracking-tight mb-4">2. Uso de Geolocalização</h3>
                                <p className="text-slate-600 leading-bold">Solicitamos acesso à sua localização GPS para garantir que está próximo do estabelecimento ao entrar num "Pedido no Local" e para fornecer coordenadas exatas ao estafeta em caso de "Pedidos de Entrega". Estes dados não são armazenados permanentemente após a conclusão do pedido.</p>
                            </section>

                            <section>
                                <h3 className="text-2xl font-black text-secondary uppercase tracking-tight mb-4">3. Proteção de Dados (APD Angola)</h3>
                                <p className="text-slate-600 leading-bold">Em conformidade com as boas práticas de proteção de dados e a legislação angolana, implementamos medidas de segurança para proteger as suas informações contra acessos não autorizados. Os seus dados são armazenados de forma segura em infraestrutura cloud certificada (Supabase).</p>
                            </section>

                            <section>
                                <h3 className="text-2xl font-black text-secondary uppercase tracking-tight mb-4">4. Partilha com Terceiros</h3>
                                <p className="text-slate-600 leading-bold">Os seus dados (Nome e Telefone) são partilhados apenas com o Estabelecimento onde efetuou o pedido para fins exclusivos de processamento da encomenda. Não vendemos nem cedemos os seus dados a empresas de marketing externas.</p>
                            </section>

                            <section>
                                <h3 className="text-2xl font-black text-secondary uppercase tracking-tight mb-4">5. Os Seus Direitos</h3>
                                <p className="text-slate-600 leading-bold">Poderá, a qualquer momento, solicitar a eliminação dos seus dados do nosso sistema de clientes contactando o suporte ou o próprio estabelecimento.</p>
                            </section>
                        </div>
                    )}
                </div>
            </main>

            <footer className="w-full py-12 text-center text-text-muted">
                <p className="text-[10px] font-black uppercase tracking-[0.4em] mb-2">Segurança • Transparência • KwikFood</p>
                <p className="text-[9px] font-medium">Última atualização: {new Date().toLocaleDateString('pt-AO')}</p>
            </footer>
        </div>
    );
};

export default LegalTermsView;
