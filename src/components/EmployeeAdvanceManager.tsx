import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, User, Trash2, Plus, AlertCircle, Coins, Search, Wallet, Copy, Check, FileSpreadsheet } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { Employee, EmployeeAdvance, OperationType, Team } from '../types';
import { handleFirestoreError } from '../lib/utils';
import { exportEmployeeAdvancesToExcel } from '../lib/excelExport';

interface EmployeeAdvanceManagerProps {
  employees: Employee[];
  allAdvances: EmployeeAdvance[];
  readOnly?: boolean;
  teams?: Team[];
}

export function EmployeeAdvanceManager({ employees, allAdvances, readOnly, teams = [] }: EmployeeAdvanceManagerProps) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState<string>('Adiantamento quinzenal');
  const [amount, setAmount] = useState<number>(0);
  const [status, setStatus] = useState<'pending' | 'paid'>('pending');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedPending, setCopiedPending] = useState(false);

  const activeEmployees = useMemo(() => {
    return employees.filter(e => e.active);
  }, [employees]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeId) {
      setError('Por favor, selecione um funcionário.');
      return;
    }
    if (amount <= 0) {
      setError('O valor do adiantamento deve ser maior que zero.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const advanceData = {
        employeeId: selectedEmployeeId,
        date,
        amount: Number(amount),
        notes: notes.trim(),
        status,
        recordedAt: new Date().toISOString()
      };

      await addDoc(collection(db, `employees/${selectedEmployeeId}/advances`), advanceData);
      
      setSuccess('Adiantamento registrado com sucesso!');
      setAmount(0);
      setNotes('Adiantamento quinzenal');
    } catch (err: any) {
      handleFirestoreError(err, OperationType.CREATE, `employees/${selectedEmployeeId}/advances`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (adv: EmployeeAdvance) => {
    if (!window.confirm('Tem certeza de que deseja remover este adiantamento?')) return;
    try {
      await deleteDoc(doc(db, `employees/${adv.employeeId}/advances`, adv.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `employees/${adv.employeeId}/advances/${adv.id}`);
    }
  };

  const handleToggleStatus = async (adv: EmployeeAdvance) => {
    const newStatus = adv.status === 'pending' ? 'paid' : 'pending';
    try {
      await updateDoc(doc(db, `employees/${adv.employeeId}/advances`, adv.id), {
        status: newStatus
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `employees/${adv.employeeId}/advances/${adv.id}`);
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

  const copyIndividualAdvance = (adv: EmployeeAdvance) => {
    const emp = employees.find(e => e.id === adv.employeeId);
    const name = emp?.name || getEmployeeName(adv.employeeId);
    const doc = emp?.document ? `CPF: ${emp.document}` : 'CPF: Não informado';
    const pix = emp?.pixKey ? `PIX (${emp.pixKeyType || 'Chave'}): ${emp.pixKey}` : 'PIX: Não informado';
    const amount = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(adv.amount);
    const dateStr = formatBRDate(adv.date);
    const noteStr = adv.notes ? `\nNota: ${adv.notes}` : '';

    const text = `NOME: ${name}\n${doc}\n${pix}\nVALOR: ${amount}\nDATA: ${dateStr}${noteStr}`;

    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(adv.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const copyPendingSummary = () => {
    const pendingAdvances = filteredAdvances.filter(a => a.status === 'pending');
    if (pendingAdvances.length === 0) {
      alert('Nenhum adiantamento pendente na lista atual.');
      return;
    }

    const list = pendingAdvances.map(adv => {
      const emp = employees.find(e => e.id === adv.employeeId);
      const name = emp?.name || getEmployeeName(adv.employeeId);
      const doc = emp?.document ? `CPF: ${emp.document}` : 'CPF: N/I';
      const pix = emp?.pixKey ? `PIX (${emp.pixKeyType || 'PIX'}): ${emp.pixKey}` : 'PIX: N/I';
      const amount = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(adv.amount);
      return `• NOME: ${name}\n  ${doc}\n  ${pix}\n  VALOR: ${amount}\n  DATA: ${formatBRDate(adv.date)}`;
    }).join('\n\n');

    const text = `ADIANTAMENTOS PENDENTES DE FUNCIONÁRIOS:\n\n${list}`;

    navigator.clipboard.writeText(text).then(() => {
      setCopiedPending(true);
      setTimeout(() => setCopiedPending(false), 2000);
    });
  };

  // Filter advances
  const filteredAdvances = useMemo(() => {
    return allAdvances.filter(adv => {
      const empName = getEmployeeName(adv.employeeId).toLowerCase();
      const notesMatch = (adv.notes || '').toLowerCase().includes(searchQuery.toLowerCase());
      return empName.includes(searchQuery.toLowerCase()) || notesMatch;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [allAdvances, searchQuery, employees]);

  const pendingAdvancesCount = useMemo(() => {
    return filteredAdvances.filter(a => a.status === 'pending').length;
  }, [filteredAdvances]);

  const handleExportExcel = () => {
    const pendingOnly = filteredAdvances.filter(a => a.status === 'pending');
    if (pendingOnly.length === 0) {
      alert('Nenhum adiantamento pendente para exportar.');
      return;
    }
    exportEmployeeAdvancesToExcel({
      advances: pendingOnly,
      employees,
      teams,
      title: 'Adiantamentos Pendentes de Funcionários',
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
      
      {/* Registration Form */}
      {!readOnly && (
        <div className="lg:col-span-1 bg-white p-6 rounded-2xl border border-zinc-100 shadow-sm space-y-6 h-fit">
          <div>
            <h3 className="text-lg font-bold text-zinc-900">Lançar Adiantamento</h3>
            <p className="text-xs font-medium text-zinc-500 mt-1">
              Lance adiantamentos para descontar no holerite mensal.
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
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Data *</label>
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

            {/* Amount */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Valor do Adiantamento (R$) *</label>
              <div className="relative">
                <input
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                  value={amount || ''}
                  onChange={e => setAmount(Number(e.target.value))}
                  placeholder="Ex: 500.00"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 pl-10 text-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-bold"
                />
                <Coins size={16} className="absolute left-3.5 top-3.5 text-zinc-400" />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Observação / Notas</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Ex: Vale quinzenal"
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-medium"
              />
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Status de Pagamento</label>
              <div className="flex bg-zinc-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setStatus('pending')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                    status === 'pending'
                      ? 'bg-white text-amber-700 shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  ⏳ Pendente
                </button>
                <button
                  type="button"
                  onClick={() => setStatus('paid')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                    status === 'paid'
                      ? 'bg-white text-green-700 shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  ✅ Pago
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/15 disabled:opacity-50 active:scale-95"
            >
              <Plus size={18} />
              {isSubmitting ? 'Registrando...' : 'Registrar Adiantamento'}
            </button>
          </form>
        </div>
      )}

      {/* Advances History */}
      <div className={`${readOnly ? 'lg:col-span-3' : 'lg:col-span-2'} bg-white p-6 rounded-2xl border border-zinc-100 shadow-sm space-y-6 flex flex-col h-[550px]`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-zinc-900">Histórico de Adiantamentos</h3>
            <p className="text-xs font-medium text-zinc-500 mt-1">
              Adiantamentos lançados para funcionários.
            </p>
          </div>
          
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={copyPendingSummary}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border shrink-0 ${
                copiedPending 
                  ? 'bg-green-50 text-green-700 border-green-200' 
                  : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100 hover:text-indigo-600'
              }`}
              title="Copiar lista de adiantamentos pendentes"
            >
              {copiedPending ? <Check size={14} /> : <Copy size={14} />}
              <span>{copiedPending ? 'Copiado!' : 'Copiar Pendentes'}</span>
            </button>

            <button
              onClick={handleExportExcel}
              disabled={pendingAdvancesCount === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 disabled:opacity-50 shrink-0 shadow-xs"
              title="Exportar apenas adiantamentos pendentes para Excel (.xlsx)"
            >
              <FileSpreadsheet size={14} />
              <span>Exportar Pendentes ({pendingAdvancesCount})</span>
            </button>

            <div className="relative w-full sm:w-64">
              <input
                type="text"
                placeholder="Buscar por funcionário ou nota..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all font-medium"
              />
              <Search size={14} className="absolute left-3 top-3 text-zinc-400" />
            </div>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto pr-1">
          {filteredAdvances.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 bg-zinc-50/50 rounded-2xl border border-dashed border-zinc-200">
              <Wallet size={40} className="text-zinc-300 mb-2" />
              <p className="text-sm font-bold text-zinc-500">Nenhum adiantamento registrado</p>
              <p className="text-xs text-zinc-400 mt-1">Os adiantamentos adicionados aparecerão nesta lista.</p>
            </div>
          ) : (
            <div className="border border-zinc-100 rounded-2xl overflow-hidden divide-y divide-zinc-100">
              {filteredAdvances.map(adv => (
                <div key={adv.id} className="p-4 flex items-center justify-between hover:bg-zinc-50/50 transition-colors">
                  <div className="space-y-1 pr-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-zinc-900">{getEmployeeName(adv.employeeId)}</span>
                      <span className="text-[10px] font-bold text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
                        {formatBRDate(adv.date)}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 font-medium">Nota: {adv.notes || 'Sem descrição'}</p>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-xs font-bold text-amber-600">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(adv.amount)}</div>
                      {!readOnly ? (
                        <button 
                          onClick={() => handleToggleStatus(adv)}
                          className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full transition-all mt-1 ${
                            adv.status === 'paid' 
                              ? 'bg-green-50 text-green-700 border border-green-100' 
                              : 'bg-amber-50 text-amber-700 border border-amber-100'
                          }`}
                        >
                          {adv.status === 'paid' ? 'Pago' : 'Pendente'}
                        </button>
                      ) : (
                        <span 
                          className={`inline-block text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full mt-1 ${
                            adv.status === 'paid' 
                              ? 'bg-green-50 text-green-700 border border-green-100' 
                              : 'bg-amber-50 text-amber-700 border border-amber-100'
                          }`}
                        >
                          {adv.status === 'paid' ? 'Pago' : 'Pendente'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => copyIndividualAdvance(adv)}
                        className={`p-2 rounded-xl transition-all ${
                          copiedId === adv.id 
                            ? 'bg-green-50 text-green-600' 
                            : 'text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50'
                        }`}
                        title="Copiar dados do funcionário para PIX"
                      >
                        {copiedId === adv.id ? <Check size={16} /> : <Copy size={16} />}
                      </button>
                      {!readOnly && (
                        <button
                          onClick={() => handleDelete(adv)}
                          className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                          title="Excluir Registro"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
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
