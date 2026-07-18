import React, { useState, useMemo } from 'react';
import { Copy, Check, Calendar, Coins, UserCheck, AlertTriangle, Search, CheckCircle, FileSpreadsheet } from 'lucide-react';
import { Employee, EmployeeAbsence, EmployeeAdvance } from '../types';

interface EmployeeReportProps {
  employees: Employee[];
  allAbsences: EmployeeAbsence[];
  allAdvances: EmployeeAdvance[];
  readOnly?: boolean;
}

export function EmployeeReport({ employees, allAbsences, allAdvances, readOnly }: EmployeeReportProps) {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1; // 1-12

  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [bulkCopied, setBulkCopied] = useState(false);

  const months = [
    { value: 1, label: 'Janeiro' },
    { value: 2, label: 'Fevereiro' },
    { value: 3, label: 'Março' },
    { value: 4, label: 'Abril' },
    { value: 5, label: 'Maio' },
    { value: 6, label: 'Junho' },
    { value: 7, label: 'Julho' },
    { value: 8, label: 'Agosto' },
    { value: 9, label: 'Setembro' },
    { value: 10, label: 'Outubro' },
    { value: 11, label: 'Novembro' },
    { value: 12, label: 'Dezembro' }
  ];

  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  // Helper to format currency
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  // Process data for the selected month and year
  const employeeSalaries = useMemo(() => {
    return employees.map(emp => {
      // Filter absences for selected month/year
      const empAbsences = allAbsences.filter(abs => {
        if (abs.employeeId !== emp.id) return false;
        const [y, m] = abs.date.split('-');
        return Number(y) === selectedYear && Number(m) === selectedMonth;
      });

      // Filter advances for selected month/year
      const empAdvances = allAdvances.filter(adv => {
        if (adv.employeeId !== emp.id) return false;
        const [y, m] = adv.date.split('-');
        return Number(y) === selectedYear && Number(m) === selectedMonth;
      });

      const totalAbsencesDiscount = empAbsences.reduce((sum, abs) => sum + abs.discount, 0);
      const totalAdvances = empAdvances.reduce((sum, adv) => sum + adv.amount, 0);
      const netSalary = Math.max(0, emp.baseSalary - totalAbsencesDiscount - totalAdvances);

      return {
        employee: emp,
        absencesCount: empAbsences.length,
        totalAbsencesDiscount,
        totalAdvances,
        netSalary,
        absencesList: empAbsences,
        advancesList: empAdvances
      };
    });
  }, [employees, allAbsences, allAdvances, selectedMonth, selectedYear]);

  // Filter salaries by search query
  const filteredSalaries = useMemo(() => {
    return employeeSalaries.filter(item => {
      const nameMatch = item.employee.name.toLowerCase().includes(searchQuery.toLowerCase());
      const docMatch = item.employee.document.toLowerCase().includes(searchQuery.toLowerCase());
      return nameMatch || docMatch;
    });
  }, [employeeSalaries, searchQuery]);

  const flashSalaries = useMemo(() => {
    return filteredSalaries.filter(item => !item.employee.team || item.employee.team === 'flash');
  }, [filteredSalaries]);

  const rapidaoSalaries = useMemo(() => {
    return filteredSalaries.filter(item => item.employee.team === 'rapidao');
  }, [filteredSalaries]);

  // Overall financial sums
  const reportTotals = useMemo(() => {
    return filteredSalaries.reduce((totals, item) => {
      if (!item.employee.active) return totals; // Only count active in the card summaries
      return {
        totalBaseSalaries: totals.totalBaseSalaries + item.employee.baseSalary,
        totalAbsencesDiscount: totals.totalAbsencesDiscount + item.totalAbsencesDiscount,
        totalAdvances: totals.totalAdvances + item.totalAdvances,
        totalNetSalary: totals.totalNetSalary + item.netSalary
      };
    }, { totalBaseSalaries: 0, totalAbsencesDiscount: 0, totalAdvances: 0, totalNetSalary: 0 });
  }, [filteredSalaries]);

  // Format payment data for copying
  const getPaymentText = (item: typeof employeeSalaries[0]) => {
    const monthLabel = months.find(m => m.value === selectedMonth)?.label;
    return `Nome: ${item.employee.name}
CPF: ${item.employee.document}
Chave Pix (${item.employee.pixKeyType}): ${item.employee.pixKey}
Valor a Receber: ${formatCurrency(item.netSalary)}
Referência: Folha de Pagamento - ${monthLabel}/${selectedYear}`;
  };

  const handleCopySingle = (item: typeof employeeSalaries[0]) => {
    const text = getPaymentText(item);
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(item.employee.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleCopyBulk = () => {
    const activeSalaries = filteredSalaries.filter(s => s.employee.active && s.netSalary > 0);
    if (activeSalaries.length === 0) return;

    const text = activeSalaries.map(item => getPaymentText(item)).join('\n\n====================\n\n');
    navigator.clipboard.writeText(text).then(() => {
      setBulkCopied(true);
      setTimeout(() => setBulkCopied(false), 2000);
    });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      
      {/* Filters and Selection Header */}
      <div className="bg-white p-6 rounded-2xl border border-zinc-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex flex-wrap items-center gap-4">
          
          {/* Month Selector */}
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">Mês de Referência</span>
            <div className="relative">
              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(Number(e.target.value))}
                className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-xs font-bold focus:border-indigo-500 focus:outline-none transition-all pr-8"
              >
                {months.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Year Selector */}
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">Ano</span>
            <div className="relative">
              <select
                value={selectedYear}
                onChange={e => setSelectedYear(Number(e.target.value))}
                className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-xs font-bold focus:border-indigo-500 focus:outline-none transition-all pr-8"
              >
                {years.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Search */}
          <div className="space-y-1 w-full sm:w-64">
            <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">Buscar Funcionário</span>
            <div className="relative">
              <input
                type="text"
                placeholder="Buscar por nome ou CPF..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-4 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:border-indigo-500 transition-all font-medium"
              />
              <Search size={14} className="absolute left-2.5 top-2.5 text-zinc-400" />
            </div>
          </div>

        </div>

        {/* Copy All Button */}
        <button
          onClick={handleCopyBulk}
          disabled={filteredSalaries.filter(s => s.employee.active && s.netSalary > 0).length === 0}
          className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-xs font-bold text-white hover:bg-indigo-700 transition-all shadow-md shadow-indigo-600/10 active:scale-95 disabled:opacity-50"
        >
          {bulkCopied ? <CheckCircle size={16} /> : <Copy size={16} />}
          {bulkCopied ? 'Copiado para Área de Transferência!' : 'Copiar Todos em Lote (PIX)'}
        </button>
      </div>

      {/* Totals Cards (Active Employees Only) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-white p-5 rounded-2xl border border-zinc-100 shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-xl bg-indigo-50 text-indigo-600">
            <Coins size={20} />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Folha Bruta (Ativos)</div>
            <div className="text-lg font-extrabold text-zinc-900 mt-0.5">
              {formatCurrency(reportTotals.totalBaseSalaries)}
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-zinc-100 shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-xl bg-red-50 text-red-600">
            <AlertTriangle size={20} />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Total de Descontos (Faltas)</div>
            <div className="text-lg font-extrabold text-red-600 mt-0.5">
              -{formatCurrency(reportTotals.totalAbsencesDiscount)}
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-zinc-100 shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-xl bg-amber-50 text-amber-600">
            <Coins size={20} />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Total de Adiantamentos</div>
            <div className="text-lg font-extrabold text-amber-600 mt-0.5">
              -{formatCurrency(reportTotals.totalAdvances)}
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-emerald-100 bg-emerald-50/10 shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600">
            <UserCheck size={20} />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-emerald-700 tracking-wider">Total Líquido a Pagar</div>
            <div className="text-lg font-extrabold text-emerald-700 mt-0.5">
              {formatCurrency(reportTotals.totalNetSalary)}
            </div>
          </div>
        </div>

      </div>

      {/* Main Closing Sheet - Separated by Team */}
      <div className="space-y-8">
        {/* Table for Time Flash */}
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-zinc-100 bg-zinc-50/50 flex justify-between items-center">
            <div>
              <h3 className="font-bold text-zinc-900 text-base flex items-center gap-2">
                <span className="text-indigo-600">⚡</span> Folha de Fechamento - Time Flash
              </h3>
              <p className="text-xs font-semibold text-zinc-500 mt-0.5">
                Visualize e copie as informações dos funcionários mensalistas do Time Flash.
              </p>
            </div>
            <span className="text-xs font-bold text-zinc-400 bg-zinc-100 px-3 py-1 rounded-full">
              {flashSalaries.length} funcionários
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50/30 border-b border-zinc-100 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  <th className="px-6 py-4">Nome do Funcionário</th>
                  <th className="px-6 py-4">CPF / Documento</th>
                  <th className="px-6 py-4">Salário Base</th>
                  <th className="px-6 py-4">Faltas (Desconto)</th>
                  <th className="px-6 py-4">Adiantamentos</th>
                  <th className="px-6 py-4">Líquido a Receber</th>
                  <th className="px-6 py-4 text-center">Dados de Pagamento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-xs font-medium text-zinc-600">
                {flashSalaries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-zinc-400 font-bold bg-zinc-50/20">
                      Nenhum funcionário encontrado no Time Flash.
                    </td>
                  </tr>
                ) : (
                  flashSalaries.map(item => (
                    <tr key={item.employee.id} className={`hover:bg-zinc-50/40 transition-colors ${!item.employee.active ? 'opacity-55 bg-zinc-50/10' : ''}`}>
                      <td className="px-6 py-4.5">
                        <div className="font-bold text-zinc-900 flex items-center gap-1.5">
                          {item.employee.name}
                          {!item.employee.active && (
                            <span className="text-[8px] uppercase tracking-wider bg-zinc-100 text-zinc-400 px-1.5 py-0.5 rounded font-bold border border-zinc-200">
                              Inativo
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-400 mt-0.5 font-bold">Celular: {item.employee.phoneNumber || 'Não informado'}</div>
                      </td>

                      <td className="px-6 py-4.5 font-mono text-zinc-500 font-semibold">
                        {item.employee.document}
                      </td>

                      <td className="px-6 py-4.5 font-bold text-zinc-800">
                        {formatCurrency(item.employee.baseSalary)}
                      </td>

                      <td className="px-6 py-4.5">
                        {item.absencesCount > 0 ? (
                          <div className="text-red-600">
                            <span className="font-bold">-{formatCurrency(item.totalAbsencesDiscount)}</span>
                            <span className="text-[10px] block text-red-500 font-bold font-mono">({item.absencesCount} {item.absencesCount === 1 ? 'falta' : 'faltas'})</span>
                          </div>
                        ) : (
                          <span className="text-zinc-400 font-bold">-</span>
                        )}
                      </td>

                      <td className="px-6 py-4.5">
                        {item.totalAdvances > 0 ? (
                          <span className="text-amber-600 font-bold">
                            -{formatCurrency(item.totalAdvances)}
                          </span>
                        ) : (
                          <span className="text-zinc-400 font-bold">-</span>
                        )}
                      </td>

                      <td className="px-6 py-4.5">
                        <span className={`text-sm font-extrabold ${item.netSalary > 0 ? 'text-emerald-700' : 'text-zinc-400'}`}>
                          {formatCurrency(item.netSalary)}
                        </span>
                      </td>

                      <td className="px-6 py-4.5 text-center">
                        <button
                          onClick={() => handleCopySingle(item)}
                          disabled={item.netSalary === 0}
                          className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border shadow-sm ${
                            copiedId === item.employee.id
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50 active:scale-95 disabled:opacity-40'
                          }`}
                          title="Copiar dados formatados do funcionário"
                        >
                          {copiedId === item.employee.id ? (
                            <>
                              <Check size={14} />
                              <span>Copiado!</span>
                            </>
                          ) : (
                            <>
                              <Copy size={14} />
                              <span>Copiar Pix</span>
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Table for Time Rapidão */}
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-zinc-100 bg-zinc-50/50 flex justify-between items-center">
            <div>
              <h3 className="font-bold text-zinc-900 text-base flex items-center gap-2">
                <span className="text-amber-500">🚀</span> Folha de Fechamento - Time Rapidão
              </h3>
              <p className="text-xs font-semibold text-zinc-500 mt-0.5">
                Visualize e copie as informações dos funcionários mensalistas do Time Rapidão.
              </p>
            </div>
            <span className="text-xs font-bold text-zinc-400 bg-zinc-100 px-3 py-1 rounded-full">
              {rapidaoSalaries.length} funcionários
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50/30 border-b border-zinc-100 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  <th className="px-6 py-4">Nome do Funcionário</th>
                  <th className="px-6 py-4">CPF / Documento</th>
                  <th className="px-6 py-4">Salário Base</th>
                  <th className="px-6 py-4">Faltas (Desconto)</th>
                  <th className="px-6 py-4">Adiantamentos</th>
                  <th className="px-6 py-4">Líquido a Receber</th>
                  <th className="px-6 py-4 text-center">Dados de Pagamento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-xs font-medium text-zinc-600">
                {rapidaoSalaries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-zinc-400 font-bold bg-zinc-50/20">
                      Nenhum funcionário encontrado no Time Rapidão.
                    </td>
                  </tr>
                ) : (
                  rapidaoSalaries.map(item => (
                    <tr key={item.employee.id} className={`hover:bg-zinc-50/40 transition-colors ${!item.employee.active ? 'opacity-55 bg-zinc-50/10' : ''}`}>
                      <td className="px-6 py-4.5">
                        <div className="font-bold text-zinc-900 flex items-center gap-1.5">
                          {item.employee.name}
                          {!item.employee.active && (
                            <span className="text-[8px] uppercase tracking-wider bg-zinc-100 text-zinc-400 px-1.5 py-0.5 rounded font-bold border border-zinc-200">
                              Inativo
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-400 mt-0.5 font-bold">Celular: {item.employee.phoneNumber || 'Não informado'}</div>
                      </td>

                      <td className="px-6 py-4.5 font-mono text-zinc-500 font-semibold">
                        {item.employee.document}
                      </td>

                      <td className="px-6 py-4.5 font-bold text-zinc-800">
                        {formatCurrency(item.employee.baseSalary)}
                      </td>

                      <td className="px-6 py-4.5">
                        {item.absencesCount > 0 ? (
                          <div className="text-red-600">
                            <span className="font-bold">-{formatCurrency(item.totalAbsencesDiscount)}</span>
                            <span className="text-[10px] block text-red-500 font-bold font-mono">({item.absencesCount} {item.absencesCount === 1 ? 'falta' : 'faltas'})</span>
                          </div>
                        ) : (
                          <span className="text-zinc-400 font-bold">-</span>
                        )}
                      </td>

                      <td className="px-6 py-4.5">
                        {item.totalAdvances > 0 ? (
                          <span className="text-amber-600 font-bold">
                            -{formatCurrency(item.totalAdvances)}
                          </span>
                        ) : (
                          <span className="text-zinc-400 font-bold">-</span>
                        )}
                      </td>

                      <td className="px-6 py-4.5">
                        <span className={`text-sm font-extrabold ${item.netSalary > 0 ? 'text-emerald-700' : 'text-zinc-400'}`}>
                          {formatCurrency(item.netSalary)}
                        </span>
                      </td>

                      <td className="px-6 py-4.5 text-center">
                        <button
                          onClick={() => handleCopySingle(item)}
                          disabled={item.netSalary === 0}
                          className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border shadow-sm ${
                            copiedId === item.employee.id
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50 active:scale-95 disabled:opacity-40'
                          }`}
                          title="Copiar dados formatados do funcionário"
                        >
                          {copiedId === item.employee.id ? (
                            <>
                              <Check size={14} />
                              <span>Copiado!</span>
                            </>
                          ) : (
                            <>
                              <Copy size={14} />
                              <span>Copiar Pix</span>
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  );
}
