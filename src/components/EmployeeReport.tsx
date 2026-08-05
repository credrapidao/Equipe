import React, { useState, useMemo } from 'react';
import { Copy, Check, Calendar, Coins, UserCheck, AlertTriangle, Search, CheckCircle, FileSpreadsheet } from 'lucide-react';
import { Employee, EmployeeAbsence, EmployeeAdvance } from '../types';

interface EmployeeReportProps {
  employees: Employee[];
  allAbsences: EmployeeAbsence[];
  allAdvances: EmployeeAdvance[];
  readOnly?: boolean;
}

const formatBRDate = (dateStr?: string) => {
  if (!dateStr) return '';
  if (dateStr.includes('/')) return dateStr;
  const [y, m, d] = dateStr.split('T')[0].split('-');
  if (!y || !m || !d) return dateStr;
  return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
};

const parseDateParts = (dateStr?: string) => {
  if (!dateStr) return null;
  const cleanStr = dateStr.split('T')[0].trim();
  if (cleanStr.includes('/')) {
    const parts = cleanStr.split('/').map(Number);
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      return { year: parts[2], month: parts[1], day: parts[0] };
    }
  }
  if (cleanStr.includes('-')) {
    const parts = cleanStr.split('-').map(Number);
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      return { year: parts[0], month: parts[1], day: parts[2] };
    }
  }
  return null;
};

/**
 * Calculates worked days in a 30-day commercial month considering admission/dismissal dates.
 */
const calculateWorkedDays = (emp: Employee, selectedYear: number, selectedMonth: number) => {
  let startDay = 1;
  let endDay = 30;
  let note = '';

  // 1. Check admission date
  if (emp.admissionDate) {
    const adm = parseDateParts(emp.admissionDate);
    if (adm) {
      if (adm.year > selectedYear || (adm.year === selectedYear && adm.month > selectedMonth)) {
        // Admitted in a future month relative to selected
        return {
          workedDays: 0,
          dailyRate: emp.baseSalary / 30,
          proportionalSalary: 0,
          isPartialMonth: true,
          note: `Não admitido neste mês (Admissão: ${formatBRDate(emp.admissionDate)})`
        };
      }
      if (adm.year === selectedYear && adm.month === selectedMonth) {
        // Admitted in this month
        startDay = Math.min(adm.day, 30);
        note = `Admitido em ${formatBRDate(emp.admissionDate)}`;
      }
    }
  }

  // 2. Check dismissal date (if applicable)
  if (emp.dismissalDate) {
    const dis = parseDateParts(emp.dismissalDate);
    if (dis) {
      if (dis.year < selectedYear || (dis.year === selectedYear && dis.month < selectedMonth)) {
        // Dismissed before selected month
        return {
          workedDays: 0,
          dailyRate: emp.baseSalary / 30,
          proportionalSalary: 0,
          isPartialMonth: true,
          note: `Demitido em mês anterior (${formatBRDate(emp.dismissalDate)})`
        };
      }
      if (dis.year === selectedYear && dis.month === selectedMonth) {
        // Dismissed in this month
        endDay = Math.min(dis.day, 30);
        const disNote = `Demitido em ${formatBRDate(emp.dismissalDate)}`;
        note = note ? `${note} | ${disNote}` : disNote;
      }
    }
  }

  const workedDays = Math.max(0, endDay - startDay + 1);
  const dailyRate = emp.baseSalary / 30;
  const proportionalSalary = Math.round(dailyRate * workedDays * 100) / 100;

  return {
    workedDays,
    dailyRate,
    proportionalSalary,
    isPartialMonth: workedDays < 30,
    note
  };
};

export function EmployeeReport({ employees, allAbsences, allAdvances, readOnly }: EmployeeReportProps) {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1; // 1-12
  const currentDay = today.getDate();

  // If in the first 15 days of the month (e.g. Aug 1 - Aug 15), default payroll closing to previous month (e.g. July)
  const prevMonthValue = currentMonth === 1 ? 12 : currentMonth - 1;
  const prevYearValue = currentMonth === 1 ? currentYear - 1 : currentYear;

  const defaultMonth = currentDay <= 15 ? prevMonthValue : currentMonth;
  const defaultYear = currentDay <= 15 ? prevYearValue : currentYear;

  const [selectedMonth, setSelectedMonth] = useState<number>(defaultMonth);
  const [selectedYear, setSelectedYear] = useState<number>(defaultYear);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [bulkCopied, setBulkCopied] = useState(false);
  const [flashCopied, setFlashCopied] = useState(false);
  const [rapidaoCopied, setRapidaoCopied] = useState(false);

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

      const { workedDays, dailyRate, proportionalSalary, isPartialMonth, note } = calculateWorkedDays(emp, selectedYear, selectedMonth);

      const totalAbsencesDiscount = empAbsences.reduce((sum, abs) => sum + abs.discount, 0);
      const totalAdvances = empAdvances.reduce((sum, adv) => sum + adv.amount, 0);
      const netSalary = Math.max(0, Math.round((proportionalSalary - totalAbsencesDiscount - totalAdvances) * 100) / 100);

      return {
        employee: emp,
        workedDays,
        dailyRate,
        proportionalSalary,
        isPartialMonth,
        note,
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
    return filteredSalaries
      .filter(item => !item.employee.team || item.employee.team === 'flash' || item.employee.team === 'both')
      .map(item => {
        const isSplit = item.employee.team === 'both';
        return {
          ...item,
          isSplit,
          displayProportionalSalary: isSplit ? item.proportionalSalary / 2 : item.proportionalSalary,
          displayAbsencesDiscount: isSplit ? item.totalAbsencesDiscount / 2 : item.totalAbsencesDiscount,
          displayAdvances: isSplit ? item.totalAdvances / 2 : item.totalAdvances,
          displayNetSalary: isSplit ? item.netSalary / 2 : item.netSalary,
        };
      });
  }, [filteredSalaries]);

  const rapidaoSalaries = useMemo(() => {
    return filteredSalaries
      .filter(item => item.employee.team === 'rapidao' || item.employee.team === 'both')
      .map(item => {
        const isSplit = item.employee.team === 'both';
        return {
          ...item,
          isSplit,
          displayProportionalSalary: isSplit ? item.proportionalSalary / 2 : item.proportionalSalary,
          displayAbsencesDiscount: isSplit ? item.totalAbsencesDiscount / 2 : item.totalAbsencesDiscount,
          displayAdvances: isSplit ? item.totalAdvances / 2 : item.totalAdvances,
          displayNetSalary: isSplit ? item.netSalary / 2 : item.netSalary,
        };
      });
  }, [filteredSalaries]);

  const flashTotals = useMemo(() => {
    return flashSalaries.reduce((totals, item) => {
      if (!item.employee.active) return totals;
      return {
        totalBaseSalaries: totals.totalBaseSalaries + item.displayProportionalSalary,
        totalAbsencesDiscount: totals.totalAbsencesDiscount + item.displayAbsencesDiscount,
        totalAdvances: totals.totalAdvances + item.displayAdvances,
        totalNetSalary: totals.totalNetSalary + item.displayNetSalary
      };
    }, { totalBaseSalaries: 0, totalAbsencesDiscount: 0, totalAdvances: 0, totalNetSalary: 0 });
  }, [flashSalaries]);

  const rapidaoTotals = useMemo(() => {
    return rapidaoSalaries.reduce((totals, item) => {
      if (!item.employee.active) return totals;
      return {
        totalBaseSalaries: totals.totalBaseSalaries + item.displayProportionalSalary,
        totalAbsencesDiscount: totals.totalAbsencesDiscount + item.displayAbsencesDiscount,
        totalAdvances: totals.totalAdvances + item.displayAdvances,
        totalNetSalary: totals.totalNetSalary + item.displayNetSalary
      };
    }, { totalBaseSalaries: 0, totalAbsencesDiscount: 0, totalAdvances: 0, totalNetSalary: 0 });
  }, [rapidaoSalaries]);

  // Overall financial sums
  const reportTotals = useMemo(() => {
    return filteredSalaries.reduce((totals, item) => {
      if (!item.employee.active) return totals; // Only count active in the card summaries
      return {
        totalBaseSalaries: totals.totalBaseSalaries + item.proportionalSalary,
        totalAbsencesDiscount: totals.totalAbsencesDiscount + item.totalAbsencesDiscount,
        totalAdvances: totals.totalAdvances + item.totalAdvances,
        totalNetSalary: totals.totalNetSalary + item.netSalary
      };
    }, { totalBaseSalaries: 0, totalAbsencesDiscount: 0, totalAdvances: 0, totalNetSalary: 0 });
  }, [filteredSalaries]);

  // Format payment data for copying
  const getPaymentText = (item: typeof employeeSalaries[0], teamFilter?: 'flash' | 'rapidao') => {
    const isSplit = item.employee.team === 'both';
    const netToPay = (isSplit && teamFilter) ? item.netSalary / 2 : item.netSalary;

    let text = `Nome: ${item.employee.name}`;
    if (item.employee.role) {
      text += `\nFunção: ${item.employee.role}`;
    }
    if (item.employee.level) {
      text += `\nNível: ${item.employee.level}`;
    }
    text += `\nCPF: ${item.employee.document || 'Não informado'}`;
    text += `\nChave Pix (${item.employee.pixKeyType || 'PIX'}): ${item.employee.pixKey || 'Não informada'}`;
    text += `\nValor a Receber: ${formatCurrency(netToPay)}`;

    return text;
  };

  const handleCopySingle = (item: typeof employeeSalaries[0], teamFilter?: 'flash' | 'rapidao') => {
    const text = getPaymentText(item, teamFilter);
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(`${item.employee.id}_${teamFilter || 'all'}`);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleCopyBulk = () => {
    const activeSalaries = filteredSalaries.filter(s => s.employee.active && s.netSalary > 0);
    if (activeSalaries.length === 0) return;

    const monthLabel = months.find(m => m.value === selectedMonth)?.label;
    const textHeader = `FECHAMENTO GERAL (${monthLabel}/${selectedYear})\n--------------------\n`;
    const textBody = activeSalaries.map(item => getPaymentText(item)).join('\n\n');
    const textFooter = `\n--------------------\nTOTAL GERAL: ${formatCurrency(reportTotals.totalNetSalary)}`;

    navigator.clipboard.writeText(textHeader + textBody + textFooter).then(() => {
      setBulkCopied(true);
      setTimeout(() => setBulkCopied(false), 2000);
    });
  };

  const handleCopyTeam = (team: 'flash' | 'rapidao') => {
    const targetSalaries = team === 'flash' ? flashSalaries : rapidaoSalaries;
    const activeSalaries = targetSalaries.filter(s => s.employee.active && s.displayNetSalary > 0);
    if (activeSalaries.length === 0) return;

    const monthLabel = months.find(m => m.value === selectedMonth)?.label;
    const teamTitle = team === 'flash' ? 'TIME FLASH' : 'TIME RAPIDÃO';
    const teamTotalNet = team === 'flash' ? flashTotals.totalNetSalary : rapidaoTotals.totalNetSalary;

    const textHeader = `FECHAMENTO - ${teamTitle} (${monthLabel}/${selectedYear})\n--------------------\n`;
    const textBody = activeSalaries.map(item => getPaymentText(item, team)).join('\n\n');
    const textFooter = `\n--------------------\nTOTAL DA EQUIPE: ${formatCurrency(teamTotalNet)}`;

    navigator.clipboard.writeText(textHeader + textBody + textFooter).then(() => {
      if (team === 'flash') {
        setFlashCopied(true);
        setTimeout(() => setFlashCopied(false), 2000);
      } else {
        setRapidaoCopied(true);
        setTimeout(() => setRapidaoCopied(false), 2000);
      }
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

          {/* Quick Month Toggle Buttons */}
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">Atalho Rápido</span>
            <div className="flex items-center gap-1.5 bg-zinc-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setSelectedMonth(prevMonthValue);
                  setSelectedYear(prevYearValue);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  selectedMonth === prevMonthValue && selectedYear === prevYearValue
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/60'
                }`}
              >
                Fechamento {months.find(m => m.value === prevMonthValue)?.label}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedMonth(currentMonth);
                  setSelectedYear(currentYear);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  selectedMonth === currentMonth && selectedYear === currentYear
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/60'
                }`}
              >
                Mês Atual ({months.find(m => m.value === currentMonth)?.label})
              </button>
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

        {/* Copy Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleCopyTeam('flash')}
            disabled={flashSalaries.filter(s => s.employee.active && s.displayNetSalary > 0).length === 0}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 transition-all shadow-sm active:scale-95 disabled:opacity-50"
            title="Copiar folha de fechamento do Time Flash"
          >
            {flashCopied ? <CheckCircle size={15} /> : <Copy size={15} />}
            <span>{flashCopied ? 'Flash Copiado!' : '⚡ Copiar Flash'}</span>
          </button>

          <button
            onClick={() => handleCopyTeam('rapidao')}
            disabled={rapidaoSalaries.filter(s => s.employee.active && s.displayNetSalary > 0).length === 0}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-amber-700 transition-all shadow-sm active:scale-95 disabled:opacity-50"
            title="Copiar folha de fechamento do Time Rapidão"
          >
            {rapidaoCopied ? <CheckCircle size={15} /> : <Copy size={15} />}
            <span>{rapidaoCopied ? 'Rapidão Copiado!' : '🚀 Copiar Rapidão'}</span>
          </button>

          <button
            onClick={handleCopyBulk}
            disabled={filteredSalaries.filter(s => s.employee.active && s.netSalary > 0).length === 0}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-zinc-800 px-4 py-2.5 text-xs font-bold text-white hover:bg-zinc-900 transition-all shadow-sm active:scale-95 disabled:opacity-50"
            title="Copiar folha de fechamento de todos os funcionários"
          >
            {bulkCopied ? <CheckCircle size={15} /> : <Copy size={15} />}
            <span>{bulkCopied ? 'Geral Copiado!' : '📋 Copiar Geral'}</span>
          </button>
        </div>
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
          <div className="p-6 border-b border-zinc-100 bg-zinc-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-zinc-900 text-base flex items-center gap-2">
                <span className="text-indigo-600">⚡</span> Folha de Fechamento - Time Flash
              </h3>
              <p className="text-xs font-semibold text-zinc-500 mt-0.5">
                Visualize e copie as informações dos funcionários mensalistas do Time Flash.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => handleCopyTeam('flash')}
                disabled={flashSalaries.filter(s => s.employee.active && s.displayNetSalary > 0).length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition-all active:scale-95 disabled:opacity-50"
                title="Copiar fechamento do Time Flash"
              >
                {flashCopied ? (
                  <>
                    <Check size={14} />
                    <span>Flash Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    <span>Copiar Fechamento Flash</span>
                  </>
                )}
              </button>

              <span className="text-xs font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-xl">
                Custo Time Flash: {formatCurrency(flashTotals.totalNetSalary)}
              </span>
              <span className="text-xs font-bold text-zinc-400 bg-zinc-100 px-3 py-1.5 rounded-xl">
                {flashSalaries.length} func.
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50/30 border-b border-zinc-100 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  <th className="px-6 py-4">Nome do Funcionário</th>
                  <th className="px-6 py-4">CPF / Documento</th>
                  <th className="px-6 py-4">Salário (Proporcional)</th>
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
                        <div className="font-bold text-zinc-900 flex items-center gap-1.5 flex-wrap">
                          <span>{item.employee.name}</span>
                          {!item.employee.active && (
                            <span className="text-[8px] uppercase tracking-wider bg-zinc-100 text-zinc-400 px-1.5 py-0.5 rounded font-bold border border-zinc-200">
                              Inativo
                            </span>
                          )}
                          {item.isSplit && (
                            <span className="text-[8px] uppercase tracking-wider bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded font-bold border border-purple-200">
                              ⚡🚀 Rateio 50/50
                            </span>
                          )}
                        </div>
                        {(item.employee.role || item.employee.level) && (
                          <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-bold text-indigo-700 mt-0.5">
                            {item.employee.role && <span>{item.employee.role}</span>}
                            {item.employee.role && item.employee.level && <span className="text-zinc-300">•</span>}
                            {item.employee.level && (
                              <span className="bg-indigo-50 border border-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded text-[9px] uppercase font-extrabold">
                                {item.employee.level}
                              </span>
                            )}
                          </div>
                        )}
                        <div className="text-[10px] text-zinc-400 mt-0.5 font-bold">Celular: {item.employee.phoneNumber || 'Não informado'}</div>
                        {item.employee.admissionDate && (
                          <div className="text-[10px] text-zinc-500 font-medium">
                            Admissão: {formatBRDate(item.employee.admissionDate)}
                          </div>
                        )}
                      </td>

                      <td className="px-6 py-4.5 font-mono text-zinc-500 font-semibold">
                        {item.employee.document}
                      </td>

                      <td className="px-6 py-4.5">
                        <div className="font-extrabold text-zinc-900">
                          {formatCurrency(item.displayProportionalSalary)}
                        </div>
                        <div className="text-[10px] font-bold text-zinc-500 mt-0.5">
                          {item.workedDays}/30 dias {item.isSplit ? `(50% de ${formatCurrency(item.proportionalSalary)})` : item.workedDays < 30 ? `(Base: ${formatCurrency(item.employee.baseSalary)})` : ''}
                        </div>
                        {item.note && (
                          <span className="inline-block mt-1 text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                            {item.note}
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-4.5">
                        {item.displayAbsencesDiscount > 0 ? (
                          <div className="text-red-600">
                            <span className="font-bold">-{formatCurrency(item.displayAbsencesDiscount)}</span>
                            <span className="text-[10px] block text-red-500 font-bold font-mono">({item.absencesCount} {item.absencesCount === 1 ? 'falta' : 'faltas'})</span>
                          </div>
                        ) : (
                          <span className="text-zinc-400 font-bold">-</span>
                        )}
                      </td>

                      <td className="px-6 py-4.5">
                        {item.displayAdvances > 0 ? (
                          <span className="text-amber-600 font-bold">
                            -{formatCurrency(item.displayAdvances)}
                          </span>
                        ) : (
                          <span className="text-zinc-400 font-bold">-</span>
                        )}
                      </td>

                      <td className="px-6 py-4.5">
                        <span className={`text-sm font-extrabold ${item.displayNetSalary > 0 ? 'text-emerald-700' : 'text-zinc-400'}`}>
                          {formatCurrency(item.displayNetSalary)}
                        </span>
                        {item.isSplit && (
                          <span className="block text-[9px] font-bold text-purple-600">
                            (Total Pix: {formatCurrency(item.netSalary)})
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-4.5 text-center">
                        <button
                          onClick={() => handleCopySingle(item, 'flash')}
                          disabled={item.netSalary === 0}
                          className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border shadow-sm ${
                            copiedId === `${item.employee.id}_flash`
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50 active:scale-95 disabled:opacity-40'
                          }`}
                          title="Copiar dados formatados do funcionário"
                        >
                          {copiedId === `${item.employee.id}_flash` ? (
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
          <div className="p-6 border-b border-zinc-100 bg-zinc-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-zinc-900 text-base flex items-center gap-2">
                <span className="text-amber-500">🚀</span> Folha de Fechamento - Time Rapidão
              </h3>
              <p className="text-xs font-semibold text-zinc-500 mt-0.5">
                Visualize e copie as informações dos funcionários mensalistas do Time Rapidão.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => handleCopyTeam('rapidao')}
                disabled={rapidaoSalaries.filter(s => s.employee.active && s.displayNetSalary > 0).length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-sm transition-all active:scale-95 disabled:opacity-50"
                title="Copiar fechamento do Time Rapidão"
              >
                {rapidaoCopied ? (
                  <>
                    <Check size={14} />
                    <span>Rapidão Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    <span>Copiar Fechamento Rapidão</span>
                  </>
                )}
              </button>

              <span className="text-xs font-extrabold text-amber-700 bg-amber-50 border border-amber-100 px-3 py-1.5 rounded-xl">
                Custo Time Rapidão: {formatCurrency(rapidaoTotals.totalNetSalary)}
              </span>
              <span className="text-xs font-bold text-zinc-400 bg-zinc-100 px-3 py-1.5 rounded-xl">
                {rapidaoSalaries.length} func.
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50/30 border-b border-zinc-100 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  <th className="px-6 py-4">Nome do Funcionário</th>
                  <th className="px-6 py-4">CPF / Documento</th>
                  <th className="px-6 py-4">Salário (Proporcional)</th>
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
                        <div className="font-bold text-zinc-900 flex items-center gap-1.5 flex-wrap">
                          <span>{item.employee.name}</span>
                          {!item.employee.active && (
                            <span className="text-[8px] uppercase tracking-wider bg-zinc-100 text-zinc-400 px-1.5 py-0.5 rounded font-bold border border-zinc-200">
                              Inativo
                            </span>
                          )}
                          {item.isSplit && (
                            <span className="text-[8px] uppercase tracking-wider bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded font-bold border border-purple-200">
                              ⚡🚀 Rateio 50/50
                            </span>
                          )}
                        </div>
                        {(item.employee.role || item.employee.level) && (
                          <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-bold text-amber-700 mt-0.5">
                            {item.employee.role && <span>{item.employee.role}</span>}
                            {item.employee.role && item.employee.level && <span className="text-zinc-300">•</span>}
                            {item.employee.level && (
                              <span className="bg-amber-50 border border-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[9px] uppercase font-extrabold">
                                {item.employee.level}
                              </span>
                            )}
                          </div>
                        )}
                        <div className="text-[10px] text-zinc-400 mt-0.5 font-bold">Celular: {item.employee.phoneNumber || 'Não informado'}</div>
                        {item.employee.admissionDate && (
                          <div className="text-[10px] text-zinc-500 font-medium">
                            Admissão: {formatBRDate(item.employee.admissionDate)}
                          </div>
                        )}
                      </td>

                      <td className="px-6 py-4.5 font-mono text-zinc-500 font-semibold">
                        {item.employee.document}
                      </td>

                      <td className="px-6 py-4.5">
                        <div className="font-extrabold text-zinc-900">
                          {formatCurrency(item.displayProportionalSalary)}
                        </div>
                        <div className="text-[10px] font-bold text-zinc-500 mt-0.5">
                          {item.workedDays}/30 dias {item.isSplit ? `(50% de ${formatCurrency(item.proportionalSalary)})` : item.workedDays < 30 ? `(Base: ${formatCurrency(item.employee.baseSalary)})` : ''}
                        </div>
                        {item.note && (
                          <span className="inline-block mt-1 text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                            {item.note}
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-4.5">
                        {item.displayAbsencesDiscount > 0 ? (
                          <div className="text-red-600">
                            <span className="font-bold">-{formatCurrency(item.displayAbsencesDiscount)}</span>
                            <span className="text-[10px] block text-red-500 font-bold font-mono">({item.absencesCount} {item.absencesCount === 1 ? 'falta' : 'faltas'})</span>
                          </div>
                        ) : (
                          <span className="text-zinc-400 font-bold">-</span>
                        )}
                      </td>

                      <td className="px-6 py-4.5">
                        {item.displayAdvances > 0 ? (
                          <span className="text-amber-600 font-bold">
                            -{formatCurrency(item.displayAdvances)}
                          </span>
                        ) : (
                          <span className="text-zinc-400 font-bold">-</span>
                        )}
                      </td>

                      <td className="px-6 py-4.5">
                        <span className={`text-sm font-extrabold ${item.displayNetSalary > 0 ? 'text-emerald-700' : 'text-zinc-400'}`}>
                          {formatCurrency(item.displayNetSalary)}
                        </span>
                        {item.isSplit && (
                          <span className="block text-[9px] font-bold text-purple-600">
                            (Total Pix: {formatCurrency(item.netSalary)})
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-4.5 text-center">
                        <button
                          onClick={() => handleCopySingle(item, 'rapidao')}
                          disabled={item.netSalary === 0}
                          className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border shadow-sm ${
                            copiedId === `${item.employee.id}_rapidao`
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50 active:scale-95 disabled:opacity-40'
                          }`}
                          title="Copiar dados formatados do funcionário"
                        >
                          {copiedId === `${item.employee.id}_rapidao` ? (
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
