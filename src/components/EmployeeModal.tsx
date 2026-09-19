import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle, Trash2, AlertTriangle } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, addDoc, updateDoc, doc, getDocs, writeBatch } from 'firebase/firestore';
import { Employee, Team, DEFAULT_TEAMS } from '../types';

interface EmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingEmployee?: Employee | null;
  onDelete?: (employee: Employee) => void;
  readOnly?: boolean;
  teams?: Team[];
}

export function EmployeeModal({ isOpen, onClose, editingEmployee, onDelete, readOnly, teams = DEFAULT_TEAMS }: EmployeeModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    level: '',
    document: '',
    pixKey: '',
    pixKeyType: 'CPF' as Employee['pixKeyType'],
    phoneNumber: '',
    baseSalary: 2000,
    active: true,
    team: 'flash' as Employee['team'],
    admissionDate: '',
    dismissalDate: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setConfirmingDelete(false);
    setError(null);
    if (editingEmployee) {
      setFormData({
        name: editingEmployee.name,
        role: editingEmployee.role || '',
        level: editingEmployee.level || '',
        document: editingEmployee.document,
        pixKey: editingEmployee.pixKey,
        pixKeyType: editingEmployee.pixKeyType,
        phoneNumber: editingEmployee.phoneNumber || '',
        baseSalary: editingEmployee.baseSalary || 2000,
        active: editingEmployee.active,
        team: editingEmployee.team || 'flash',
        admissionDate: editingEmployee.admissionDate || '',
        dismissalDate: editingEmployee.dismissalDate || ''
      });
    } else {
      setFormData({
        name: '',
        role: '',
        level: '',
        document: '',
        pixKey: '',
        pixKeyType: 'CPF',
        phoneNumber: '',
        baseSalary: 2000,
        active: true,
        team: 'flash',
        admissionDate: '',
        dismissalDate: ''
      });
    }
  }, [editingEmployee, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    // Basic validation
    if (!formData.name.trim() || !formData.document.trim() || !formData.pixKey.trim()) {
      setError('Por favor, preencha todos os campos obrigatórios (Nome, CPF e Chave Pix).');
      setIsSubmitting(false);
      return;
    }

    try {
      const parsedSalary = Number(formData.baseSalary);
      const dataToSave = {
        name: formData.name.trim(),
        role: formData.role.trim(),
        level: formData.level,
        document: formData.document.trim(),
        pixKey: formData.pixKey.trim(),
        pixKeyType: formData.pixKeyType,
        phoneNumber: formData.phoneNumber.trim() || 'Não informado',
        baseSalary: isNaN(parsedSalary) ? 0 : parsedSalary,
        active: Boolean(formData.active),
        team: formData.team || 'flash',
        admissionDate: formData.admissionDate || '',
        dismissalDate: formData.dismissalDate || '',
        updatedAt: new Date().toISOString()
      };

      if (editingEmployee) {
        const employeeRef = doc(db, 'employees', editingEmployee.id);
        await updateDoc(employeeRef, dataToSave);
      } else {
        const employeesCollection = collection(db, 'employees');
        await addDoc(employeesCollection, {
          ...dataToSave,
          createdAt: new Date().toISOString()
        });
      }

      onClose();
    } catch (err: any) {
      console.error('Erro ao salvar funcionário:', err);
      setError(err?.message || 'Erro ao salvar os dados do funcionário. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteDirectly = async () => {
    if (!editingEmployee || readOnly) return;
    setIsDeleting(true);
    setError(null);

    try {
      const absSnap = await getDocs(collection(db, `employees/${editingEmployee.id}/absences`));
      const advSnap = await getDocs(collection(db, `employees/${editingEmployee.id}/advances`));

      const batch = writeBatch(db);
      absSnap.docs.forEach(d => batch.delete(d.ref));
      advSnap.docs.forEach(d => batch.delete(d.ref));
      batch.delete(doc(db, 'employees', editingEmployee.id));
      await batch.commit();

      if (onDelete) {
        onDelete(editingEmployee);
      }
      onClose();
    } catch (err: any) {
      console.error('Erro ao excluir funcionário:', err);
      setError(err?.message || 'Erro ao excluir o funcionário. Tente novamente.');
      setIsDeleting(false);
    }
  };

  const formattedCurrentSalary = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(formData.baseSalary) || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-zinc-950/50 backdrop-blur-sm transition-opacity" 
        onClick={() => {
          if (!isSubmitting && !isDeleting) onClose();
        }} 
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-xl rounded-2xl border border-zinc-100 bg-white shadow-2xl transition-all duration-300 flex flex-col max-h-[90vh] overflow-hidden my-auto z-10">
        
        {/* Header (Always Visible) */}
        <div className="flex items-center justify-between p-5 sm:p-6 pb-4 border-b border-zinc-100 bg-white shrink-0">
          <div>
            <h3 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
              <span>{editingEmployee ? 'Editar Funcionário' : 'Novo Funcionário'}</span>
              {editingEmployee && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold border border-indigo-100">
                  ID: {editingEmployee.id.slice(0, 6)}...
                </span>
              )}
            </h3>
            <p className="text-xs font-medium text-zinc-500 mt-1">
              {editingEmployee ? `Alterando dados de ${formData.name || 'funcionário'}` : 'Cadastre um novo funcionário mensalista.'}
            </p>
          </div>
          <button 
            type="button"
            disabled={isSubmitting || isDeleting}
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mx-6 mt-4 flex items-start gap-2.5 rounded-xl bg-red-50 p-3.5 text-red-800 border border-red-200 text-xs font-bold">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <div className="flex-1">{error}</div>
          </div>
        )}

        {/* Scrollable Form Body */}
        <form 
          id="employee-modal-form" 
          onSubmit={handleSubmit} 
          className="flex-1 overflow-y-auto p-5 sm:p-6 py-4 space-y-4"
        >
          <div className="space-y-4">
            
            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Nome Completo *</label>
              <input 
                type="text"
                required
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex: João Silva de Souza"
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-medium"
              />
            </div>

            {/* Role and Seniority Level */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Função / Cargo</label>
                <select 
                  value={formData.role}
                  onChange={e => setFormData({ ...formData, role: e.target.value })}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-bold"
                >
                  <option value="">Selecione o Cargo (Opcional)</option>
                  <option value="Analista de Cadastro">Analista de Cadastro</option>
                  <option value="Gestor de Carteira">Gestor de Carteira</option>
                  <option value="Recuperador">Recuperador</option>
                  <option value="Capitão">Capitão</option>
                  <option value="Coordenador">Coordenador</option>
                  {formData.role && !['Analista de Cadastro', 'Gestor de Carteira', 'Recuperador', 'Capitão', 'Coordenador'].includes(formData.role) && (
                    <option value={formData.role}>{formData.role}</option>
                  )}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Nível / Senioridade</label>
                <select 
                  value={formData.level}
                  onChange={e => setFormData({ ...formData, level: e.target.value })}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-bold"
                >
                  <option value="">Selecione o Nível (Opcional)</option>
                  <option value="Trainee">Trainee</option>
                  <option value="Júnior">Júnior</option>
                  <option value="Pleno">Pleno</option>
                  <option value="Sênior">Sênior</option>
                </select>
              </div>
            </div>

            {/* Document and Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">CPF / Documento *</label>
                <input 
                  type="text"
                  required
                  value={formData.document}
                  onChange={e => setFormData({ ...formData, document: e.target.value })}
                  placeholder="Ex: 000.000.000-00"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-medium font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Celular / Telefone</label>
                <input 
                  type="text"
                  value={formData.phoneNumber}
                  onChange={e => setFormData({ ...formData, phoneNumber: e.target.value })}
                  placeholder="Ex: (11) 99999-9999"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-medium"
                />
              </div>
            </div>

            {/* Base Salary and Team */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Salário Base Mensal (R$) *</label>
                  <span className="text-[11px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                    {formattedCurrentSalary}
                  </span>
                </div>
                <input 
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={formData.baseSalary ?? ''}
                  onChange={e => setFormData({ ...formData, baseSalary: e.target.value === '' ? ('' as any) : Number(e.target.value) })}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-bold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Equipe / Time *</label>
                <select 
                  value={formData.team}
                  onChange={e => setFormData({ ...formData, team: e.target.value as Employee['team'] })}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-bold"
                >
                  {teams.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.icon || '👥'} {t.name} (100%)
                    </option>
                  ))}
                  <option value="both">⚡🚀 Ambas as Equipes (50% Flash / 50% Rapidão)</option>
                </select>
              </div>
            </div>

            {formData.team === 'both' && (
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-900 font-medium">
                <p className="font-bold flex items-center gap-1.5 text-purple-950">
                  <span>⚡🚀</span> Divisão 50/50 Habilitada
                </p>
                <p className="mt-1">
                  O valor do salário base acima é o <strong>Salário Total</strong> do funcionário. Cada equipe assumirá exatamente a metade:
                  <span className="font-bold text-purple-900 ml-1">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((Number(formData.baseSalary) || 0) / 2)} para o Time Flash
                  </span> e <span className="font-bold text-purple-900">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((Number(formData.baseSalary) || 0) / 2)} para o Time Rapidão
                  </span>.
                </p>
              </div>
            )}

            {/* Admission and Dismissal Dates */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Data de Admissão</label>
                <input 
                  type="date"
                  value={formData.admissionDate}
                  onChange={e => setFormData({ ...formData, admissionDate: e.target.value })}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-medium"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Data de Demissão</label>
                <input 
                  type="date"
                  value={formData.dismissalDate}
                  onChange={e => setFormData({ ...formData, dismissalDate: e.target.value })}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-medium"
                />
              </div>
            </div>

            {/* Pix configuration */}
            <div className="bg-zinc-50/50 p-4 rounded-xl border border-zinc-100 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Dados para Pagamento (Pix)</h4>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Tipo de Chave *</label>
                  <select 
                    value={formData.pixKeyType}
                    onChange={e => setFormData({ ...formData, pixKeyType: e.target.value as Employee['pixKeyType'] })}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-bold"
                  >
                    <option value="CPF">CPF</option>
                    <option value="CNPJ">CNPJ</option>
                    <option value="Email">E-mail</option>
                    <option value="Phone">Telefone / Celular</option>
                    <option value="Random">Chave Aleatória (EVP)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Chave Pix *</label>
                    {formData.pixKeyType === 'CPF' && formData.document && (
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, pixKey: formData.document })}
                        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800"
                      >
                        Copiar do CPF
                      </button>
                    )}
                  </div>
                  <input 
                    type="text"
                    required
                    value={formData.pixKey}
                    onChange={e => setFormData({ ...formData, pixKey: e.target.value })}
                    placeholder="Chave Pix para depósito"
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-medium font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Active Status */}
            <div className="flex items-center gap-3 py-2">
              <input 
                type="checkbox"
                id="active"
                checked={formData.active}
                onChange={e => setFormData({ ...formData, active: e.target.checked })}
                className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
              />
              <label htmlFor="active" className="text-sm font-bold text-zinc-700 select-none cursor-pointer">
                Funcionário Ativo (Aparece no Fechamento do Mês)
              </label>
            </div>

          </div>
        </form>

        {/* Fixed Sticky Footer (Always in View, never hidden by scroll) */}
        <div className="p-4 sm:p-5 border-t border-zinc-100 bg-zinc-50/90 shrink-0 flex flex-col gap-3">
          {confirmingDelete ? (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-red-900">
                <AlertTriangle size={16} className="text-red-600 shrink-0" />
                <span>Confirmar exclusão definitiva de <strong>{formData.name}</strong>?</span>
              </div>
              <p className="text-[11px] text-red-700">
                Esta ação apagará permanentemente o cadastro e todas as faltas e adiantamentos vinculados.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setConfirmingDelete(false)}
                  className="flex-1 rounded-xl border border-zinc-200 bg-white py-2 text-xs font-bold text-zinc-600 hover:bg-zinc-50 transition-all active:scale-95 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleDeleteDirectly}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-red-600 py-2 text-xs font-bold text-white hover:bg-red-700 transition-all shadow-md active:scale-95 disabled:opacity-50"
                >
                  <Trash2 size={14} />
                  <span>{isDeleting ? 'Excluindo...' : 'Sim, Excluir Definitivamente'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              {editingEmployee && !readOnly ? (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setConfirmingDelete(true)}
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-bold text-red-600 hover:bg-red-100 hover:border-red-300 transition-all flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50"
                  title="Excluir este funcionário definitivamente"
                >
                  <Trash2 size={14} />
                  <span>Excluir Funcionário</span>
                </button>
              ) : <div />}

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={onClose}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-600 hover:bg-zinc-100 transition-all active:scale-95 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  form="employee-modal-form"
                  disabled={isSubmitting}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/15 disabled:opacity-50 active:scale-95"
                >
                  <Save size={15} />
                  <span>{isSubmitting ? 'Salvando...' : 'Salvar Funcionário'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
