import React, { useState, useEffect } from 'react';
import { X, ArrowRightLeft, Check, Users, ShieldAlert, ArrowRight } from 'lucide-react';
import { Employee, Team } from '../types';
import { transferEmployeeTeam, getTeamDisplay, getTeamColorStyle } from '../lib/teams';

interface TransferEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee?: Employee | null;
  employees?: Employee[];
  teams: Team[];
  onSuccess?: (employee: Employee, targetTeam: string) => void;
  onTransferred?: (employee: Employee, targetTeamName: string) => void;
}

export function TransferEmployeeModal({
  isOpen,
  onClose,
  employee,
  employees = [],
  teams,
  onSuccess,
  onTransferred,
}: TransferEmployeeModalProps) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [selectedTeamId, setSelectedTeamId] = useState<string>('flash');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync selected employee and current team
  useEffect(() => {
    if (employee) {
      setSelectedEmployeeId(employee.id);
      setSelectedTeamId(employee.team || 'flash');
      setError(null);
    } else if (employees.length > 0) {
      setSelectedEmployeeId(employees[0].id);
      setSelectedTeamId(employees[0].team || 'flash');
      setError(null);
    }
  }, [employee, employees, isOpen]);

  const activeEmployee = employee || employees.find(e => e.id === selectedEmployeeId) || null;

  useEffect(() => {
    if (activeEmployee) {
      setSelectedTeamId(activeEmployee.team || 'flash');
    }
  }, [selectedEmployeeId]);

  if (!isOpen) return null;
  if (!activeEmployee) return null;

  const currentTeamId = activeEmployee.team || 'flash';
  const currentDisplay = getTeamDisplay(currentTeamId, teams);
  const currentStyle = getTeamColorStyle(currentDisplay.color);

  const targetDisplay = getTeamDisplay(selectedTeamId, teams);
  const targetStyle = getTeamColorStyle(targetDisplay.color);

  const handleConfirmTransfer = async () => {
    if (selectedTeamId === currentTeamId) {
      setError('Selecione uma equipe diferente da atual para efetuar a transferência.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await transferEmployeeTeam(activeEmployee.id, selectedTeamId);
      const targetTeamName = getTeamDisplay(selectedTeamId, teams).name;
      if (onSuccess) {
        onSuccess(activeEmployee, selectedTeamId);
      }
      if (onTransferred) {
        onTransferred(activeEmployee, targetTeamName);
      }
      onClose();
    } catch (err: any) {
      console.error('Erro ao transferir funcionário:', err);
      setError(err?.message || 'Erro ao realizar a transferência. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-zinc-950/50 backdrop-blur-sm transition-opacity" 
        onClick={() => !isSubmitting && onClose()}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-zinc-100 overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-5 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
              <ArrowRightLeft size={18} />
            </div>
            <div>
              <h3 className="font-extrabold text-zinc-900 text-base leading-tight">
                Transferir Funcionário de Equipe
              </h3>
              <p className="text-xs text-zinc-500 font-medium">
                Mude o funcionário para uma nova equipe ou time de operação.
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

        {/* Content */}
        <div className="p-6 space-y-5">
          
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-semibold flex items-center gap-2">
              <ShieldAlert size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* If no single employee was fixed, allow picking employee */}
          {employees.length > 0 && !employee && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-700 block">
                Selecione o Funcionário a Transferir:
              </label>
              <select
                value={selectedEmployeeId}
                onChange={e => setSelectedEmployeeId(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm font-bold text-zinc-900 focus:border-indigo-500 focus:outline-none"
              >
                {employees.map(emp => {
                  const empTeamDisplay = getTeamDisplay(emp.team, teams);
                  return (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} — Atual: {empTeamDisplay.icon} {empTeamDisplay.name}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {/* Employee Summary Card */}
          <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400 block">
                Funcionário(a) Selecionado(a)
              </span>
              <h4 className="text-base font-bold text-zinc-900 mt-0.5">
                {activeEmployee.name}
              </h4>
              <p className="text-xs text-zinc-500 font-medium">
                {activeEmployee.role || 'Cargo não especificado'} • CPF: {activeEmployee.document}
              </p>
            </div>

            <div className="flex flex-col items-start sm:items-end">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                Equipe Atual
              </span>
              <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${currentStyle.bg} ${currentStyle.text} border ${currentStyle.border} flex items-center gap-1.5 shadow-2xs`}>
                <span>{currentDisplay.icon}</span>
                <span>{currentDisplay.name}</span>
              </span>
            </div>
          </div>

          {/* Visual Transition Indicator */}
          <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-zinc-600">De:</span>
              <span className={`px-2 py-0.5 rounded text-xs font-bold ${currentStyle.bg} ${currentStyle.text}`}>
                {currentDisplay.icon} {currentDisplay.name}
              </span>
            </div>
            
            <ArrowRight size={16} className="text-indigo-600 shrink-0" />

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-zinc-600">Para:</span>
              <span className={`px-2 py-0.5 rounded text-xs font-bold ${targetStyle.bg} ${targetStyle.text}`}>
                {targetDisplay.icon} {targetDisplay.name}
              </span>
            </div>
          </div>

          {/* Select Target Team */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-700 block">
              Selecione a Nova Equipe de Destino:
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-60 overflow-y-auto pr-1">
              {teams.map(team => {
                const isSelected = selectedTeamId === team.id;
                const isCurrent = currentTeamId === team.id;

                return (
                  <button
                    key={team.id}
                    type="button"
                    onClick={() => setSelectedTeamId(team.id)}
                    className={`p-3 rounded-xl border text-left flex items-center justify-between gap-3 transition-all ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-600/20 shadow-xs'
                        : 'border-zinc-200 hover:border-zinc-300 bg-white hover:bg-zinc-50/50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-xl shrink-0">{team.icon || '👥'}</span>
                      <div className="min-w-0">
                        <p className="font-bold text-xs text-zinc-900 truncate">
                          {team.name}
                        </p>
                        <p className="text-[10px] text-zinc-400 font-medium">
                          {isCurrent ? '(Equipe Atual)' : 'Mover para cá'}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {isSelected ? (
                        <span className="h-5 w-5 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                          <Check size={12} strokeWidth={3} />
                        </span>
                      ) : (
                        <span className="h-5 w-5 rounded-full border border-zinc-300" />
                      )}
                    </div>
                  </button>
                );
              })}

              {/* Both Teams Option */}
              <button
                type="button"
                onClick={() => setSelectedTeamId('both')}
                className={`p-3 rounded-xl border text-left flex items-center justify-between gap-3 transition-all sm:col-span-2 ${
                  selectedTeamId === 'both'
                    ? 'border-purple-600 bg-purple-50/40 ring-2 ring-purple-600/20 shadow-xs'
                    : 'border-zinc-200 hover:border-zinc-300 bg-white hover:bg-zinc-50/50'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-xl shrink-0">⚡🚀</span>
                  <div className="min-w-0">
                    <p className="font-bold text-xs text-purple-950 truncate">
                      Ambas as Equipes (Divisão 50% Flash / 50% Rapidão)
                    </p>
                    <p className="text-[10px] text-purple-700 font-medium">
                      Salário e encargos divididos igualmente entre Flash e Rapidão
                    </p>
                  </div>
                </div>

                <div className="shrink-0">
                  {selectedTeamId === 'both' ? (
                    <span className="h-5 w-5 rounded-full bg-purple-600 text-white flex items-center justify-center">
                      <Check size={12} strokeWidth={3} />
                    </span>
                  ) : (
                    <span className="h-5 w-5 rounded-full border border-zinc-300" />
                  )}
                </div>
              </button>
            </div>
          </div>

          <div className="text-[11px] text-zinc-500 bg-zinc-50 p-3 rounded-xl border border-zinc-100 flex items-start gap-2">
            <span className="text-amber-500 text-sm">💡</span>
            <p>
              Ao transferir, todos os relatórios futuros, fechamentos de mês e filtros considerarão a nova equipe designada. O histórico de faltas e adiantamentos permanece preservado.
            </p>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-zinc-100 bg-zinc-50/80 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-bold text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirmTransfer}
            disabled={isSubmitting || selectedTeamId === currentTeamId}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-600/10 transition-all active:scale-95 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Transferindo...</span>
              </>
            ) : (
              <>
                <ArrowRightLeft size={16} />
                <span>Confirmar Transferência</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
