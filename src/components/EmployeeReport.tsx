import React, { useState, useMemo } from 'react';
import { Copy, Check, Calendar, Coins, UserCheck, AlertTriangle, Search, CheckCircle, FileSpreadsheet, Edit, Trash2, ArrowRightLeft, Users } from 'lucide-react';
import { Employee, EmployeeAbsence, EmployeeAdvance, Team, DEFAULT_TEAMS } from '../types';
import { getTeamDisplay, getTeamColorStyle } from '../lib/teams';
import { exportEmployeeClosingToExcel } from '../lib/excelExport';

interface EmployeeReportProps {
  employees: Employee[];
  allAbsences: EmployeeAbsence[];
  allAdvances: EmployeeAdvance[];
  readOnly?: boolean;
  onEditEmployee?: (employee: Employee) => void;
  onDeleteEmployee?: (employee: Employee) => void;
  onTransferEmployee?: (employee: Employee) => void;
  teams?: Team[];
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

  if (emp.admissionDate) {
    const adm = parseDateParts(emp.admissionDate);
    if (adm) {
      if (adm.year > selectedYear || (adm.year === selectedYear && adm.month > selectedMonth)) {
        return { workedDays: 0, note: 'Não admitido no período' };
      }
      if (adm.year === selectedYear && adm.month === selectedMonth) {
        startDay = Math.min(adm.day, 30);
        note = `Admissão: ${formatBRDate(emp.admissionDate)}`;
      }
    }
  }

  if (emp.dismissalDate) {
    const dis = parseDateParts(emp.dismissalDate);
    if (dis) {
      if (dis.year < selectedYear || (dis.year === selectedYear && dis.month < selectedMonth)) {
        return { workedDays: 0, note: 'Demitido antes do período' };
      }
      if (dis.year === selectedYear && dis.month === selectedMonth) {
        endDay = Math.min(dis.day, 30);
        note = note ? `${note} | Demissão: ${formatBRDate(emp.dismissalDate)}` : `Demissão: ${formatBRDate(emp.dismissalDate)}`;
      }
    }
  }

  if (startDay > endDay) {
    return { workedDays: 0, note: note || 'Período inválido' };
  }

  const workedDays = Math.max(0, Math.min(30, endDay - startDay + 1));
  return { workedDays, note };
};

export function EmployeeReport({
  employees,
  allAbsences,
  allAdvances,
  readOnly,
  onEditEmployee,
  onDeleteEmployee,
  onTransferEmployee,
  teams = DEFAULT_TEAMS,
}: EmployeeReportProps) {
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();

  const prevMonthDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
  const prevMonthValue = prevMonthDate.getMonth() + 1;
  const prevYearValue = prevMonthDate.getFullYear();

  const [selectedMonth, setSelectedMonth] = useState<number>(prevMonthValue);
  const [selectedYear, setSelectedYear] = useState<number>(prevYearValue);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedTeamId, setCopiedTeamId] = useState<string | null>(null);
  const [bulkCopied, setBulkCopied] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string>('all');

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

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  // Calculate Salaries for each employee for the chosen month/year
  const employeeSalaries = useMemo(() => {
    return employees.map(emp => {
      const { workedDays, note } = calculateWorkedDays(emp, selectedYear, selectedMonth);

      const dailyRate = emp.baseSalary / 30;
      const proportionalSalary = (emp.baseSalary / 30) * workedDays;

      // Filter Absences in selected month
      const empAbsences = allAbsences.filter(abs => {
        if (abs.employeeId !== emp.id) return false;
        const parts = parseDateParts(abs.date);
        if (!parts) return false;
        return parts.month === selectedMonth && parts.year === selectedYear;
      });

      const absencesDiscountSum = empAbsences.reduce((sum, abs) => {
        return sum + (abs.discount !== undefined ? abs.discount : dailyRate);
      }, 0);

      // Filter Advances in selected month
      const empAdvances = allAdvances.filter(adv => {
        if (adv.employeeId !== emp.id) return false;
        const parts = parseDateParts(adv.date);
        if (!parts) return false;
        return parts.month === selectedMonth && parts.year === selectedYear;
      });

      const totalAdvances = empAdvances.reduce((sum, adv) => sum + (adv.amount || 0), 0);
      const netSalary = Math.max(0, proportionalSalary - absencesDiscountSum - totalAdvances);

      return {
        employee: emp,
        workedDays,
        note,
        proportionalSalary,
        dailyRate,
        absencesCount: empAbsences.length,
        totalAbsencesDiscount: absencesDiscountSum,
        advancesCount: empAdvances.length,
        totalAdvances,
        netSalary,
        absences: empAbsences,
        advances: empAdvances
      };
    });
  }, [employees, allAbsences, allAdvances, selectedMonth, selectedYear]);

  // Filtered by search query
  const filteredSalaries = useMemo(() => {
    return employeeSalaries.filter(item => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      const nameMatch = item.employee.name.toLowerCase().includes(q);
      const docMatch = item.employee.document.toLowerCase().includes(q);
      return nameMatch || docMatch;
    });
  }, [employeeSalaries, searchQuery]);

  // Overall financial sums across all active employees
  const reportTotals = useMemo(() => {
    return filteredSalaries.reduce((totals, item) => {
      if (!item.employee.active) return totals;
      return {
        totalBaseSalaries: totals.totalBaseSalaries + item.proportionalSalary,
        totalAbsencesDiscount: totals.totalAbsencesDiscount + item.totalAbsencesDiscount,
        totalAdvances: totals.totalAdvances + item.totalAdvances,
        totalNetSalary: totals.totalNetSalary + item.netSalary
      };
    }, { totalBaseSalaries: 0, totalAbsencesDiscount: 0, totalAdvances: 0, totalNetSalary: 0 });
  }, [filteredSalaries]);

  // Dynamic Map of Salaries per Team
  const teamSalariesMap = useMemo(() => {
    const map: Record<string, {
      team: Team;
      salaries: (typeof employeeSalaries[0] & {
        isSplit: boolean;
        displayProportionalSalary: number;
        displayAbsencesDiscount: number;
        displayAdvances: number;
        displayNetSalary: number;
      })[];
      totals: {
        totalBaseSalaries: number;
        totalAbsencesDiscount: number;
        totalAdvances: number;
        totalNetSalary: number;
      };
    }> = {};

    teams.forEach(t => {
      const list = filteredSalaries
        .filter(item => {
          if (t.id === 'flash') {
            return !item.employee.team || item.employee.team === 'flash' || item.employee.team === 'both';
          }
          if (t.id === 'rapidao') {
            return item.employee.team === 'rapidao' || item.employee.team === 'both';
          }
          return item.employee.team === t.id;
        })
        .map(item => {
          const isSplit = item.employee.team === 'both' && (t.id === 'flash' || t.id === 'rapidao');
          return {
            ...item,
            isSplit,
            displayProportionalSalary: isSplit ? item.proportionalSalary / 2 : item.proportionalSalary,
            displayAbsencesDiscount: isSplit ? item.totalAbsencesDiscount / 2 : item.totalAbsencesDiscount,
            displayAdvances: isSplit ? item.totalAdvances / 2 : item.totalAdvances,
            displayNetSalary: isSplit ? item.netSalary / 2 : item.netSalary,
          };
        });

      const totals = list.reduce((tot, item) => {
        if (!item.employee.active) return tot;
        return {
          totalBaseSalaries: tot.totalBaseSalaries + item.displayProportionalSalary,
          totalAbsencesDiscount: tot.totalAbsencesDiscount + item.displayAbsencesDiscount,
          totalAdvances: tot.totalAdvances + item.displayAdvances,
          totalNetSalary: tot.totalNetSalary + item.displayNetSalary
        };
      }, { totalBaseSalaries: 0, totalAbsencesDiscount: 0, totalAdvances: 0, totalNetSalary: 0 });

      map[t.id] = { team: t, salaries: list, totals };
    });

    return map;
  }, [filteredSalaries, teams]);

  // Helper to format Pix key type
  const formatPixKeyType = (type?: string) => {
    if (!type) return 'Não informado';
    const t = type.trim().toLowerCase();
    if (t === 'phone' || t === 'telefone' || t === 'celular') return 'Telefone';
    if (t === 'random' || t === 'aleatoria' || t === 'aleatória' || t === 'evp') return 'Aleatória';
    if (t === 'email' || t === 'e-mail') return 'E-mail';
    if (t === 'cpf') return 'CPF';
    if (t === 'cnpj') return 'CNPJ';
    return type;
  };

  // Format payment data for copying: Nome, CPF, Tipo de chave, Chave Pix e Valor a Receber
  const getPaymentText = (item: typeof employeeSalaries[0], teamId?: string) => {
    const isSplit = item.employee.team === 'both' && (teamId === 'flash' || teamId === 'rapidao');
    const netToPay = isSplit ? item.netSalary / 2 : item.netSalary;

    return [
      `Nome: ${item.employee.name}`,
      `CPF: ${item.employee.document || 'Não informado'}`,
      `Tipo de Chave: ${formatPixKeyType(item.employee.pixKeyType)}`,
      `Chave Pix: ${item.employee.pixKey || 'Não informada'}`,
      `Valor a Receber: ${formatCurrency(netToPay)}`
    ].join('\n');
  };

  const handleCopySingle = (item: typeof employeeSalaries[0], teamId?: string) => {
    const text = getPaymentText(item, teamId);
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(`${item.employee.id}_${teamId || 'all'}`);
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

  const handleCopyTeam = (teamId: string) => {
    const entry = teamSalariesMap[teamId];
    if (!entry) return;

    const targetSalaries = entry.salaries;
    const activeSalaries = targetSalaries.filter(s => s.employee.active && s.displayNetSalary > 0);
    if (activeSalaries.length === 0) return;

    const monthLabel = months.find(m => m.value === selectedMonth)?.label;
    const teamTitle = entry.team.name.toUpperCase();
    const teamTotalNet = entry.totals.totalNetSalary;

    const textHeader = `FECHAMENTO - ${teamTitle} (${monthLabel}/${selectedYear})\n--------------------\n`;
    const textBody = activeSalaries.map(item => getPaymentText(item, teamId)).join('\n\n');
    const textFooter = `\n--------------------\nTOTAL DA EQUIPE: ${formatCurrency(teamTotalNet)}`;

    navigator.clipboard.writeText(textHeader + textBody + textFooter).then(() => {
      setCopiedTeamId(teamId);
      setTimeout(() => setCopiedTeamId(null), 2000);
    });
  };

  const handleExportExcel = (teamId?: string) => {
    const monthLabel = months.find(m => m.value === selectedMonth)?.label || `Mês ${selectedMonth}`;
    if (teamId) {
      const entry = teamSalariesMap[teamId];
      if (!entry) return;
      exportEmployeeClosingToExcel({
        monthName: monthLabel,
        monthNumber: selectedMonth,
        year: selectedYear,
        items: entry.salaries,
        teams,
        teamName: entry.team.name,
      });
    } else {
      exportEmployeeClosingToExcel({
        monthName: monthLabel,
        monthNumber: selectedMonth,
        year: selectedYear,
        items: filteredSalaries,
        teams,
        teamName: 'Geral',
      });
    }
  };

  // Filtered list of teams to display
  const displayedTeams = useMemo(() => {
    if (selectedTeamFilter === 'all') return teams;
    return teams.filter(t => t.id === selectedTeamFilter);
  }, [teams, selectedTeamFilter]);

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
          {teams.map(t => {
            const entry = teamSalariesMap[t.id];
            const hasActive = entry && entry.salaries.some(s => s.employee.active && s.displayNetSalary > 0);
            const isCopied = copiedTeamId === t.id;
            const tStyle = getTeamColorStyle(t.color);

            return (
              <button
                key={t.id}
                onClick={() => handleCopyTeam(t.id)}
                disabled={!hasActive}
                className={`flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50 ${
                  t.id === 'flash' 
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700' 
                    : t.id === 'rapidao' 
                    ? 'bg-amber-600 text-white hover:bg-amber-700' 
                    : `${tStyle.badge} hover:opacity-90`
                }`}
                title={`Copiar folha de fechamento de ${t.name}`}
              >
                {isCopied ? <CheckCircle size={15} /> : <Copy size={15} />}
                <span>{isCopied ? `${t.name} Copiado!` : `${t.icon || '👥'} Copiar ${t.name}`}</span>
              </button>
            );
          })}

          <button
            onClick={handleCopyBulk}
            disabled={filteredSalaries.filter(s => s.employee.active && s.netSalary > 0).length === 0}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-zinc-800 px-4 py-2.5 text-xs font-bold text-white hover:bg-zinc-900 transition-all shadow-sm active:scale-95 disabled:opacity-50"
            title="Copiar folha de fechamento de todos os funcionários"
          >
            {bulkCopied ? <CheckCircle size={15} /> : <Copy size={15} />}
            <span>{bulkCopied ? 'Geral Copiado!' : '📋 Copiar Geral'}</span>
          </button>

          <button
            onClick={() => handleExportExcel()}
            disabled={filteredSalaries.length === 0}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white transition-all shadow-sm active:scale-95 disabled:opacity-50"
            title="Exportar Fechamento Geral para Planilha Excel (.xlsx)"
          >
            <FileSpreadsheet size={15} />
            <span>Exportar Excel (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* Team Filter Tab selector */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 shrink-0">
          Visualizar:
        </span>
        <button
          type="button"
          onClick={() => setSelectedTeamFilter('all')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
            selectedTeamFilter === 'all'
              ? 'bg-zinc-900 text-white shadow-xs'
              : 'bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-50'
          }`}
        >
          Todas as Equipes
        </button>

        {teams.map(t => {
          const isSel = selectedTeamFilter === t.id;
          const entry = teamSalariesMap[t.id];
          const count = entry?.salaries?.length || 0;

          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedTeamFilter(t.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                isSel
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-50'
              }`}
            >
              <span>{t.icon || '👥'}</span>
              <span>{t.name}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${isSel ? 'bg-white/20 text-white' : 'bg-zinc-100 text-zinc-500'}`}>
                {count}
              </span>
            </button>
          );
        })}
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

      {/* Main Closing Sheets - Separated by Team Dynamically */}
      <div className="space-y-8">
        {displayedTeams.map(team => {
          const entry = teamSalariesMap[team.id];
          const salaries = entry ? entry.salaries : [];
          const totals = entry ? entry.totals : { totalBaseSalaries: 0, totalAbsencesDiscount: 0, totalAdvances: 0, totalNetSalary: 0 };
          const tStyle = getTeamColorStyle(team.color);
          const isCopied = copiedTeamId === team.id;

          return (
            <div key={team.id} className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
              {/* Header */}
              <div className="p-6 border-b border-zinc-100 bg-zinc-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-zinc-900 text-base flex items-center gap-2">
                    <span>{team.icon || '👥'}</span> Folha de Fechamento - {team.name}
                  </h3>
                  <p className="text-xs font-semibold text-zinc-500 mt-0.5">
                    Visualize e copie as informações dos funcionários mensalistas de {team.name}.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => handleCopyTeam(team.id)}
                    disabled={salaries.filter(s => s.employee.active && s.displayNetSalary > 0).length === 0}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white font-bold text-xs shadow-sm transition-all active:scale-95 disabled:opacity-50 ${
                      team.id === 'flash'
                        ? 'bg-indigo-600 hover:bg-indigo-700'
                        : team.id === 'rapidao'
                        ? 'bg-amber-600 hover:bg-amber-700'
                        : `${tStyle.badge} hover:opacity-90`
                    }`}
                    title={`Copiar fechamento de ${team.name}`}
                  >
                    {isCopied ? (
                      <>
                        <Check size={14} />
                        <span>{team.name} Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={14} />
                        <span>Copiar Fechamento {team.name}</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => handleExportExcel(team.id)}
                    disabled={salaries.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-all active:scale-95 disabled:opacity-50"
                    title={`Exportar Fechamento de ${team.name} para Excel (.xlsx)`}
                  >
                    <FileSpreadsheet size={14} />
                    <span>Excel {team.name}</span>
                  </button>

                  <span className={`text-xs font-extrabold ${tStyle.text} ${tStyle.bg} border ${tStyle.border} px-3 py-1.5 rounded-xl`}>
                    Custo {team.name}: {formatCurrency(totals.totalNetSalary)}
                  </span>
                  <span className="text-xs font-bold text-zinc-400 bg-zinc-100 px-3 py-1.5 rounded-xl">
                    {salaries.length} func.
                  </span>
                </div>
              </div>

              {/* Table */}
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
                      <th className="px-6 py-4 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 text-xs font-medium text-zinc-600">
                    {salaries.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-12 text-zinc-400 font-bold bg-zinc-50/20">
                          Nenhum funcionário encontrado em {team.name}.
                        </td>
                      </tr>
                    ) : (
                      salaries.map(item => (
                        <tr key={item.employee.id} className={`hover:bg-zinc-50/40 transition-colors ${!item.employee.active ? 'opacity-55 bg-zinc-50/10' : ''}`}>
                          <td className="px-6 py-4.5">
                            <div className="font-bold text-zinc-900 flex items-center gap-1.5 flex-wrap">
                              {onEditEmployee ? (
                                <button
                                  type="button"
                                  onClick={() => onEditEmployee(item.employee)}
                                  className="hover:text-indigo-600 transition-colors flex items-center gap-1.5 text-left font-bold"
                                  title="Clique para editar este funcionário"
                                >
                                  <span>{item.employee.name}</span>
                                  <Edit size={12} className="text-zinc-400 hover:text-indigo-600 shrink-0" />
                                </button>
                              ) : (
                                <span>{item.employee.name}</span>
                              )}
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
                              <div className="text-xs font-semibold text-zinc-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                                {item.employee.role && <span>{item.employee.role}</span>}
                                {item.employee.role && item.employee.level && <span className="text-zinc-300">•</span>}
                                {item.employee.level && (
                                  <span className="bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold">
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
                              onClick={() => handleCopySingle(item, team.id)}
                              disabled={!item.employee.pixKey && !item.employee.document}
                              className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border shadow-sm ${
                                copiedId === `${item.employee.id}_${team.id}`
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50 active:scale-95 disabled:opacity-40'
                              }`}
                              title="Copiar Nome, CPF, Tipo de Chave, Chave Pix e Valor a Receber"
                            >
                              {copiedId === `${item.employee.id}_${team.id}` ? (
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

                          <td className="px-6 py-4.5 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {onTransferEmployee && !readOnly && (
                                <button
                                  type="button"
                                  onClick={() => onTransferEmployee(item.employee)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 active:scale-95 rounded-xl transition-all border border-amber-200 shadow-xs"
                                  title="Transferir Funcionário para outra Equipe"
                                >
                                  <ArrowRightLeft size={13} />
                                  <span>Transferir</span>
                                </button>
                              )}
                              {onEditEmployee && (
                                <button
                                  type="button"
                                  onClick={() => onEditEmployee(item.employee)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 active:scale-95 rounded-xl transition-all border border-indigo-100"
                                  title="Editar Funcionário e Salário"
                                >
                                  <Edit size={13} />
                                  <span>Editar</span>
                                </button>
                              )}
                              {!readOnly && onDeleteEmployee && (
                                <button
                                  type="button"
                                  onClick={() => onDeleteEmployee(item.employee)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 active:scale-95 rounded-xl transition-all border border-red-100"
                                  title="Excluir Funcionário"
                                >
                                  <Trash2 size={13} />
                                  <span>Excluir</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}
