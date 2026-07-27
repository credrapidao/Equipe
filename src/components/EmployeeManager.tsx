import React, { useState, useEffect, useMemo } from 'react';
import { Users, CalendarX, Wallet, ClipboardCheck, Plus, Search, Edit, Key } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
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
  const [searchQuery, setSearchQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);

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

  // Filtered employees for the main list
  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = emp.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          emp.document.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = showInactive || emp.active;
    return matchesSearch && matchesStatus;
  });

  const flashEmployees = useMemo(() => {
    return filteredEmployees.filter(emp => !emp.team || emp.team === 'flash');
  }, [filteredEmployees]);

  const rapidaoEmployees = useMemo(() => {
    return filteredEmployees.filter(emp => emp.team === 'rapidao');
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
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white p-4 rounded-2xl border border-zinc-100 shadow-sm w-full">
              <div className="relative w-full sm:w-80">
                <input
                  type="text"
                  placeholder="Buscar funcionário por nome ou CPF..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-sm font-medium"
                />
                <Search size={16} className="absolute left-3.5 top-3.5 text-zinc-400" />
              </div>

              <div className="flex items-center gap-2.5 self-end sm:self-center">
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
                {(userTeam === 'all' || userTeam === 'flash') && (
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
                              <td className="px-5 py-3.5 font-bold text-zinc-900">{emp.name}</td>
                              <td className="px-5 py-3.5 font-mono text-zinc-500">{emp.document}</td>
                              <td className="px-5 py-3.5 font-semibold text-zinc-700">{emp.phoneNumber || '-'}</td>
                              <td className="px-5 py-3.5 text-right font-bold text-zinc-900">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(emp.baseSalary)}
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
                                  <button
                                    onClick={() => {
                                      setEditingEmployee(emp);
                                      setIsModalOpen(true);
                                    }}
                                    className="p-1.5 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                    title="Editar Funcionário"
                                  >
                                    <Edit size={14} />
                                  </button>
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
                {(userTeam === 'all' || userTeam === 'rapidao') && (
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
                              <td className="px-5 py-3.5 font-bold text-zinc-900">{emp.name}</td>
                              <td className="px-5 py-3.5 font-mono text-zinc-500">{emp.document}</td>
                              <td className="px-5 py-3.5 font-semibold text-zinc-700">{emp.phoneNumber || '-'}</td>
                              <td className="px-5 py-3.5 text-right font-bold text-zinc-900">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(emp.baseSalary)}
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
                                  <button
                                    onClick={() => {
                                      setEditingEmployee(emp);
                                      setIsModalOpen(true);
                                    }}
                                    className="p-1.5 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                    title="Editar Funcionário"
                                  >
                                    <Edit size={14} />
                                  </button>
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
      />
    </div>
  );
}
