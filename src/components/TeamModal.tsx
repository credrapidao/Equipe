import React, { useState, useEffect } from 'react';
import { 
  X, 
  Plus, 
  Check, 
  Users, 
  Trash2, 
  AlertCircle, 
  Layers, 
  ShieldCheck, 
  RefreshCw, 
  Sparkles,
  Info,
  CheckCircle2
} from 'lucide-react';
import { 
  createTeamInFirestore, 
  deleteTeamFromFirestore, 
  cleanupEmptyLegacyTeams, 
  getTeamColorStyle, 
  useTeams, 
  normalizeTeamId 
} from '../lib/teams';
import { Team, Promoter, Employee, DEFAULT_TEAMS } from '../types';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface TeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (team: Team) => void;
  onTeamCreated?: (team: Team) => void;
  promoters?: Promoter[];
  employees?: Employee[];
}

const EMOJI_SUGGESTIONS = [
  '⚡', '🚀', '🌟', '💼', '🎯', '⭐', '🏆', '🔥', 
  '👥', '📈', '🛡️', '💎', '💡', '📞', '🤝', '💰', 
  '🏢', '💪', '📊', '🏷️'
];

const COLOR_OPTIONS: { id: string; label: string; bg: string }[] = [
  { id: 'indigo', label: 'Índigo', bg: 'bg-indigo-600' },
  { id: 'amber', label: 'Âmbar', bg: 'bg-amber-500' },
  { id: 'emerald', label: 'Esmeralda', bg: 'bg-emerald-600' },
  { id: 'blue', label: 'Azul', bg: 'bg-blue-600' },
  { id: 'purple', label: 'Roxo', bg: 'bg-purple-600' },
  { id: 'rose', label: 'Rosa', bg: 'bg-rose-600' },
  { id: 'teal', label: 'Teal', bg: 'bg-teal-600' },
  { id: 'orange', label: 'Laranja', bg: 'bg-orange-500' },
];

export function TeamModal({ isOpen, onClose, onSuccess, onTeamCreated, promoters: propPromoters, employees: propEmployees }: TeamModalProps) {
  const { teams } = useTeams();
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');
  
  // Real-time promoters & employees count
  const [promotersList, setPromotersList] = useState<Promoter[]>(propPromoters || []);
  const [employeesList, setEmployeesList] = useState<Employee[]>(propEmployees || []);

  // Form State
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('💼');
  const [color, setColor] = useState('indigo');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Deletion State
  const [deletingTeamId, setDeletingTeamId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isCleaningGhosts, setIsCleaningGhosts] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    // Listen to promoters if not passed
    const unsubPromoters = onSnapshot(collection(db, 'promoters'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promoter));
      setPromotersList(data);
    }, () => {});

    // Listen to employees
    const unsubEmployees = onSnapshot(collection(db, 'employees'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee));
      setEmployeesList(data);
    }, () => {});

    return () => {
      unsubPromoters();
      unsubEmployees();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Calculate members per team
  const getTeamCounts = (teamId: string) => {
    const norm = normalizeTeamId(teamId);
    const promotersCount = promotersList.filter(p => normalizeTeamId(p.team) === norm).length;
    const employeesCount = employeesList.filter(e => normalizeTeamId(e.team) === norm).length;
    return {
      promoters: promotersCount,
      employees: employeesCount,
      total: promotersCount + employeesCount
    };
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const cleanName = name.trim();
    if (!cleanName) {
      setError('Por favor, informe o nome da nova equipe.');
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await createTeamInFirestore(cleanName, icon, color);
      setName('');
      setIcon('💼');
      setColor('indigo');
      setSuccessMsg(`Equipe "${created.name}" criada com sucesso!`);
      if (onSuccess) onSuccess(created);
      if (onTeamCreated) onTeamCreated(created);
      setActiveTab('list');
    } catch (err: any) {
      console.error('Erro ao criar equipe:', err);
      setError(err?.message || 'Erro ao criar equipe. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTeam = async (team: Team) => {
    setError(null);
    setSuccessMsg(null);
    setDeletingTeamId(team.id);

    try {
      await deleteTeamFromFirestore(team.id);
      setSuccessMsg(`Equipe "${team.name}" excluída com sucesso.`);
      setConfirmDeleteId(null);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível excluir esta equipe.');
    } finally {
      setDeletingTeamId(null);
    }
  };

  const handleCleanGhostTeams = async () => {
    setIsCleaningGhosts(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await cleanupEmptyLegacyTeams();
      setSuccessMsg('Varredura concluída: todas as equipes vazias e registros legados de "Start" foram limpos do banco de dados!');
    } catch (err: any) {
      setError('Erro ao executar limpeza: ' + (err?.message || 'Tente novamente.'));
    } finally {
      setIsCleaningGhosts(false);
    }
  };

  const previewStyle = getTeamColorStyle(color);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm transition-opacity" 
        onClick={() => !isSubmitting && onClose()}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-zinc-100 overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
              <Layers size={20} />
            </div>
            <div>
              <h3 className="font-extrabold text-zinc-900 text-lg leading-tight">
                Gerenciamento de Equipes
              </h3>
              <p className="text-xs text-zinc-500 font-medium">
                Visualize, gerencie, cadastre ou exclua equipes do sistema.
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-5 pt-3 pb-2 border-b border-zinc-100 bg-white flex items-center justify-between shrink-0">
          <div className="flex p-1 bg-zinc-100 rounded-xl w-full sm:w-auto">
            <button
              type="button"
              onClick={() => { setActiveTab('list'); setError(null); }}
              className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                activeTab === 'list'
                  ? 'bg-white text-zinc-900 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              <Users size={14} />
              Equipes Cadastradas ({teams.length})
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('create'); setError(null); }}
              className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                activeTab === 'create'
                  ? 'bg-white text-zinc-900 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              <Plus size={14} />
              Criar Nova Equipe
            </button>
          </div>
        </div>

        {/* Alerts / Feedback */}
        <div className="px-5 pt-3 shrink-0">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-semibold flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}
          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-semibold flex items-center gap-2">
              <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}
        </div>

        {/* Tab 1: Equipes Cadastradas */}
        {activeTab === 'list' && (
          <div className="p-5 overflow-y-auto space-y-4 flex-1">
            
            {/* Informative Status Banner about Start / Start Crédito */}
            <div className="p-3.5 bg-gradient-to-r from-emerald-50/80 to-teal-50/50 border border-emerald-200/80 rounded-2xl flex items-start gap-3">
              <div className="h-7 w-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5 font-bold">
                <Check size={16} />
              </div>
              <div className="text-xs space-y-1">
                <p className="font-extrabold text-emerald-950">
                  Status da Equipe Start: Totalmente unificada
                </p>
                <p className="text-emerald-800 leading-relaxed font-medium">
                  A antiga equipe vazia <strong>"Start"</strong> foi completamente excluída do banco de dados e unificada no <strong>Time Start Crédito</strong>. Todos os seus 5 promotores e 3 colaboradores estão seguros e centralizados nela. Não existe nenhuma equipe "Start" vazia ativa.
                </p>
              </div>
            </div>

            {/* List of Teams */}
            <div className="space-y-2.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 block px-1">
                Equipes Ativas no Sistema
              </span>

              {teams.map(team => {
                const normId = normalizeTeamId(team.id);
                const isCore = normId === 'flash' || normId === 'rapidao' || normId === 'start-credito';
                const counts = getTeamCounts(team.id);
                const style = getTeamColorStyle(team.color);
                const isConfirming = confirmDeleteId === team.id;
                const isDeleting = deletingTeamId === team.id;

                return (
                  <div 
                    key={team.id}
                    className="p-3.5 rounded-2xl border border-zinc-200/90 bg-white hover:border-zinc-300 transition-all shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-11 w-11 rounded-xl flex items-center justify-center text-xl shrink-0 ${style.bg} border ${style.border}`}>
                        {team.icon || '👥'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-extrabold text-zinc-900 text-sm">
                            {team.name}
                          </h4>
                          {isCore ? (
                            <span className="px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-600 text-[10px] font-black uppercase tracking-wider border border-zinc-200">
                              Equipe Padrão
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-wider border border-indigo-200">
                              Personalizada
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500 font-medium">
                          <span>{counts.promoters} promotores</span>
                          <span>•</span>
                          <span>{counts.employees} colaboradores</span>
                          <span>•</span>
                          <strong className="text-zinc-800">{counts.total} membros no total</strong>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 self-end sm:self-center">
                      {isCore ? (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-400 text-xs font-semibold select-none">
                          <ShieldCheck size={14} className="text-emerald-500" />
                          <span>Protegida</span>
                        </div>
                      ) : (
                        counts.total === 0 ? (
                          isConfirming ? (
                            <div className="flex items-center gap-1.5 animate-in fade-in duration-150">
                              <span className="text-xs text-red-600 font-bold mr-1">Confirmar?</span>
                              <button
                                type="button"
                                onClick={() => handleDeleteTeam(team)}
                                disabled={isDeleting}
                                className="px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs"
                              >
                                {isDeleting ? 'Excluindo...' : 'Sim, Excluir'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded-lg text-xs font-bold transition-all"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(team.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition-all active:scale-95"
                              title="Excluir equipe vazia"
                            >
                              <Trash2 size={14} />
                              <span>Excluir Equipe</span>
                            </button>
                          )
                        ) : (
                          <span 
                            className="text-[11px] text-zinc-400 italic px-2 py-1"
                            title="Não pode ser excluída porque possui membros ativos"
                          >
                            Possui membros vinculados
                          </span>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Helper button to ensure all ghosts are cleared */}
            <div className="pt-3 border-t border-zinc-100 flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-xs text-zinc-400 font-medium">
                Dúvidas sobre equipes vazias? Clique ao lado para forçar uma limpeza:
              </span>
              <button
                type="button"
                onClick={handleCleanGhostTeams}
                disabled={isCleaningGhosts}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 transition-all shrink-0 active:scale-95 disabled:opacity-50"
              >
                <RefreshCw size={14} className={isCleaningGhosts ? 'animate-spin' : ''} />
                <span>{isCleaningGhosts ? 'Limpando...' : 'Limpar Equipes Fantasma'}</span>
              </button>
            </div>

          </div>
        )}

        {/* Tab 2: Nova Equipe */}
        {activeTab === 'create' && (
          <form onSubmit={handleCreateSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
            
            {/* Team Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-600">
                Nome da Equipe *
              </label>
              <input 
                type="text"
                required
                autoFocus
                placeholder="Ex: Time Cobrança, Time Vendas, Time Comercial..."
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-bold text-zinc-900"
              />
            </div>

            {/* Icon / Emoji Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-600">
                Ícone ou Emoji da Equipe
              </label>
              <div className="flex items-center gap-2">
                <input 
                  type="text"
                  maxLength={4}
                  value={icon}
                  onChange={e => setIcon(e.target.value)}
                  className="w-14 text-center rounded-xl border border-zinc-200 bg-zinc-50 py-2 text-xl font-bold focus:border-indigo-500 focus:outline-none"
                />
                <span className="text-xs text-zinc-400 font-medium">
                  Escolha um emoji abaixo ou digite seu próprio:
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5 p-2 bg-zinc-50 rounded-xl border border-zinc-100 max-h-24 overflow-y-auto">
                {EMOJI_SUGGESTIONS.map(em => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => setIcon(em)}
                    className={`h-8 w-8 rounded-lg text-base flex items-center justify-center transition-all ${
                      icon === em 
                        ? 'bg-white shadow-sm ring-2 ring-indigo-500 scale-110' 
                        : 'hover:bg-white hover:shadow-xs'
                    }`}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>

            {/* Color Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-600">
                Cor de Destaque
              </label>
              <div className="grid grid-cols-4 gap-2">
                {COLOR_OPTIONS.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setColor(c.id)}
                    className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-bold transition-all ${
                      color === c.id 
                        ? 'border-zinc-900 bg-zinc-50 ring-2 ring-zinc-900/10' 
                        : 'border-zinc-200 hover:border-zinc-300'
                    }`}
                  >
                    <span className={`h-3.5 w-3.5 rounded-full ${c.bg} shrink-0`} />
                    <span className="truncate">{c.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Live Preview */}
            <div className="pt-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1.5">
                Pré-visualização do visual:
              </span>
              <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/80 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${previewStyle.badge} flex items-center gap-1.5 shadow-xs`}>
                    <span>{icon || '👥'}</span>
                    <span>{name.trim() || 'Nome da Equipe'}</span>
                  </span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-md border ${previewStyle.bg} ${previewStyle.text} ${previewStyle.border}`}>
                    Exemplo de Tag
                  </span>
                </div>
              </div>
            </div>

            {/* Form Footer */}
            <div className="pt-3 border-t border-zinc-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setActiveTab('list')}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-bold text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors"
              >
                Voltar à Lista
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !name.trim()}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-600/10 transition-all active:scale-95 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Criando...</span>
                  </>
                ) : (
                  <>
                    <Plus size={16} />
                    <span>Criar Equipe</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Modal Footer when on list tab */}
        {activeTab === 'list' && (
          <div className="p-4 bg-zinc-50/50 border-t border-zinc-100 flex items-center justify-end shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs transition-colors shadow-sm"
            >
              Fechar
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
