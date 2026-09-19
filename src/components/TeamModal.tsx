import React, { useState } from 'react';
import { X, Plus, Check, Users, Sparkles } from 'lucide-react';
import { createTeamInFirestore, TEAM_COLOR_MAP, getTeamColorStyle } from '../lib/teams';
import { Team } from '../types';

interface TeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (team: Team) => void;
  onTeamCreated?: (team: Team) => void;
}

const EMOJI_SUGGESTIONS = [
  '⚡', '🚀', '💼', '🎯', '⭐', '🏆', '🔥', '👥', 
  '📈', '🛡️', '💎', '💡', '📞', '🤝', '💰', '🏢',
  '🌟', '💪', '📊', '🏷️'
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

export function TeamModal({ isOpen, onClose, onSuccess, onTeamCreated }: TeamModalProps) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('💼');
  const [color, setColor] = useState('indigo');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

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
      if (onSuccess) {
        onSuccess(created);
      }
      if (onTeamCreated) {
        onTeamCreated(created);
      }
      onClose();
    } catch (err: any) {
      console.error('Erro ao criar equipe:', err);
      setError(err?.message || 'Erro ao criar equipe. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const style = getTeamColorStyle(color);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-zinc-950/50 backdrop-blur-sm transition-opacity" 
        onClick={() => !isSubmitting && onClose()}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl border border-zinc-100 overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-5 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
              <Users size={18} />
            </div>
            <div>
              <h3 className="font-extrabold text-zinc-900 text-base leading-tight">
                Criar Nova Equipe
              </h3>
              <p className="text-xs text-zinc-500 font-medium">
                Adicione uma nova equipe ao sistema para organizar seus funcionários e promotores.
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-xl p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-semibold flex items-center gap-2">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

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
                <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${style.badge} flex items-center gap-1.5 shadow-xs`}>
                  <span>{icon || '👥'}</span>
                  <span>{name.trim() || 'Nome da Equipe'}</span>
                </span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-md border ${style.bg} ${style.text} ${style.border}`}>
                  Exemplo de Tag
                </span>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-zinc-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-bold text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors"
            >
              Cancelar
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

      </div>
    </div>
  );
}
