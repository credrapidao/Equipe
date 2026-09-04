import React, { useState, useEffect, useMemo } from 'react';
import { Users, CalendarX, Wallet, ClipboardCheck, Plus, Search, Edit, Key, X, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, doc, deleteDoc, getDocs, writeBatch } from 'firebase/firestore';
import { Employee, EmployeeAbsence, EmployeeAdvance, OperationType } from '../types';
import { handleFirestoreError } from '../lib/utils';
import { EmployeeCard } from './EmployeeCard';
import { EmployeeModal } from './EmployeeModal';
import { EmployeeAbsenceManager } from './EmployeeAbsenceManager';
import { EmployeeAdvanceManager } from './EmployeeAdvanceManager';
import { EmployeeReport } from './EmployeeReport';

interface EmployeeManagerProps {
  readOnly?: boolean;
  userTeam?: 'all' | 'flash' | 'rapidao';
}

export function EmployeeManager({ readOnly, userTeam = 'all' }: EmployeeManagerProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);

  const formatBRDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    const [y, m, d] = dateStr.split('-');
    if (!y || !m || !d) return dateStr;
    return `${d}/${m}/${y}`;
  };
  const [allAbsences, setAllAbsences] = useState<EmployeeAbsence[]>([]);
  const [allAdvances, setAllAdvances] = useState<EmployeeAdvance[]>([]);
  
  const [activeSubTab, setActiveSubTab] = useState<'manage' | 'absences' | 'advances' | 'closing'>('manage');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [teamFilter, setTeamFilter] = useState<'all' | 'flash' | 'rapidao'>('all');

  // Subscribe to Employees
  useEffect(() => {
    const q = query(collection(db, 'employees'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee));
      setEmployees(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'employees');
    });

    return () => unsubscribe();
  }, []);

  // Subscribe to Absences and Advances for each employee in real time
  useEffect(() => {
    if (employees.length === 0) {
      setAllAbsences([]);
      setAllAdvances([]);
      return;
    }

    const unsubscribes: (() => void)[] = [];

    employees.forEach(emp => {
      // Absences
      const absQ = query(collection(db, `employees/${emp.id}/absences`));
      const unsubAbs = onSnapshot(absQ, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmployeeAbsence));
        setAllAbsences(prev => {
          const others = prev.filter(a => a.employeeId !== emp.id);
          return [...others, ...data];
        });
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, `employees/${emp.id}/absences`);
      });
      unsubscribes.push(unsubAbs);

      // Advances
      const advQ = query(collection(db, `employees/${emp.id}/advances`));
      const unsubAdv = onSnapshot(advQ, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmployeeAdvance));
        setAllAdvances(prev => {
          const others = prev.filter(a => a.employeeId !== emp.id);
          return [...others, ...data];
        });
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, `employees/${emp.id}/advances`);
      });
      unsubscribes.push(unsubAdv);
    });

    return () => unsubscribes.forEach(u => u());
  }, [employees]);

  // Handler to delete employee and cascade delete all their registered advances and absences
  const handleDeleteEmployee = async (employee: Employee) => {
    if (readOnly) return;
    setIsDeleting(true);
    try {
      // 1. Fetch subcollections
      const absSnap = await getDocs(collection(db, `employees/${employee.id}/absences`));
      const advSnap = await getDocs(collection(db, `employees/${employee.id}/advances`));

      const batch = writeBatch(db);
      absSnap.docs.forEach(d => {
        batch.delete(d.ref);
      });
      advSnap.docs.forEach(d => {
        batch.delete(d.ref);
      });
      batch.delete(doc(db, 'employees', employee.id));
      await batch.commit();

      setFeedbackToast({
        type: 'success',
        message: `Funcionário "${employee.name}" foi excluído com sucesso.`
      });
      setTimeout(() => setFeedbackToast(null), 4000);

      setEmployeeToDelete(null);
      if (editingEmployee?.id === employee.id) {
        setIsModalOpen(false);
        setEditingEmployee(null);
      }
    } catch (err: any) {
      console.error('Erro ao excluir funcionário:', err);
      setFeedbackToast({
        type: 'error',
        message: `Erro ao excluir funcionário: ${err?.message || 'Tente novamente.'}`
      });
      setTimeout(() => setFeedbackToast(null), 6000);
    } finally {
      setIsDeleting(false);
    }
  };

  // Filtered employees for the main list
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      const rawQuery = searchQuery.trim().toLowerCase();
      const normalize = (str: string) => (str || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

      const matchesStatus = showInactive || emp.active || rawQuery.length > 0;
      if (!matchesStatus) return false;

      if (!rawQuery) return true;

      const normQuery = normalize(rawQuery);
      const normName = normalize(emp.name);
      const cleanDoc = emp.document.replace(/\D/g, '');
      const cleanQueryDoc = rawQuery.replace(/\D/g, '');
      const normRole = normalize(emp.role || '');

      // Direct match
      if (normName.includes(normQuery)) return true;
      if (cleanQueryDoc.length >= 3 && cleanDoc.includes(cleanQueryDoc)) return true;
      if (normRole.includes(normQuery)) return true;

      // Tokenized search (e.g. if searching "matheus costa", matches if "matheus" or "costa" is in name or role)
      const tokens = normQuery.split(/\s+/).filter(t => t.length >= 2);
      if (tokens.length > 0) {
        const anyTokenMatches = tokens.some(tok => normName.includes(tok) || normRole.includes(tok) || cleanDoc.includes(tok));
        if (anyTokenMatches) return true;
      }

      return false;
    });
  }, [employees, searchQuery, showInactive]);

  const flashEmployees = useMemo(() => {
    return filteredEmployees.filter(emp => !emp.team || emp.team === 'flash' || emp.team === 'both');
  }, [filteredEmployees]);

  const rapidaoEmployees = useMemo(() => {
    return filteredEmployees.filter(emp => emp.team === 'rapidao' || emp.team === 'both');
  }, [filteredEmployees]);

  return (
    <div className="space-y-8">
      {/* Horizontal Subnavigation Tabs */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-200 pb-2">
        <div className="flex flex-wrap bg-zinc-100 p-1 rounded-2xl border border-zinc-200">
          <button
            onClick={() => setActiveSubTab('manage')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 ${
              activeSubTab === 'manage'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-zinc-500 hover:text-indigo-600'
            }`}
          >
            <Users size={14} />
            Cadastro de Funcionários
          </button>
          <button
            onClick={() => setActiveSubTab('absences')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 ${
              activeSubTab === 'absences'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-zinc-500 hover:text-indigo-600'
            }`}
          >
            <CalendarX size={14} />
            Faltas
          </button>
          <button
            onClick={() => setActiveSubTab('advances')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 ${
              activeSubTab === 'advances'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-zinc-500 hover:text-indigo-600'
            }`}
          >
            <Wallet size={14} />
            Adiantamentos
          </button>
          <button
            onClick={() => setActiveSubTab('closing')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 ${
              activeSubTab === 'closing'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-zinc-500 hover:text-indigo-600'
            }`}
          >
            <ClipboardCheck size={14} />
            Fechamento de Mês
          </button>
        </div>

        {/* Action Button: Add Employee */}
        {activeSubTab === 'manage' && !readOnly && (
          <button
            onClick={() => { setEditingEmployee(null); setIsModalOpen(true); }}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 transition-all shadow-md shadow-indigo-600/10 active:scale-95"
          >
            <Plus size={16} />
            Adicionar Funcionário
          </button>
        )}
      </div>

      {/* Rendering Active Tab Content */}
      <div className="transition-all duration-300">
        
        {/* Tab 1: Manage Employees */}
        {activeSubTab === 'manage' && (
          <div className="space-y-6">
            {/* Filter Bar */}
            <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center bg-white p-4 rounded-2xl border border-zinc-100 shadow-sm w-full">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
                <div className="relative flex-1 max-w-md">
                  <input
                    type="text"
                    placeholder="Buscar funcionário por nome, cargo ou CPF..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-9 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-sm font-medium"
                  />
                  <Search size={16} className="absolute left-3.5 top-3.5 text-zinc-400" />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-3 text-zinc-400 hover:text-zinc-600 p-0.5"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {userTeam === 'all' && (
                  <div className="flex bg-zinc-100 p-1 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-600 self-start sm:self-auto">
                    <button
                      onClick={() => setTeamFilter('all')}
                      className={`px-3 py-1.5 rounded-lg transition-all ${
                        teamFilter === 'all' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'
                      }`}
                    >
                      Todos ({filteredEmployees.length})
                    </button>
                    <button
                      onClick={() => setTeamFilter('flash')}
                      className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${
                        teamFilter === 'flash' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-800'
                      }`}
                    >
                      <span>⚡</span> Flash ({flashEmployees.length})
                    </button>
                    <button
                      onClick={() => setTeamFilter('rapidao')}
                      className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${
                        teamFilter === 'rapidao' ? 'bg-amber-500 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-800'
                      }`}
                    >
                      <span>🚀</span> Rapidão ({rapidaoEmployees.length})
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2.5 self-end md:self-center">
                <input
                  type="checkbox"
                  id="showInactiveEmployees"
                  checked={showInactive}
                  onChange={e => setShowInactive(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="showInactiveEmployees" className="text-xs font-bold text-zinc-500 select-none cursor-pointer uppercase tracking-wider">
                  Mostrar Inativos
                </label>
              </div>
            </div>

            {searchQuery.trim().length > 0 && (
              <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl px-4 py-2.5 text-xs text-indigo-900 font-semibold flex items-center justify-between">
                <span>
                  Resultados para <span className="font-bold">"{searchQuery}"</span>: {flashEmployees.length} no Time Flash, {rapidaoEmployees.length} no Time Rapidão.
                </span>
                <button 
                  onClick={() => setSearchQuery('')}
                  className="text-indigo-600 hover:text-indigo-800 underline font-bold text-[11px]"
                >
                  Limpar busca
                </button>
              </div>
            )}

            {/* Grid list replaced with two distinct tables */}
            {filteredEmployees.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center p-12 bg-white rounded-2xl border border-dashed border-zinc-200 h-64">
                <Users size={48} className="text-zinc-300 mb-3" />
                <p className="text-base font-bold text-zinc-700">Nenhum funcionário encontrado</p>
                <p className="text-xs text-zinc-400 mt-1 max-w-sm">Cadastre novos funcionários para começar a gerenciar suas presenças, salários e adiantamentos.</p>
              </div>
            ) : (
              <div className="space-y-8">
                {/* Table for Time Flash */}
                {(userTeam === 'all' || userTeam === 'flash') && (teamFilter === 'all' || teamFilter === 'flash') && (
                  <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
                  <div className="p-5 border-b border-zinc-100 bg-zinc-50/50 flex justify-between items-center">
                    <h4 className="font-bold text-zinc-900 text-sm flex items-center gap-2">
                      <span className="text-indigo-600">⚡</span> Funcionários - Time Flash
                      <span className="text-xs font-bold text-zinc-400 bg-zinc-100 px-2.5 py-0.5 rounded-full">
                        {flashEmployees.length}
                      </span>
                    </h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-zinc-50/30 border-b border-zinc-100 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                          <th className="px-5 py-3.5">Nome</th>
                          <th className="px-5 py-3.5">CPF</th>
                          <th className="px-5 py-3.5">Celular</th>
                          <th className="px-5 py-3.5 text-right">Salário Base</th>
                          <th className="px-5 py-3.5">Pix</th>
                          <th className="px-5 py-3.5">Admissão / Demissão</th>
                          <th className="px-5 py-3.5">Status</th>
                          <th className="px-5 py-3.5 text-center">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 text-xs text-zinc-600">
                        {flashEmployees.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="text-center py-8 text-zinc-400 font-bold">
                              Nenhum funcionário cadastrado no Time Flash.
                            </td>
                          </tr>
                        ) : (
                          flashEmployees.map(emp => (
                            <tr key={emp.id} className={`hover:bg-zinc-50/40 transition-colors ${!emp.active ? 'opacity-60 bg-zinc-50/10' : ''}`}>
                              <td className="px-5 py-3.5 font-bold text-zinc-900">
                                <div className="flex flex-col gap-0.5">
                                  <span>{emp.name}</span>
                                  {emp.team === 'both' && (
                                    <span className="inline-block w-fit text-[9px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100">
                                      ⚡🚀 Divisão 50/50
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-5 py-3.5 font-mono text-zinc-500">{emp.document}</td>
                              <td className="px-5 py-3.5 font-semibold text-zinc-700">{emp.phoneNumber || '-'}</td>
                              <td 
                                onClick={() => {
                                  if (!readOnly) {
                                    setEditingEmployee(emp);
                                    setIsModalOpen(true);
                                  }
                                }}
                                className={`px-5 py-3.5 text-right font-bold text-zinc-900 ${!readOnly ? 'cursor-pointer hover:bg-indigo-50/60 transition-colors group/sal' : ''}`}
                                title={!readOnly ? 'Clique para editar o funcionário' : undefined}
                              >
                                <span className={!readOnly ? 'group-hover/sal:text-indigo-600 transition-colors' : ''}>
                                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(emp.team === 'both' ? emp.baseSalary / 2 : emp.baseSalary)}
                                </span>
                                {emp.team === 'both' && (
                                  <span className="block text-[9px] font-semibold text-purple-600">
                                    (50% de {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(emp.baseSalary)})
                                  </span>
                                )}
                              </td>
                              <td className="px-5 py-3.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded uppercase">
                                    {emp.pixKeyType}
                                  </span>
                                  <span className="font-mono text-zinc-600 truncate max-w-[150px]" title={emp.pixKey}>{emp.pixKey}</span>
                                </div>
                              </td>
                              <td className="px-5 py-3.5">
                                {emp.admissionDate ? (
                                  <div>
                                    <span className="font-semibold text-zinc-700">{formatBRDate(emp.admissionDate)}</span>
                                    {emp.dismissalDate && (
                                      <span className="text-[10px] text-red-500 font-bold block">
                                        Dem.: {formatBRDate(emp.dismissalDate)}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-zinc-400">-</span>
                                )}
                              </td>
                              <td className="px-5 py-3.5">
                                {emp.active ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-green-50 text-green-700 text-[10px] font-bold uppercase tracking-wider border border-green-100">
                                    Ativo
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-zinc-100 text-zinc-500 text-[10px] font-bold uppercase tracking-wider border border-zinc-200">
                                    Inativo
                                  </span>
                                )}
                              </td>
                              <td className="px-5 py-3.5 text-center">
                                {!readOnly ? (
                                  <div className="flex items-center justify-center gap-1.5">
                                    <button
                                      onClick={() => {
                                        setEditingEmployee(emp);
                                        setIsModalOpen(true);
                                      }}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 active:scale-95 rounded-xl transition-all shadow-sm"
                                      title="Editar Funcionário e Salário"
                                    >
                                      <Edit size={13} />
                                      <span>Editar</span>
                                    </button>
                                    <button
                                      onClick={() => setEmployeeToDelete(emp)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 active:scale-95 rounded-xl transition-all shadow-sm"
                                      title="Excluir Funcionário"
                                    >
                                      <Trash2 size={13} />
                                      <span>Excluir</span>
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-zinc-300 text-xs">-</span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

                {/* Table for Time Rapidão */}
                {(userTeam === 'all' || userTeam === 'rapidao') && (teamFilter === 'all' || teamFilter === 'rapidao') && (
                  <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
                  <div className="p-5 border-b border-zinc-100 bg-zinc-50/50 flex justify-between items-center">
                    <h4 className="font-bold text-zinc-900 text-sm flex items-center gap-2">
                      <span className="text-amber-500">🚀</span> Funcionários - Time Rapidão
                      <span className="text-xs font-bold text-zinc-400 bg-zinc-100 px-2.5 py-0.5 rounded-full">
                        {rapidaoEmployees.length}
                      </span>
                    </h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-zinc-50/30 border-b border-zinc-100 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                          <th className="px-5 py-3.5">Nome</th>
                          <th className="px-5 py-3.5">CPF</th>
                          <th className="px-5 py-3.5">Celular</th>
                          <th className="px-5 py-3.5 text-right">Salário Base</th>
                          <th className="px-5 py-3.5">Pix</th>
                          <th className="px-5 py-3.5">Admissão / Demissão</th>
                          <th className="px-5 py-3.5">Status</th>
                          <th className="px-5 py-3.5 text-center">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 text-xs text-zinc-600">
                        {rapidaoEmployees.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="text-center py-8 text-zinc-400 font-bold">
                              Nenhum funcionário cadastrado no Time Rapidão.
                            </td>
                          </tr>
                        ) : (
                          rapidaoEmployees.map(emp => (
                            <tr key={emp.id} className={`hover:bg-zinc-50/40 transition-colors ${!emp.active ? 'opacity-60 bg-zinc-50/10' : ''}`}>
                              <td className="px-5 py-3.5 font-bold text-zinc-900">
                                <div className="flex flex-col gap-0.5">
                                  <span>{emp.name}</span>
                                  {emp.team === 'both' && (
                                    <span className="inline-block w-fit text-[9px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100">
                                      ⚡🚀 Divisão 50/50
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-5 py-3.5 font-mono text-zinc-500">{emp.document}</td>
                              <td className="px-5 py-3.5 font-semibold text-zinc-700">{emp.phoneNumber || '-'}</td>
                              <td 
                                onClick={() => {
                                  if (!readOnly) {
                                    setEditingEmployee(emp);
                                    setIsModalOpen(true);
                                  }
                                }}
                                className={`px-5 py-3.5 text-right font-bold text-zinc-900 ${!readOnly ? 'cursor-pointer hover:bg-indigo-50/60 transition-colors group/sal' : ''}`}
                                title={!readOnly ? 'Clique para editar o funcionário' : undefined}
                              >
                                <span className={!readOnly ? 'group-hover/sal:text-indigo-600 transition-colors' : ''}>
                                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(emp.team === 'both' ? emp.baseSalary / 2 : emp.baseSalary)}
                                </span>
                                {emp.team === 'both' && (
                                  <span className="block text-[9px] font-semibold text-purple-600">
                                    (50% de {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(emp.baseSalary)})
                                  </span>
                                )}
                              </td>
                              <td className="px-5 py-3.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded uppercase">
                                    {emp.pixKeyType}
                                  </span>
                                  <span className="font-mono text-zinc-600 truncate max-w-[150px]" title={emp.pixKey}>{emp.pixKey}</span>
                                </div>
                              </td>
                              <td className="px-5 py-3.5">
                                {emp.admissionDate ? (
                                  <div>
                                    <span className="font-semibold text-zinc-700">{formatBRDate(emp.admissionDate)}</span>
                                    {emp.dismissalDate && (
                                      <span className="text-[10px] text-red-500 font-bold block">
                                        Dem.: {formatBRDate(emp.dismissalDate)}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-zinc-400">-</span>
                                )}
                              </td>
                              <td className="px-5 py-3.5">
                                {emp.active ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-green-50 text-green-700 text-[10px] font-bold uppercase tracking-wider border border-green-100">
                                    Ativo
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-zinc-100 text-zinc-500 text-[10px] font-bold uppercase tracking-wider border border-zinc-200">
                                    Inativo
                                  </span>
                                )}
                              </td>
                              <td className="px-5 py-3.5 text-center">
                                {!readOnly ? (
                                  <div className="flex items-center justify-center gap-1.5">
                                    <button
                                      onClick={() => {
                                        setEditingEmployee(emp);
                                        setIsModalOpen(true);
                                      }}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 active:scale-95 rounded-xl transition-all shadow-sm"
                                      title="Editar Funcionário e Salário"
                                    >
                                      <Edit size={13} />
                                      <span>Editar</span>
                                    </button>
                                    <button
                                      onClick={() => setEmployeeToDelete(emp)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 active:scale-95 rounded-xl transition-all shadow-sm"
                                      title="Excluir Funcionário"
                                    >
                                      <Trash2 size={13} />
                                      <span>Excluir</span>
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-zinc-300 text-xs">-</span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            )}
          </div>
        )}

        {/* Tab 2: Absences */}
        {activeSubTab === 'absences' && (
          <EmployeeAbsenceManager
            employees={employees}
            allAbsences={allAbsences}
            readOnly={readOnly}
          />
        )}

        {/* Tab 3: Advances */}
        {activeSubTab === 'advances' && (
          <EmployeeAdvanceManager
            employees={employees}
            allAdvances={allAdvances}
            readOnly={readOnly}
          />
        )}

        {/* Tab 4: Closing Report */}
        {activeSubTab === 'closing' && (
          <EmployeeReport
            employees={employees}
            allAbsences={allAbsences}
            allAdvances={allAdvances}
            readOnly={readOnly}
          />
        )}

      </div>

      {/* Add/Edit Modal */}
      <EmployeeModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingEmployee(null);
        }}
        editingEmployee={editingEmployee}
        onDelete={(emp) => {
          setEmployeeToDelete(emp);
        }}
        readOnly={readOnly}
      />

      {/* Delete Confirmation Modal */}
      {employeeToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-zinc-950/40 backdrop-blur-sm" 
            onClick={() => !isDeleting && setEmployeeToDelete(null)} 
          />
          <div className="relative w-full max-w-md rounded-2xl border border-zinc-100 bg-white p-6 shadow-2xl transition-all duration-300">
            <div className="flex items-start gap-3.5">
              <div className="p-3 rounded-2xl bg-red-50 text-red-600 border border-red-100 shrink-0">
                <AlertTriangle size={24} />
              </div>
              <div className="space-y-1 flex-1">
                <h3 className="text-lg font-bold text-zinc-900">Excluir Funcionário?</h3>
                <p className="text-xs text-zinc-500 font-medium">
                  Esta ação é irreversível e removerá o cadastro do funcionário.
                </p>
              </div>
              <button
                onClick={() => !isDeleting && setEmployeeToDelete(null)}
                className="text-zinc-400 hover:text-zinc-600 p-1 rounded-lg"
                disabled={isDeleting}
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 p-3.5 bg-zinc-50 rounded-xl border border-zinc-100 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-zinc-400 font-bold uppercase text-[10px]">Nome:</span>
                <span className="font-bold text-zinc-900">{employeeToDelete.name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400 font-bold uppercase text-[10px]">CPF:</span>
                <span className="font-mono text-zinc-700">{employeeToDelete.document}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400 font-bold uppercase text-[10px]">Cargo:</span>
                <span className="font-semibold text-zinc-800">{employeeToDelete.role || 'Não especificado'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400 font-bold uppercase text-[10px]">Equipe:</span>
                <span className="font-bold text-indigo-700">
                  {employeeToDelete.team === 'flash' ? '⚡ Time Flash' : employeeToDelete.team === 'rapidao' ? '🚀 Time Rapidão' : '⚡🚀 Ambas (50/50)'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400 font-bold uppercase text-[10px]">Salário Base:</span>
                <span className="font-bold text-zinc-900">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(employeeToDelete.baseSalary)}
                </span>
              </div>
            </div>

            {/* Check for linked advances / absences */}
            {(() => {
              const advCount = allAdvances.filter(a => a.employeeId === employeeToDelete.id).length;
              const absCount = allAbsences.filter(a => a.employeeId === employeeToDelete.id).length;
              if (advCount > 0 || absCount > 0) {
                return (
                  <div className="mt-3.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
                    <p className="font-bold flex items-center gap-1.5 text-amber-950">
                      <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                      Registros vinculados encontrados:
                    </p>
                    <ul className="list-disc list-inside pl-1 text-[11px] text-amber-800 space-y-0.5">
                      {advCount > 0 && <li>{advCount} adiantamento(s) cadastrado(s)</li>}
                      {absCount > 0 && <li>{absCount} falta(s) / desconto(s) registrada(s)</li>}
                    </ul>
                    <p className="text-[10px] text-amber-700 font-medium pt-0.5">
                      Ao confirmar a exclusão, esses registros também serão removidos definitivamente.
                    </p>
                  </div>
                );
              }
              return null;
            })()}

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setEmployeeToDelete(null)}
                disabled={isDeleting}
                className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-xs font-bold text-zinc-600 hover:bg-zinc-50 transition-all active:scale-95 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleDeleteEmployee(employeeToDelete)}
                disabled={isDeleting}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-red-600 py-2.5 text-xs font-bold text-white hover:bg-red-700 transition-all shadow-md shadow-red-600/20 disabled:opacity-50 active:scale-95"
              >
                <Trash2 size={14} />
                {isDeleting ? 'Excluindo...' : 'Sim, Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {feedbackToast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-5 duration-300">
          <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl border text-sm font-bold ${
            feedbackToast.type === 'success' 
              ? 'bg-zinc-900 text-white border-zinc-800' 
              : 'bg-red-600 text-white border-red-700'
          }`}>
            {feedbackToast.type === 'success' ? (
              <CheckCircle2 size={18} className="text-green-400 shrink-0" />
            ) : (
              <AlertTriangle size={18} className="text-white shrink-0" />
            )}
            <span>{feedbackToast.message}</span>
            <button 
              onClick={() => setFeedbackToast(null)} 
              className="text-zinc-400 hover:text-white ml-2 p-0.5 rounded"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
