/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Copy, CheckCircle2, LayoutDashboard, Clock, Wallet, DollarSign, Calendar } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { Promoter, Advance } from '../types';
import { formatCurrency } from '../lib/utils';

interface PaymentReportProps {
  promoters: Promoter[];
}

export default function PaymentReport({ promoters }: PaymentReportProps) {
  const [advancesMap, setAdvancesMap] = useState<Record<string, Advance[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [reportType, setReportType] = useState<'weekly' | 'monthly'>('weekly');
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribes: (() => void)[] = [];
    
    promoters.forEach(promoter => {
      const q = query(
        collection(db, `promoters/${promoter.id}/advances`),
        orderBy('date', 'desc')
      );

      const unsubAdvances = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Advance));
        setAdvancesMap(prev => ({ ...prev, [promoter.id]: data }));
        setLoading(false);
      }, (error) => {
        console.error(`Error loading advances for ${promoter.id}:`, error);
        setLoading(false);
      });
      unsubscribes.push(unsubAdvances);
    });

    return () => unsubscribes.forEach(unsub => unsub());
  }, [promoters]);

  const getTotalPaid = (promoterId: string) => {
    return (advancesMap[promoterId] || [])
      .filter(a => a.status === 'paid')
      .reduce((sum, a) => sum + a.amount, 0);
  };

  const formatMonthName = (monthKey: string) => {
    const [year, month] = monthKey.split('-');
    const dateObj = new Date(parseInt(year), parseInt(month) - 1, 15);
    const name = dateObj.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  const totalsSummary = React.useMemo(() => {
    const allAdvances = Object.values(advancesMap).flat() as Advance[];
    const paidAdvances = allAdvances.filter(a => a.status === 'paid');
    
    const totalPaid = paidAdvances.reduce((acc, a) => acc + a.amount, 0);
    
    const now = new Date();
    
    // Hoje
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const todayTotal = paidAdvances
      .filter(a => new Date(a.date + 'T12:00:00') >= startOfToday)
      .reduce((acc, a) => acc + a.amount, 0);

    // Esta Semana (desde domingo)
    const currentWeekStart = new Date(now);
    currentWeekStart.setDate(now.getDate() - now.getDay());
    currentWeekStart.setHours(0, 0, 0, 0);
    
    const weekTotal = paidAdvances
      .filter(a => new Date(a.date + 'T12:00:00') >= currentWeekStart)
      .reduce((acc, a) => acc + a.amount, 0);

    // Semana Passada (domingo anterior até sábado)
    const lastWeekStart = new Date(currentWeekStart);
    lastWeekStart.setDate(currentWeekStart.getDate() - 7);
    const lastWeekEnd = new Date(currentWeekStart);
    lastWeekEnd.setMilliseconds(-1);

    const lastWeekTotal = paidAdvances
      .filter(a => {
        const d = new Date(a.date + 'T12:00:00');
        return d >= lastWeekStart && d <= lastWeekEnd;
      })
      .reduce((acc, a) => acc + a.amount, 0);

    // Group by week with details
    interface PaymentDetail {
      promoterName: string;
      amount: number;
      date: string;
      notes?: string;
      document?: string;
    }

    const weeklyMap: Record<string, { total: number; payments: PaymentDetail[] }> = {};
    const monthlyMap: Record<string, { total: number; payments: PaymentDetail[] }> = {};

    paidAdvances.forEach(adv => {
      const d = new Date(adv.date + 'T12:00:00');
      
      // Weekly grouping
      const day = d.getDay();
      const diff = d.getDate() - day;
      const weekStartObj = new Date(d);
      weekStartObj.setDate(diff);
      const weekStart = weekStartObj.toISOString().split('T')[0];
      
      // Monthly grouping
      const [year, month] = adv.date.split('-');
      const monthKey = `${year}-${month}`;
      
      const promoter = promoters.find(p => p.id === adv.promoterId);
      
      const paymentDetail: PaymentDetail = {
        promoterName: adv.promoterName || promoter?.name || '---',
        amount: adv.amount,
        date: adv.date,
        notes: adv.notes,
        document: promoter?.document
      };

      // Populate weekly
      if (!weeklyMap[weekStart]) {
        weeklyMap[weekStart] = { total: 0, payments: [] };
      }
      weeklyMap[weekStart].total += adv.amount;
      weeklyMap[weekStart].payments.push(paymentDetail);

      // Populate monthly
      if (!monthlyMap[monthKey]) {
        monthlyMap[monthKey] = { total: 0, payments: [] };
      }
      monthlyMap[monthKey].total += adv.amount;
      monthlyMap[monthKey].payments.push(paymentDetail);
    });

    const weeklyTotals = Object.entries(weeklyMap)
      .map(([week, data]) => ({ 
        week, 
        total: data.total, 
        payments: data.payments.sort((a, b) => b.date.localeCompare(a.date))
      }))
      .sort((a, b) => b.week.localeCompare(a.week));

    const monthlyTotals = Object.entries(monthlyMap)
      .map(([monthKey, data]) => ({ 
        monthKey, 
        total: data.total, 
        payments: data.payments.sort((a, b) => b.date.localeCompare(a.date))
      }))
      .sort((a, b) => b.monthKey.localeCompare(a.monthKey));

    return { totalPaid, todayTotal, weekTotal, lastWeekTotal, weeklyTotals, monthlyTotals };
  }, [advancesMap, promoters]);

  // Select first week automatically when list is available
  useEffect(() => {
    if (totalsSummary.weeklyTotals.length > 0 && !selectedWeek) {
      setSelectedWeek(totalsSummary.weeklyTotals[0].week);
    }
  }, [totalsSummary.weeklyTotals, selectedWeek]);

  // Select first month automatically when list is available
  useEffect(() => {
    if (totalsSummary.monthlyTotals.length > 0 && !selectedMonth) {
      setSelectedMonth(totalsSummary.monthlyTotals[0].monthKey);
    }
  }, [totalsSummary.monthlyTotals, selectedMonth]);

  const copyWeeklyReport = (weekKey: string, total: number, payments: any[]) => {
    const dateStr = new Date(weekKey + 'T12:00:00').toLocaleDateString('pt-BR');
    const reportText = payments
      .map(p => `• ${p.promoterName} (CPF: ${p.document || 'N/A'}): ${formatCurrency(p.amount)} em ${new Date(p.date + 'T12:00:00').toLocaleDateString('pt-BR')}${p.notes ? ` - ${p.notes}` : ''}`)
      .join('\n');
    
    const text = `RELATÓRIO DE PAGAMENTOS (Semana de ${dateStr}):\n\n${reportText}\n\nTOTAL PAGO NA SEMANA: ${formatCurrency(total)}`;
    navigator.clipboard.writeText(text);
    alert(`Relatório da semana de ${dateStr} copiado para a área de transferência!`);
  };

  const copyMonthlyReport = (monthKey: string, total: number, payments: any[]) => {
    const monthStr = formatMonthName(monthKey);
    const reportText = payments
      .map(p => `• ${p.promoterName} (CPF: ${p.document || 'N/A'}): ${formatCurrency(p.amount)} em ${new Date(p.date + 'T12:00:00').toLocaleDateString('pt-BR')}${p.notes ? ` - ${p.notes}` : ''}`)
      .join('\n');
    
    const text = `RELATÓRIO DE PAGAMENTOS MENSAL (${monthStr}):\n\n${reportText}\n\nTOTAL PAGO NO MÊS: ${formatCurrency(total)}`;
    navigator.clipboard.writeText(text);
    alert(`Relatório do mês de ${monthStr} copiado para a área de transferência!`);
  };

  return (
    <div className="space-y-6 pb-20">
      {/* 1. Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Hoje', value: totalsSummary.todayTotal, icon: <DollarSign size={20} />, color: 'text-brand-lime', bg: 'bg-brand-dark' },
          { label: 'Esta Semana', value: totalsSummary.weekTotal, icon: <Wallet size={20} />, color: 'text-indigo-600', bg: 'bg-white border-zinc-200' },
          { label: 'Semana Passada', value: totalsSummary.lastWeekTotal, icon: <Clock size={20} />, color: 'text-amber-600', bg: 'bg-white border-zinc-200' },
          { label: 'Total Geral', value: totalsSummary.totalPaid, icon: <LayoutDashboard size={20} />, color: 'text-brand-dark', bg: 'bg-zinc-100 border-zinc-200' },
        ].map((stat, i) => (
          <div key={i} className={`p-4 rounded-2xl border shadow-sm ${stat.bg}`}>
            <div className="flex items-center gap-2 mb-2">
              <div className={stat.color}>{stat.icon}</div>
              <span className={`text-[10px] font-bold uppercase tracking-widest ${stat.bg.includes('brand-dark') ? 'text-zinc-400' : 'text-zinc-500'}`}>{stat.label}</span>
            </div>
            <div className={`text-lg font-black tabular-nums ${stat.bg.includes('brand-dark') ? 'text-brand-lime' : 'text-zinc-900'}`}>
              {formatCurrency(stat.value)}
            </div>
          </div>
        ))}
      </div>

      {/* Tab Switcher */}
      <div className="flex bg-zinc-100 p-1.5 rounded-2xl w-fit border border-zinc-200 shadow-inner">
        <button
          onClick={() => setReportType('weekly')}
          className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 ${
            reportType === 'weekly'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-zinc-500 hover:text-zinc-900'
          }`}
        >
          <Clock size={14} /> Relatório Semanal
        </button>
        <button
          onClick={() => setReportType('monthly')}
          className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 ${
            reportType === 'monthly'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-zinc-500 hover:text-zinc-900'
          }`}
        >
          <Calendar size={14} /> Relatório Mensal
        </button>
      </div>

      {/* 2. Weekly or Monthly Totals Section */}
      {reportType === 'weekly' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="bg-indigo-50 p-2 rounded-lg text-indigo-600">
                <Clock size={20} />
              </div>
              <div>
                <h3 className="font-bold text-zinc-900 text-sm">Resumo por Semana</h3>
                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Selecione uma semana para ver os detalhes dos quitados</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {totalsSummary.weeklyTotals.map(({ week, total, payments }) => {
              const isSelected = selectedWeek === week;
              return (
                <button
                  key={week}
                  onClick={() => setSelectedWeek(week)}
                  className={`text-left bg-white p-4 rounded-2xl border transition-all duration-200 group relative cursor-pointer outline-none ${
                    isSelected 
                      ? 'border-indigo-600 ring-4 ring-indigo-500/10' 
                      : 'border-zinc-100 hover:border-indigo-200'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${
                      isSelected ? 'bg-indigo-50 text-indigo-700' : 'bg-zinc-50 text-zinc-400'
                    }`}>
                      Semana de {new Date(week + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </span>
                    <div className={`h-2.5 w-2.5 rounded-full transition-all duration-200 ${
                      isSelected ? 'bg-indigo-600 scale-110 shadow' : 'bg-indigo-400 opacity-0 group-hover:opacity-100'
                    }`} />
                  </div>
                  <div className="text-xl font-black text-zinc-900 tabular-nums">
                    {formatCurrency(total)}
                  </div>
                  <div className="text-[10px] text-zinc-400 font-bold mt-1 uppercase tracking-wider">
                    {payments.length} {payments.length === 1 ? 'pagamento' : 'pagamentos'}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detalhes da Semana Selecionada */}
          {selectedWeek && (
            (() => {
              const selectedData = totalsSummary.weeklyTotals.find(w => w.week === selectedWeek);
              if (!selectedData) return null;
              return (
                <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm overflow-hidden mt-4">
                  <div className="bg-indigo-50/50 px-6 py-4 border-b border-indigo-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Calendar className="text-indigo-600" size={18} />
                      <div>
                        <h4 className="font-bold text-zinc-900 text-sm">
                          Pagamentos na Semana de {new Date(selectedWeek + 'T12:00:00').toLocaleDateString('pt-BR')}
                        </h4>
                        <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                          Total pago nesta semana: <span className="text-indigo-600 font-black">{formatCurrency(selectedData.total)}</span>
                        </p>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => copyWeeklyReport(selectedWeek, selectedData.total, selectedData.payments)}
                      className="self-start sm:self-auto bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50 px-3.5 py-1.5 rounded-xl font-bold text-[11px] uppercase tracking-wider transition-all flex items-center gap-2 shadow-sm"
                    >
                      <Copy size={12} /> Copiar Relatório da Semana
                    </button>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-zinc-50 text-zinc-500 text-[10px] uppercase font-bold tracking-widest border-b border-zinc-100">
                        <tr>
                          <th className="px-6 py-3">Promotor</th>
                          <th className="px-6 py-3">Data do Registro</th>
                          <th className="px-6 py-3">Observações / Motivo</th>
                          <th className="px-6 py-3 text-right">Valor Quitado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {selectedData.payments.map((p, idx) => (
                          <tr key={idx} className="hover:bg-zinc-50/30 transition-colors">
                            <td className="px-6 py-3.5">
                              <div className="font-bold text-zinc-900">{p.promoterName}</div>
                              {p.document && <div className="text-[10px] text-zinc-400">CPF: {p.document}</div>}
                            </td>
                            <td className="px-6 py-3.5 text-zinc-600 font-medium">
                              {new Date(p.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                            </td>
                            <td className="px-6 py-3.5 text-zinc-500 text-xs italic">
                              {p.notes || 'Sem observações'}
                            </td>
                            <td className="px-6 py-3.5 text-right font-bold text-zinc-900 tabular-nums">
                              {formatCurrency(p.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="bg-indigo-50 p-2 rounded-lg text-indigo-600">
                <Calendar size={20} />
              </div>
              <div>
                <h3 className="font-bold text-zinc-900 text-sm">Resumo por Mês</h3>
                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Selecione um mês para ver os detalhes dos quitados</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {totalsSummary.monthlyTotals.map(({ monthKey, total, payments }) => {
              const isSelected = selectedMonth === monthKey;
              return (
                <button
                  key={monthKey}
                  onClick={() => setSelectedMonth(monthKey)}
                  className={`text-left bg-white p-4 rounded-2xl border transition-all duration-200 group relative cursor-pointer outline-none ${
                    isSelected 
                      ? 'border-indigo-600 ring-4 ring-indigo-500/10' 
                      : 'border-zinc-100 hover:border-indigo-200'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${
                      isSelected ? 'bg-indigo-50 text-indigo-700' : 'bg-zinc-50 text-zinc-400'
                    }`}>
                      {formatMonthName(monthKey)}
                    </span>
                    <div className={`h-2.5 w-2.5 rounded-full transition-all duration-200 ${
                      isSelected ? 'bg-indigo-600 scale-110 shadow' : 'bg-indigo-400 opacity-0 group-hover:opacity-100'
                    }`} />
                  </div>
                  <div className="text-xl font-black text-zinc-900 tabular-nums">
                    {formatCurrency(total)}
                  </div>
                  <div className="text-[10px] text-zinc-400 font-bold mt-1 uppercase tracking-wider">
                    {payments.length} {payments.length === 1 ? 'pagamento' : 'pagamentos'}
                  </div>
                </button>
              );
            })}
            {totalsSummary.monthlyTotals.length === 0 && (
              <div className="col-span-full bg-white p-8 rounded-2xl border border-zinc-100 text-center text-zinc-400 font-medium">
                Nenhum pagamento registrado mensalmente ainda.
              </div>
            )}
          </div>

          {/* Detalhes do Mês Selecionado */}
          {selectedMonth && (
            (() => {
              const selectedData = totalsSummary.monthlyTotals.find(m => m.monthKey === selectedMonth);
              if (!selectedData) return null;
              return (
                <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm overflow-hidden mt-4">
                  <div className="bg-indigo-50/50 px-6 py-4 border-b border-indigo-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Calendar className="text-indigo-600" size={18} />
                      <div>
                        <h4 className="font-bold text-zinc-900 text-sm">
                          Pagamentos no Mês de {formatMonthName(selectedMonth)}
                        </h4>
                        <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                          Total pago neste mês: <span className="text-indigo-600 font-black">{formatCurrency(selectedData.total)}</span>
                        </p>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => copyMonthlyReport(selectedMonth, selectedData.total, selectedData.payments)}
                      className="self-start sm:self-auto bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50 px-3.5 py-1.5 rounded-xl font-bold text-[11px] uppercase tracking-wider transition-all flex items-center gap-2 shadow-sm"
                    >
                      <Copy size={12} /> Copiar Relatório do Mês
                    </button>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-zinc-50 text-zinc-500 text-[10px] uppercase font-bold tracking-widest border-b border-zinc-100">
                        <tr>
                          <th className="px-6 py-3">Promotor</th>
                          <th className="px-6 py-3">Data do Registro</th>
                          <th className="px-6 py-3">Observações / Motivo</th>
                          <th className="px-6 py-3 text-right">Valor Quitado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {selectedData.payments.map((p, idx) => (
                          <tr key={idx} className="hover:bg-zinc-50/30 transition-colors">
                            <td className="px-6 py-3.5">
                              <div className="font-bold text-zinc-900">{p.promoterName}</div>
                              {p.document && <div className="text-[10px] text-zinc-400">CPF: {p.document}</div>}
                            </td>
                            <td className="px-6 py-3.5 text-zinc-600 font-medium">
                              {new Date(p.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                            </td>
                            <td className="px-6 py-3.5 text-zinc-500 text-xs italic">
                              {p.notes || 'Sem observações'}
                            </td>
                            <td className="px-6 py-3.5 text-right font-bold text-zinc-900 tabular-nums">
                              {formatCurrency(p.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()
          )}
        </div>
      )}

      {/* 3. Main Table */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm">
          <div className="flex items-center gap-4">
            <h3 className="font-bold text-zinc-900">Relatório Consolidado de Pagamentos</h3>
            <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Total acumulado por promotor</div>
          </div>
          
          <button 
            onClick={() => {
              const reportText = promoters
                .map(p => `• ${p.name}: ${formatCurrency(getTotalPaid(p.id))}`)
                .join('\n');
              const total = promoters.reduce((acc, p) => acc + getTotalPaid(p.id), 0);
              navigator.clipboard.writeText(`RELATÓRIO GERAL DE PAGAMENTOS:\n\n${reportText}\n\nTOTAL GERAL: ${formatCurrency(total)}`);
              alert('Relatório consolidado copiado!');
            }}
            className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl font-bold text-xs hover:bg-indigo-100 transition-all border border-indigo-200 flex items-center gap-2"
          >
            <Copy size={14} /> Copiar Relatório Geral
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-zinc-50 text-zinc-500 text-[10px] uppercase font-bold tracking-widest border-b border-zinc-100">
                <tr>
                  <th className="px-6 py-4">Promotor</th>
                  <th className="px-6 py-4">Status Geral</th>
                  <th className="px-6 py-4 text-right">Total Já Pago</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {promoters
                  .map(p => ({ promoter: p, totalPaid: getTotalPaid(p.id) }))
                  .sort((a, b) => b.totalPaid - a.totalPaid)
                  .map(({ promoter, totalPaid }) => (
                    <tr key={promoter.id} className="hover:bg-zinc-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-zinc-900">{promoter.name}</div>
                        <div className="text-[10px] text-zinc-400 font-medium">CPF: {promoter.document}</div>
                      </td>
                      <td className="px-6 py-4">
                        {totalPaid > 0 ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-green-100 text-green-700 uppercase tracking-wider">
                            <CheckCircle2 size={10} /> Ativo em Pagamentos
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-zinc-100 text-zinc-500 uppercase tracking-wider">
                            Sem registros
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className={`font-black tabular-nums transition-all ${totalPaid > 0 ? 'text-brand-lime bg-brand-dark px-3 py-1 rounded-lg w-fit ml-auto' : 'text-zinc-300'}`}>
                          {formatCurrency(totalPaid)}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
