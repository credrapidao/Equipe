import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { Employee, OperationType } from '../types';
import { handleFirestoreError } from '../lib/utils';

interface EmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingEmployee?: Employee | null;
}

export function EmployeeModal({ isOpen, onClose, editingEmployee }: EmployeeModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    document: '',
    pixKey: '',
    pixKeyType: 'CPF' as Employee['pixKeyType'],
    phoneNumber: '',
    baseSalary: 2000,
    active: true,
    team: 'flash' as Employee['team']
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editingEmployee) {
      setFormData({
        name: editingEmployee.name,
        document: editingEmployee.document,
        pixKey: editingEmployee.pixKey,
        pixKeyType: editingEmployee.pixKeyType,
        phoneNumber: editingEmployee.phoneNumber || '',
        baseSalary: editingEmployee.baseSalary || 2000,
        active: editingEmployee.active,
        team: editingEmployee.team || 'flash'
      });
    } else {
      setFormData({
        name: '',
        document: '',
        pixKey: '',
        pixKeyType: 'CPF',
        phoneNumber: '',
        baseSalary: 2000,
        active: true,
        team: 'flash'
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
      setError('Por favor, preencha todos os campos obrigatórios.');
      setIsSubmitting(false);
      return;
    }

    try {
      const dataToSave = {
        name: formData.name.trim(),
        document: formData.document.trim(),
        pixKey: formData.pixKey.trim(),
        pixKeyType: formData.pixKeyType,
        phoneNumber: formData.phoneNumber.trim(),
        baseSalary: Number(formData.baseSalary) || 0,
        active: formData.active,
        team: formData.team || 'flash',
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
      handleFirestoreError(err, editingEmployee ? OperationType.UPDATE : OperationType.CREATE, 'employees');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-zinc-950/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal Card */}
      <div className="relative w-full max-w-xl rounded-2xl border border-zinc-100 bg-white p-6 shadow-2xl transition-all duration-300 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-100">
          <div>
            <h3 className="text-xl font-bold text-zinc-900">
              {editingEmployee ? 'Editar Funcionário' : 'Novo Funcionário'}
            </h3>
            <p className="text-xs font-medium text-zinc-500 mt-1">
              {editingEmployee ? 'Atualize as informações do funcionário.' : 'Cadastre um novo funcionário mensalista.'}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-red-50 p-4 text-red-800 border border-red-100">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <div className="text-sm font-medium">{error}</div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
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
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-medium"
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
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Salário Base Mensal (R$) *</label>
                <input 
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={formData.baseSalary}
                  onChange={e => setFormData({ ...formData, baseSalary: Number(e.target.value) })}
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
                  <option value="flash">⚡ Time Flash</option>
                  <option value="rapidao">🚀 Time Rapidão</option>
                </select>
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
                    className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-bold"
                  >
                    <option value="CPF">CPF</option>
                    <option value="CNPJ">CNPJ</option>
                    <option value="Email">E-mail</option>
                    <option value="Phone">Celular</option>
                    <option value="Random">Chave Aleatória</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Chave Pix *</label>
                  <input 
                    type="text"
                    required
                    value={formData.pixKey}
                    onChange={e => setFormData({ ...formData, pixKey: e.target.value })}
                    placeholder="Insira a chave pix"
                    className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-medium"
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
                Funcionário Ativo
              </label>
            </div>

          </div>

          {/* Actions */}
          <div className="pt-4 flex gap-3 border-t border-zinc-100">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-zinc-200 py-3 text-sm font-bold text-zinc-500 hover:bg-zinc-50 transition-all active:scale-95"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/15 disabled:opacity-50 active:scale-95"
            >
              <Save size={18} />
              {isSubmitting ? 'Salvando...' : 'Salvar Funcionário'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
