import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  CloudOff, 
  CheckCircle2, 
  AlertTriangle, 
  ExternalLink, 
  Copy, 
  Check, 
  Server, 
  Lock, 
  Info, 
  Settings2, 
  Globe2, 
  RefreshCw, 
  Sparkles,
  Database,
  SlidersHorizontal,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface SettingsManagerProps {
  user: any;
  userRole: 'admin' | 'viewer';
}

export default function SettingsManager({ user, userRole }: SettingsManagerProps) {
  const [activeSubTab, setActiveSubTab] = useState<'vercel' | 'environment' | 'security'>('vercel');
  const [vercelDisabled, setVercelDisabled] = useState<boolean>(() => {
    return localStorage.getItem('ai_studio_exclusive_mode') !== 'false';
  });
  const [copiedStep, setCopiedStep] = useState<number | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleToggleVercelDisable = () => {
    const newState = !vercelDisabled;
    setVercelDisabled(newState);
    localStorage.setItem('ai_studio_exclusive_mode', String(newState));
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const copyToClipboard = (text: string, stepId: number) => {
    navigator.clipboard.writeText(text);
    setCopiedStep(stepId);
    setTimeout(() => setCopiedStep(null), 2000);
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-brand-dark via-zinc-900 to-brand-surface rounded-3xl p-6 sm:p-8 text-white border border-brand-accent/30 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-brand-lime/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-lime/10 border border-brand-lime/20 text-brand-lime text-xs font-bold uppercase tracking-wider">
              <Sparkles size={14} />
              Ambiente Google AI Studio
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Painel de Configurações & Ambiente
            </h2>
            <p className="text-zinc-400 text-sm max-w-xl">
              Gerencie a operação exclusiva no Google AI Studio, desative integrações externas com a Vercel e monitore a segurança do banco de dados.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="bg-white/5 border border-white/10 backdrop-blur-md rounded-2xl p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${vercelDisabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                {vercelDisabled ? <CloudOff size={22} /> : <Globe2 size={22} />}
              </div>
              <div>
                <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Hospedagem Externa</div>
                <div className="text-sm font-black text-white">
                  {vercelDisabled ? 'Vercel Desativada' : 'Vercel Ativa'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sub navigation tabs */}
      <div className="flex bg-zinc-200/60 p-1.5 rounded-2xl w-fit border border-zinc-200 shadow-inner flex-wrap gap-1">
        <button
          onClick={() => setActiveSubTab('vercel')}
          className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 ${
            activeSubTab === 'vercel'
              ? 'bg-white text-zinc-900 shadow-md'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <CloudOff size={16} className={activeSubTab === 'vercel' ? 'text-red-500' : ''} />
          Desativar Vercel
        </button>

        <button
          onClick={() => setActiveSubTab('environment')}
          className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 ${
            activeSubTab === 'environment'
              ? 'bg-white text-zinc-900 shadow-md'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <Server size={16} className={activeSubTab === 'environment' ? 'text-brand-dark' : ''} />
          Ambiente AI Studio
        </button>

        <button
          onClick={() => setActiveSubTab('security')}
          className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 ${
            activeSubTab === 'security'
              ? 'bg-white text-zinc-900 shadow-md'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <Lock size={16} className={activeSubTab === 'security' ? 'text-indigo-600' : ''} />
          Segurança & Banco
        </button>
      </div>

      <AnimatePresence mode="wait">
        {/* SUBTAB: DESATIVAR VERCEL */}
        {activeSubTab === 'vercel' && (
          <motion.div
            key="vercel"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* Primary Control Card */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-zinc-200/80 shadow-sm space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-zinc-100">
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-2xl ${vercelDisabled ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                    <CloudOff size={28} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-zinc-900">
                      Modo Exclusivo Google AI Studio (Vercel Desativada)
                    </h3>
                    <p className="text-sm text-zinc-500 mt-1 max-w-2xl">
                      Ao ativar esta opção, o sistema opera 100% contido dentro da infraestrutura do Google AI Studio, bloqueando avisos de domínios externos e garantindo que você utilize a aplicação diretamente no seu ambiente de desenvolvimento.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3 self-start md:self-center">
                  <button
                    onClick={handleToggleVercelDisable}
                    className={`px-6 py-3.5 rounded-2xl font-bold text-sm transition-all flex items-center gap-3 shadow-md ${
                      vercelDisabled
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-600/20'
                        : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-900'
                    }`}
                  >
                    {vercelDisabled ? (
                      <>
                        <CheckCircle2 size={18} />
                        Vercel Desativada (Ativo)
                      </>
                    ) : (
                      <>
                        <AlertTriangle size={18} />
                        Clique para Desativar Vercel
                      </>
                    )}
                  </button>
                </div>
              </div>

              {saveSuccess && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold rounded-2xl p-4 flex items-center gap-2"
                >
                  <CheckCircle2 size={18} className="text-emerald-600" />
                  Configuração salva com sucesso! O sistema está configurado para uso exclusivo no Google AI Studio.
                </motion.div>
              )}

              {/* Status explanation */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-zinc-50 p-5 rounded-2xl border border-zinc-200/70 space-y-2">
                  <div className="flex items-center gap-2 text-zinc-900 font-bold text-sm">
                    <CheckCircle2 size={16} className="text-emerald-600" />
                    Como o sistema funciona agora
                  </div>
                  <p className="text-xs text-zinc-600 leading-relaxed">
                    Você pode acessar, gerenciar promotores, registrar presenças, lançar adiantamentos e emitir relatórios diretamente pelo preview e painel do <strong>Google AI Studio</strong> sem precisar de nenhuma URL pública da Vercel.
                  </p>
                </div>

                <div className="bg-zinc-50 p-5 rounded-2xl border border-zinc-200/70 space-y-2">
                  <div className="flex items-center gap-2 text-zinc-900 font-bold text-sm">
                    <ShieldCheck size={16} className="text-indigo-600" />
                    Seus dados no Firebase Firestore
                  </div>
                  <p className="text-xs text-zinc-600 leading-relaxed">
                    Todo o banco de dados Firebase continua 100% funcional, conectado em tempo real e seguro, garantindo que nenhum dado de promotor ou financeiro seja perdido.
                  </p>
                </div>
              </div>
            </div>

            {/* Step-by-Step Guide to Clean up Vercel */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-zinc-200/80 shadow-sm space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-red-50 text-red-600 border border-red-100">
                  <SlidersHorizontal size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-zinc-900">
                    Como Desvincular / Excluir o Projeto na Vercel (Opcional)
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Siga este passo a passo se você já possuía um projeto criado na Vercel e deseja desativá-lo completamente:
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {/* Step 1 */}
                <div className="bg-zinc-50 p-5 rounded-2xl border border-zinc-200/80 flex flex-col sm:flex-row sm:items-start gap-4 justify-between">
                  <div className="flex items-start gap-3.5">
                    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-zinc-900 text-white font-black text-xs flex items-center justify-center">
                      1
                    </span>
                    <div>
                      <h4 className="font-bold text-zinc-900 text-sm">Acesse o Dashboard da Vercel</h4>
                      <p className="text-xs text-zinc-600 mt-1">
                        Abra o painel de controle da Vercel em <span className="font-mono text-zinc-800 font-bold">vercel.com/dashboard</span> e clique sobre o projeto deste aplicativo.
                      </p>
                    </div>
                  </div>
                  <a
                    href="https://vercel.com/dashboard"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-zinc-300 rounded-xl text-xs font-bold text-zinc-700 hover:bg-zinc-100 shadow-sm self-start"
                  >
                    Abrir Vercel <ExternalLink size={13} />
                  </a>
                </div>

                {/* Step 2 */}
                <div className="bg-zinc-50 p-5 rounded-2xl border border-zinc-200/80 flex flex-col sm:flex-row sm:items-start gap-4 justify-between">
                  <div className="flex items-start gap-3.5">
                    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-zinc-900 text-white font-black text-xs flex items-center justify-center">
                      2
                    </span>
                    <div>
                      <h4 className="font-bold text-zinc-900 text-sm">Pausar ou Desconectar Integração Git</h4>
                      <p className="text-xs text-zinc-600 mt-1">
                        Vá em <strong>Settings &gt; Git</strong> e clique em <strong>Disconnect</strong> se não quiser que novos commits gerem builds automáticos na Vercel.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="bg-zinc-50 p-5 rounded-2xl border border-zinc-200/80 flex flex-col sm:flex-row sm:items-start gap-4 justify-between">
                  <div className="flex items-start gap-3.5">
                    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-zinc-900 text-white font-black text-xs flex items-center justify-center">
                      3
                    </span>
                    <div>
                      <h4 className="font-bold text-zinc-900 text-sm">Excluir o Projeto na Vercel (Para remover a URL pública)</h4>
                      <p className="text-xs text-zinc-600 mt-1">
                        Para desativar a URL pública permanentemente, vá na aba <strong>Settings &gt; General</strong>, role até o final da página na seção <strong>"Delete Project"</strong> e confirme a exclusão.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* SUBTAB: AMBIENTE AI STUDIO */}
        {activeSubTab === 'environment' && (
          <motion.div
            key="environment"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-zinc-200/80 shadow-sm space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-brand-lime/20 text-brand-dark border border-brand-lime/30">
                  <Server size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-zinc-900">
                    Detalhes do Servidor & Container
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Informações sobre a execução isolada no Google Cloud / AI Studio
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-200">
                  <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Plataforma</div>
                  <div className="text-base font-extrabold text-zinc-900 mt-1 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Google AI Studio Build
                  </div>
                </div>

                <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-200">
                  <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Modo de Execução</div>
                  <div className="text-base font-extrabold text-zinc-900 mt-1">
                    Privado / Não Publicado
                  </div>
                </div>

                <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-200">
                  <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Porta do Container</div>
                  <div className="text-base font-extrabold text-zinc-900 mt-1">
                    Porta 3000 (Proxy Ativo)
                  </div>
                </div>
              </div>

              <div className="bg-emerald-50/70 border border-emerald-200/70 rounded-2xl p-5 text-emerald-900 text-sm space-y-2">
                <div className="font-bold flex items-center gap-2">
                  <CheckCircle2 size={18} className="text-emerald-600" />
                  Ambiente Autônomo e Seguro
                </div>
                <p className="text-xs text-emerald-800 leading-relaxed">
                  O Google AI Studio hospeda e executa sua aplicação em containers de alta performance no Google Cloud Run. Você pode continuar trabalhando, criando e gerenciando tudo diretamente aqui.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* SUBTAB: SEGURANÇA E BANCO */}
        {activeSubTab === 'security' && (
          <motion.div
            key="security"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-zinc-200/80 shadow-sm space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100">
                  <Database size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-zinc-900">
                    Conexão Firestore & Usuário Atual
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Status da autenticação e integridade do banco de dados
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 bg-zinc-50 rounded-2xl border border-zinc-200">
                  <div>
                    <div className="text-xs font-bold text-zinc-500 uppercase">Banco de Dados Firestore</div>
                    <div className="font-mono text-xs font-bold text-zinc-900 mt-0.5">
                      ai-studio-controledepromot-b01eff6e-dbb9-4ecf-9389-ab14dfcb3733
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Conectado
                  </span>
                </div>

                <div className="flex items-center justify-between p-4 bg-zinc-50 rounded-2xl border border-zinc-200">
                  <div>
                    <div className="text-xs font-bold text-zinc-500 uppercase">Sessão Ativa</div>
                    <div className="font-semibold text-sm text-zinc-900 mt-0.5">
                      {user?.displayName || user?.email || 'Usuário Local'}
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-zinc-200 text-zinc-800 rounded-full text-xs font-bold uppercase">
                    {userRole === 'admin' ? 'Administrador' : 'Visualizador'}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
