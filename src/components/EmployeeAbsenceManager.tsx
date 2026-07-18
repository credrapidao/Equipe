import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, User, Trash2, Plus, AlertCircle, Coins, Search, FileText } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { Employee, EmployeeAbsence, OperationType } from '../types';
import { handleFirestoreError } from '../lib/utils';

interface EmployeeAbsenceManagerProps {
  employees: Employee[];
  allAbsences: EmployeeAbsence[];
  readOnly?: boolean;
}

export function EmployeeAbsenceManager({ employees, allAbsences, readOnly }: EmployeeAbsenceManagerProps) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState<string>('Falta injustificada');
  const [discount, setDiscount] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Auto-calculate suggested discount when employee selection changes
  useEffect(() => {
    if (!selectedEmployeeId) {
      setDiscount(0);
      return;
    }
    const emp = employees.find(e => e.id === selectedEmployeeId);
    if (emp) {
      // Standard discount is salary divided by 30 days
      const suggested = Math.round((emp.baseSalary / 30) * 100) / 100;
      setDiscount(suggested);
    }
  }, [selectedEmployeeId, employees]);

  const activeEmployees = useMemo(() => {
    return employees.filter(e => e.active);
  }, [employees]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeId) {
      setError('Por favor, selecione um funcionário.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const absenceData = {
        employeeId: selectedEmployeeId,
        date,
        discount: Number(discount) || 0,
        reason: reason.trim(),
        recordedAt: new Date().toISOString()
      };

      await addDoc(collection(db, `employees/${selectedEmployeeId}/absences`), absenceData);
      
      setSuccess('Falta registrada com sucesso!');
      // Reset some fields
      setReason('Falta injustificada');
      // Keep employee selected or clear as desired. Let's keep it but reset discount
      const emp = employees.find(e => e.id === selectedEmployeeId);
      if (emp) {
        setDiscount(Math.round((emp.baseSalary / 30) * 100) / 100);
      }
    } catch (err: any) {
      handleFirestoreError(err, OperationType.CREATE, `employees/${selectedEmployeeId}/absences`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (absence: EmployeeAbsence) => {
    if (!window.confirm('Tem certeza de que deseja remover este registro de falta?')) return;
    try {
      await deleteDoc(doc(db, `employees/${absence.employeeId}/absences`, absence.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `employees/${absence.employeeId}/absences/${absence.id}`);
    }
  };

  // Helper to get employee name
  const getEmployeeName = (id: string) => {
    return employees.find(e => e.id === id)?.name || 'Funcionário Excluído';
  };

  // Format date to BR format
  const formatBRDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
  };

  // Filter absences
  const filteredAbsences = useMemo(() => {
    return allAbsences.filter(abs => {
      const empName = getEmployeeName(abs.employeeId).toLowerCase();
      const reasonMatch = (abs.reason || '').toLowerCase().includes(searchQuery.toLowerCase());
      return empName.includes(searchQuery.toLowerCase()) || reasonMatch;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [allAbsences, searchQuery, employees]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
      
      {/* Registration Form */}
      {!readOnly && (
        <div className="lg:col-span-1 bg-white p-6 rounded-2xl border border-zinc-100 shadow-sm space-y-6 h-fit">
          <div>
            <h3 className="text-lg font-bold text-zinc-900">Registrar Falta</h3>
            <p className="text-xs font-medium text-zinc-500 mt-1">
              Lance faltas e defina o valor do desconto no salário.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 p-4 text-red-800 border border-red-100 text-xs font-medium">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-start gap-2 rounded-xl bg-green-50 p-4 text-green-800 border border-green-100 text-xs font-bold">
              <span>{success}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Employee */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Funcionário *</label>
              <div className="relative">
                <select
                  required
                  value={selectedEmployeeId}
                  onChange={e => setSelectedEmployeeId(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 pl-10 text-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-bold"
                >
                  <option value="">Selecione um funcionário...</option>
                  {activeEmployees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} (Salário: R$ {emp.baseSalary})
                    </option>
                  ))}
                </select>
                <User size={16} className="absolute left-3.5 top-3.5 text-zinc-400" />
              </div>
            </div>

            {/* Date */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Data da Falta *</label>
              <div className="relative">
                <input
                  type="date"
                  required
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 pl-10 text-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-bold"
                />
                <Calendar size={16} className="absolute left-3.5 top-3.5 text-zinc-400" />
              </div>
            </div>

            {/* Reason */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Motivo / Descrição</label>
              <input
                type="text"
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Ex: Falta sem justificativa médica"
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-medium"
              />
            </div>

            {/* Discount amount */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Valor do Desconto (R$) *</label>
                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                  Sugerido: R$ {selectedEmployeeId ? Math.round((employees.find(e => e.id === selectedEmployeeId)?.baseSalary || 0) / 30 * 100) / 100 : 0}
                </span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={discount}
                  onChange={e => setDiscount(Number(e.target.value))}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 pl-10 text-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-bold"
                />
                <Coins size={16} className="absolute left-3.5 top-3.5 text-zinc-400" />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/15 disabled:opacity-50 active:scale-95"
            >
              <Plus size={18} />
              {isSubmitting ? 'Registrando...' : 'Registrar Falta'}
            </button>
          </form>
        </div>
      )}

      {/* Absences History */}
      <div className={`${readOnly ? 'lg:col-span-3' : 'lg:col-span-2'} bg-white p-6 rounded-2xl border border-zinc-100 shadow-sm space-y-6 flex flex-col h-[550px]`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-zinc-900">Histórico de Faltas</h3>
            <p className="text-xs font-medium text-zinc-500 mt-1">
              Faltas registradas para os funcionários.
            </p>
          </div>
          
          <div className="relative w-full sm:w-64">
            <input
              type="text"
              placeholder="Buscar por funcionário ou motivo..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all font-medium"
            />
            <Search size={14} className="absolute left-3 top-3 text-zinc-400" />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto pr-1">
          {filteredAbsences.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 bg-zinc-50/50 rounded-2xl border border-dashed border-zinc-200">
              <FileText size={40} className="text-zinc-300 mb-2" />
              <p className="text-sm font-bold text-zinc-500">Nenhuma falta registrada</p>
              <p className="text-xs text-zinc-400 mt-1">As faltas adicionadas aparecerão nesta lista.</p>
            </div>
          ) : (
            <div className="border border-zinc-100 rounded-2xl overflow-hidden divide-y divide-zinc-100">
              {filteredAbsences.map(abs => (
                <div key={abs.id} className="p-4 flex items-center justify-between hover:bg-zinc-50/50 transition-colors">
                  <div className="space-y-1 pr-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-zinc-900">{getEmployeeName(abs.employeeId)}</span>
                      <span className="text-[10px] font-bold text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
                        {formatBRDate(abs.date)}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 font-medium">Motivo: {abs.reason || 'Sem descrição'}</p>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-xs font-bold text-red-600">-{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(abs.discount)}</div>
                      <div className="text-[9px] uppercase font-bold text-zinc-400 tracking-wider">Desconto</div>
                    </div>
                    {!readOnly && (
                      <button
                        onClick={() => handleDelete(abs)}
                        className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                        title="Excluir Registro"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
