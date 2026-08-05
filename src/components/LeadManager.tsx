/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  Target, 
  Users, 
  TrendingUp, 
  Plus, 
  Minus, 
  Copy, 
  Check, 
  BarChart3, 
  Zap, 
  Rocket,
  Clock,
  CalendarDays
} from 'lucide-react';
import { db } from '../lib/firebase';
import { 
  collection, 
  onSnapshot, 
  setDoc, 
  doc, 
  query 
} from 'firebase/firestore';
import { Promoter, Attendance, OperationType } from '../types';
import { handleFirestoreError, formatDate } from '../lib/utils';

interface TeamLeadsRecord {
  id: string; // YYYY-MM-DD
  date: string;
  flashLeads: number;
  rapidaoLeads: number;
  updatedAt?: string;
}

interface LeadManagerProps {
  promoters: Promoter[];
  allAttendance: Attendance[];
  readOnly?: boolean;
  selectedTeam?: 'all' | 'flash' | 'rapidao';
}

export default function LeadManager({ 
  promoters, 
  allAttendance, 
  readOnly, 
  selectedTeam = 'all' 
}: LeadManagerProps) {
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const [teamLeadsMap, setTeamLeadsMap] = useState<Record<string, TeamLeadsRecord>>({});
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'daily' | 'report'>('daily');
  const [copiedDaily, setCopiedDaily] = useState(false);
  const [periodFilter, setPeriodFilter] = useState<'7' | '15' | '30' | 'month'>('7');

  // Real-time listener for leads collection
  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'leads'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const map: Record<string, TeamLeadsRecord> = {};

      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        const docId = docSnap.id;

        // If it's a team record keyed by date or teamLeads_date
        const dateKey = data.date || docId.replace('teamLeads_', '');

        if (dateKey) {
          if (!map[dateKey]) {
            map[dateKey] = {
              id: dateKey,
              date: dateKey,
              flashLeads: 0,
              rapidaoLeads: 0
            };
          }

          if (data.flashLeads !== undefined || data.rapidaoLeads !== undefined) {
            map[dateKey].flashLeads = Number(data.flashLeads) || 0;
            map[dateKey].rapidaoLeads = Number(data.rapidaoLeads) || 0;
          } else if (data.count !== undefined && data.team) {
            // Legacy promoter doc fallback: sum into team
            if (data.team === 'flash') {
              map[dateKey].flashLeads += Number(data.count) || 0;
            } else if (data.team === 'rapidao') {
              map[dateKey].rapidaoLeads += Number(data.count) || 0;
            }
          }
        }
      });

      setTeamLeadsMap(map);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'leads');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const isSunday = (dateStr: string) => {
    if (!dateStr) return false;
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) return false;
    const date = new Date(y, m - 1, d);
    return date.getDay() === 0;
  };

  // Helper for day of the week in Portuguese
  const getDayOfWeek = (dateStr: string) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) return dateStr;
    const date = new Date(y, m - 1, d);
    const days = [
      'Domingo', 
      'Segunda-feira', 
      'Terça-feira', 
      'Quarta-feira', 
      'Quinta-feira', 
      'Sexta-feira', 
      'Sábado'
    ];
    return days[date.getDay()];
  };

  const formatBRDate = (dateStr: string) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    if (!y || !m || !d) return dateStr;
    return `${d}/${m}/${y}`;
  };

  const moveDate = (days: number) => {
    const current = new Date(selectedDate + 'T00:00:00');
    current.setDate(current.getDate() + days);
    setSelectedDate(formatDate(current));
  };

  // Update lead count for a team on selectedDate
  const handleUpdateTeamLeads = async (team: 'flash' | 'rapidao', newCount: number) => {
    if (readOnly) return;
    const count = Math.max(0, newCount);
    const docRef = doc(db, 'leads', `teamLeads_${selectedDate}`);

    const existing = teamLeadsMap[selectedDate] || {
      id: selectedDate,
      date: selectedDate,
      flashLeads: 0,
      rapidaoLeads: 0
    };

    const updated = {
      ...existing,
      id: selectedDate,
      date: selectedDate,
      flashLeads: team === 'flash' ? count : existing.flashLeads,
      rapidaoLeads: team === 'rapidao' ? count : existing.rapidaoLeads,
      updatedAt: new Date().toISOString()
    };

    try {
      await setDoc(docRef, updated, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'leads');
    }
  };

  // Count operators present per team on selected date
  const operatorsStatsForDate = (dateStr: string) => {
    let flashPresent = 0;
    let rapidaoPresent = 0;

    allAttendance.forEach(att => {
      if (att.date === dateStr && (att.status === 'present' || att.status === 'half-day')) {
        const promoter = promoters.find(p => p.id === att.promoterId);
        const team = promoter?.team || 'flash';
        if (team === 'flash') flashPresent++;
        if (team === 'rapidao') rapidaoPresent++;
      }
    });

    return {
      flashPresent,
      rapidaoPresent,
      totalPresent: flashPresent + rapidaoPresent
    };
  };

  // Current day metrics
  const currentDayStats = useMemo(() => {
    const op = operatorsStatsForDate(selectedDate);
    const record = teamLeadsMap[selectedDate] || { flashLeads: 0, rapidaoLeads: 0 };

    const totalLeads = (record.flashLeads || 0) + (record.rapidaoLeads || 0);
    const avgOverall = op.totalPresent > 0 ? totalLeads / op.totalPresent : 0;
    const avgFlash = op.flashPresent > 0 ? record.flashLeads / op.flashPresent : 0;
    const avgRapidao = op.rapidaoPresent > 0 ? record.rapidaoLeads / op.rapidaoPresent : 0;

    return {
      flashLeads: record.flashLeads || 0,
      rapidaoLeads: record.rapidaoLeads || 0,
      totalLeads,
      flashPresent: op.flashPresent,
      rapidaoPresent: op.rapidaoPresent,
      totalPresent: op.totalPresent,
      avgOverall,
      avgFlash,
      avgRapidao
    };
  }, [selectedDate, teamLeadsMap, allAttendance, promoters]);

  // Report Data per Period
  const periodReport = useMemo(() => {
    const today = new Date();
    let startDate = new Date();

    if (periodFilter === '7') {
      startDate.setDate(today.getDate() - 6);
    } else if (periodFilter === '15') {
      startDate.setDate(today.getDate() - 14);
    } else if (periodFilter === '30') {
      startDate.setDate(today.getDate() - 29);
    } else if (periodFilter === 'month') {
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    }

    const startStr = formatDate(startDate);
    const endStr = formatDate(today);

    const datesMap: Record<string, {
      date: string;
      dayOfWeek: string;
      flashLeads: number;
      rapidaoLeads: number;
      totalLeads: number;
      flashPresent: number;
      rapidaoPresent: number;
      totalPresent: number;
    }> = {};

    // Generate date range (excluding Sundays - Segunda a Sábado)
    const curr = new Date(startDate);
    while (curr <= today) {
      const dStr = formatDate(curr);
      if (!isSunday(dStr)) {
        datesMap[dStr] = {
          date: dStr,
          dayOfWeek: getDayOfWeek(dStr),
          flashLeads: 0,
          rapidaoLeads: 0,
          totalLeads: 0,
          flashPresent: 0,
          rapidaoPresent: 0,
          totalPresent: 0
        };
      }
      curr.setDate(curr.getDate() + 1);
    }

    // Populate operators present (excluding Sundays)
    allAttendance.forEach(att => {
      if (att.date >= startStr && att.date <= endStr && !isSunday(att.date) && (att.status === 'present' || att.status === 'half-day')) {
        if (!datesMap[att.date]) {
          datesMap[att.date] = {
            date: att.date,
            dayOfWeek: getDayOfWeek(att.date),
            flashLeads: 0,
            rapidaoLeads: 0,
            totalLeads: 0,
            flashPresent: 0,
            rapidaoPresent: 0,
            totalPresent: 0
          };
        }
        const promoter = promoters.find(p => p.id === att.promoterId);
        const team = promoter?.team || 'flash';
        if (team === 'flash') datesMap[att.date].flashPresent++;
        if (team === 'rapidao') datesMap[att.date].rapidaoPresent++;
        datesMap[att.date].totalPresent++;
      }
    });

    // Populate team leads (excluding Sundays)
    Object.keys(teamLeadsMap).forEach(dStr => {
      if (dStr >= startStr && dStr <= endStr && !isSunday(dStr)) {
        if (!datesMap[dStr]) {
          datesMap[dStr] = {
            date: dStr,
            dayOfWeek: getDayOfWeek(dStr),
            flashLeads: 0,
            rapidaoLeads: 0,
            totalLeads: 0,
            flashPresent: 0,
            rapidaoPresent: 0,
            totalPresent: 0
          };
        }
        const rec = teamLeadsMap[dStr];
        datesMap[dStr].flashLeads = rec.flashLeads || 0;
        datesMap[dStr].rapidaoLeads = rec.rapidaoLeads || 0;
        datesMap[dStr].totalLeads = (rec.flashLeads || 0) + (rec.rapidaoLeads || 0);
      }
    });

    const dailyRows = Object.values(datesMap)
      .filter(r => !isSunday(r.date))
      .sort((a, b) => b.date.localeCompare(a.date));

    // Totals
    const totalPeriodLeads = dailyRows.reduce((acc, r) => acc + r.totalLeads, 0);
    const totalFlashLeads = dailyRows.reduce((acc, r) => acc + r.flashLeads, 0);
    const totalRapidaoLeads = dailyRows.reduce((acc, r) => acc + r.rapidaoLeads, 0);

    const sumFlashOperators = dailyRows.reduce((acc, r) => acc + r.flashPresent, 0);
    const sumRapidaoOperators = dailyRows.reduce((acc, r) => acc + r.rapidaoPresent, 0);
    const sumOperators = dailyRows.reduce((acc, r) => acc + r.totalPresent, 0);

    const activeDaysCount = dailyRows.filter(r => r.totalLeads > 0 || r.totalPresent > 0).length || 1;
    
    const avgLeadsPerDay = totalPeriodLeads / activeDaysCount;
    const avgOperatorsPerDay = sumOperators / activeDaysCount;
    const avgLeadsPerOperator = sumOperators > 0 ? totalPeriodLeads / sumOperators : 0;
    const avgFlashConversion = sumFlashOperators > 0 ? totalFlashLeads / sumFlashOperators : 0;
    const avgRapidaoConversion = sumRapidaoOperators > 0 ? totalRapidaoLeads / sumRapidaoOperators : 0;

    return {
      startDateStr: formatBRDate(startStr),
      endDateStr: formatBRDate(endStr),
      dailyRows,
      totalPeriodLeads,
      totalFlashLeads,
      totalRapidaoLeads,
      sumOperators,
      sumFlashOperators,
      sumRapidaoOperators,
      avgLeadsPerDay,
      avgOperatorsPerDay,
      avgLeadsPerOperator,
      avgFlashConversion,
      avgRapidaoConversion
    };
  }, [periodFilter, teamLeadsMap, allAttendance, promoters]);

  // Copy Daily Report to clipboard
  const copyDailyReport = () => {
    const dayOfWeek = getDayOfWeek(selectedDate);
    const brDate = formatBRDate(selectedDate);

    let text = `📊 RELATÓRIO DE LEADS POR EQUIPE - ${brDate} (${dayOfWeek})\n\n`;
    text += `⚡ TIME FLASH:\n`;
    text += `• Operadores: ${currentDayStats.flashPresent} op.\n`;
    text += `• Total de Leads: ${currentDayStats.flashLeads} leads\n`;
    text += `• Conversão: ${currentDayStats.avgFlash.toFixed(1)} leads/op.\n\n`;

    text += `🚀 TIME RAPIDÃO:\n`;
    text += `• Operadores: ${currentDayStats.rapidaoPresent} op.\n`;
    text += `• Total de Leads: ${currentDayStats.rapidaoLeads} leads\n`;
    text += `• Conversão: ${currentDayStats.avgRapidao.toFixed(1)} leads/op.\n\n`;

    text += `📈 RESUMO GERAL:\n`;
    text += `• Total Operadores: ${currentDayStats.totalPresent} op.\n`;
    text += `• Total de Leads: ${currentDayStats.totalLeads} leads\n`;
    text += `• Conversão Geral: ${currentDayStats.avgOverall.toFixed(1)} leads/op.\n`;

    navigator.clipboard.writeText(text).then(() => {
      setCopiedDaily(true);
      setTimeout(() => setCopiedDaily(false), 2000);
    });
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-brand-dark text-brand-lime rounded-xl">
            <Target size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-zinc-900 tracking-tight">Controle de Leads por Equipe</h2>
            <p className="text-xs font-semibold text-zinc-500">
              Lançamento do total de captação por equipe (Flash e Rapidão) e relatórios diários
            </p>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center bg-zinc-100 p-1 rounded-xl border border-zinc-200/80 w-full sm:w-auto">
          <button
            onClick={() => setViewMode('daily')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-extrabold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
              viewMode === 'daily'
                ? 'bg-white text-zinc-900 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
          >
            <Calendar size={14} />
            <span>Lançamento Diário</span>
          </button>
          <button
            onClick={() => setViewMode('report')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-extrabold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
              viewMode === 'report'
                ? 'bg-white text-zinc-900 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
          >
            <BarChart3 size={14} />
            <span>Relatório do Período</span>
          </button>
        </div>
      </div>

      {viewMode === 'daily' ? (
        <>
          {/* Date Control Banner */}
          <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
              <button
                onClick={() => moveDate(-1)}
                className="p-2 hover:bg-zinc-100 rounded-xl transition-colors border border-zinc-200 text-zinc-600"
                title="Dia anterior"
              >
                <ChevronLeft size={18} />
              </button>
              
              <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-xl">
                <Calendar size={16} className="text-indigo-600" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="bg-transparent text-sm font-bold text-zinc-900 focus:outline-none cursor-pointer"
                />
              </div>

              <button
                onClick={() => moveDate(1)}
                className="p-2 hover:bg-zinc-100 rounded-xl transition-colors border border-zinc-200 text-zinc-600"
                title="Próximo dia"
              >
                <ChevronRight size={18} />
              </button>

              <button
                onClick={() => setSelectedDate(formatDate(new Date()))}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all border ${
                  selectedDate === formatDate(new Date())
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'text-indigo-600 hover:bg-indigo-50 border-indigo-200'
                }`}
                title={selectedDate === formatDate(new Date()) ? 'Data de hoje selecionada' : 'Ir para a data de hoje'}
              >
                {selectedDate === formatDate(new Date()) ? 'Hoje' : 'Ir para Hoje'}
              </button>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-sm font-extrabold text-zinc-900 bg-zinc-100 px-3 py-1 rounded-xl">
                {getDayOfWeek(selectedDate)}, {formatBRDate(selectedDate)}
              </span>

              <button
                onClick={copyDailyReport}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                  copiedDaily
                    ? 'bg-green-50 text-green-700 border-green-200'
                    : 'bg-zinc-900 text-white border-zinc-900 hover:bg-zinc-800'
                }`}
              >
                {copiedDaily ? <Check size={14} /> : <Copy size={14} />}
                <span>{copiedDaily ? 'Copiado!' : 'Copiar Relatório do Dia'}</span>
              </button>
            </div>
          </div>

          {/* Daily Overall Summary Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 block mb-1">
                  Resumo Geral do Dia
                </span>
                <span className="text-3xl font-black text-zinc-900 tracking-tight block">
                  {currentDayStats.totalLeads} <span className="text-sm font-bold text-zinc-500">leads</span>
                </span>
                <span className="text-xs font-semibold text-zinc-500 mt-1 block">
                  {currentDayStats.totalPresent} op. | Média: <strong className="text-emerald-600">{currentDayStats.avgOverall.toFixed(1)}</strong> leads/op.
                </span>
              </div>
              <div className="p-3 bg-zinc-100 text-zinc-800 rounded-2xl shrink-0">
                <Target size={22} />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-indigo-100 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-500 block mb-1">
                  Time Flash ⚡
                </span>
                <span className="text-3xl font-black text-indigo-600 tracking-tight block">
                  {currentDayStats.flashLeads} <span className="text-sm font-bold text-indigo-400">leads</span>
                </span>
                <span className="text-xs font-semibold text-zinc-500 mt-1 block">
                  {currentDayStats.flashPresent} op. | Conversão: <strong className="text-indigo-600">{currentDayStats.avgFlash.toFixed(1)}</strong> leads/op.
                </span>
              </div>
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl shrink-0">
                <Zap size={22} />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-amber-100 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-500 block mb-1">
                  Time Rapidão 🚀
                </span>
                <span className="text-3xl font-black text-amber-600 tracking-tight block">
                  {currentDayStats.rapidaoLeads} <span className="text-sm font-bold text-amber-400">leads</span>
                </span>
                <span className="text-xs font-semibold text-zinc-500 mt-1 block">
                  {currentDayStats.rapidaoPresent} op. | Conversão: <strong className="text-amber-600">{currentDayStats.avgRapidao.toFixed(1)}</strong> leads/op.
                </span>
              </div>
              <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl shrink-0">
                <Rocket size={22} />
              </div>
            </div>
          </div>

          {/* Team Leads Entry Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* TIME FLASH CARD */}
            {(selectedTeam === 'all' || selectedTeam === 'flash') && (
              <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-6 space-y-6">
                <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                      <Zap size={24} />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-zinc-900">TIME FLASH</h3>
                      <p className="text-xs font-semibold text-zinc-500">Lançamento direto da equipe</p>
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold uppercase border border-indigo-200">
                    Equipe ⚡
                  </span>
                </div>

                {/* Team Info Metrics */}
                <div className="grid grid-cols-3 gap-2 bg-indigo-50/70 p-3.5 rounded-xl border border-indigo-100 text-center">
                  <div>
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Operadores</span>
                    <span className="text-base font-black text-indigo-950 mt-0.5 block">{currentDayStats.flashPresent} op.</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Total Leads</span>
                    <span className="text-base font-black text-indigo-600 mt-0.5 block">{currentDayStats.flashLeads}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Conversão</span>
                    <span className="text-base font-black text-indigo-700 mt-0.5 block">
                      {currentDayStats.avgFlash.toFixed(1)} <span className="text-[10px] font-normal text-zinc-500">leads/op</span>
                    </span>
                  </div>
                </div>

                {/* Counter Control */}
                <div className="space-y-3">
                  <label className="text-xs font-extrabold uppercase tracking-wider text-zinc-500 block">
                    Total de Leads - Time Flash
                  </label>

                  <div className="flex items-center gap-3">
                    <button
                      disabled={readOnly || currentDayStats.flashLeads <= 0}
                      onClick={() => handleUpdateTeamLeads('flash', currentDayStats.flashLeads - 1)}
                      className="w-12 h-12 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-40 flex items-center justify-center text-zinc-800 font-black transition-all shadow-sm shrink-0"
                    >
                      <Minus size={18} />
                    </button>

                    <input
                      type="number"
                      min="0"
                      disabled={readOnly}
                      value={currentDayStats.flashLeads === 0 ? '' : currentDayStats.flashLeads}
                      placeholder="0"
                      onChange={e => {
                        const val = parseInt(e.target.value, 10);
                        handleUpdateTeamLeads('flash', isNaN(val) ? 0 : val);
                      }}
                      className="w-full text-center py-3 bg-zinc-50 border-2 border-indigo-200 rounded-2xl font-black text-2xl text-indigo-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-600 transition-all"
                    />

                    <button
                      disabled={readOnly}
                      onClick={() => handleUpdateTeamLeads('flash', currentDayStats.flashLeads + 1)}
                      className="w-12 h-12 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 flex items-center justify-center font-black transition-all shadow-md shadow-indigo-600/20 shrink-0"
                    >
                      <Plus size={18} />
                    </button>
                  </div>

                  {/* Quick Add Buttons */}
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mr-1">Atalhos:</span>
                    {['+1', '+5', '+10', '+50'].map(numStr => {
                      const val = parseInt(numStr.replace('+', ''), 10);
                      return (
                        <button
                          key={numStr}
                          disabled={readOnly}
                          onClick={() => handleUpdateTeamLeads('flash', currentDayStats.flashLeads + val)}
                          className="flex-1 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-extrabold text-xs rounded-xl border border-indigo-200/60 transition-all"
                        >
                          {numStr}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* TIME RAPIDÃO CARD */}
            {(selectedTeam === 'all' || selectedTeam === 'rapidao') && (
              <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-6 space-y-6">
                <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
                      <Rocket size={24} />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-zinc-900">TIME RAPIDÃO</h3>
                      <p className="text-xs font-semibold text-zinc-500">Lançamento direto da equipe</p>
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-bold uppercase border border-amber-200">
                    Equipe 🚀
                  </span>
                </div>

                {/* Team Info Metrics */}
                <div className="grid grid-cols-3 gap-2 bg-amber-50/70 p-3.5 rounded-xl border border-amber-100 text-center">
                  <div>
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Operadores</span>
                    <span className="text-base font-black text-amber-950 mt-0.5 block">{currentDayStats.rapidaoPresent} op.</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Total Leads</span>
                    <span className="text-base font-black text-amber-600 mt-0.5 block">{currentDayStats.rapidaoLeads}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Conversão</span>
                    <span className="text-base font-black text-amber-700 mt-0.5 block">
                      {currentDayStats.avgRapidao.toFixed(1)} <span className="text-[10px] font-normal text-zinc-500">leads/op</span>
                    </span>
                  </div>
                </div>

                {/* Counter Control */}
                <div className="space-y-3">
                  <label className="text-xs font-extrabold uppercase tracking-wider text-zinc-500 block">
                    Total de Leads - Time Rapidão
                  </label>

                  <div className="flex items-center gap-3">
                    <button
                      disabled={readOnly || currentDayStats.rapidaoLeads <= 0}
                      onClick={() => handleUpdateTeamLeads('rapidao', currentDayStats.rapidaoLeads - 1)}
                      className="w-12 h-12 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-40 flex items-center justify-center text-zinc-800 font-black transition-all shadow-sm shrink-0"
                    >
                      <Minus size={18} />
                    </button>

                    <input
                      type="number"
                      min="0"
                      disabled={readOnly}
                      value={currentDayStats.rapidaoLeads === 0 ? '' : currentDayStats.rapidaoLeads}
                      placeholder="0"
                      onChange={e => {
                        const val = parseInt(e.target.value, 10);
                        handleUpdateTeamLeads('rapidao', isNaN(val) ? 0 : val);
                      }}
                      className="w-full text-center py-3 bg-zinc-50 border-2 border-amber-200 rounded-2xl font-black text-2xl text-amber-900 focus:outline-none focus:ring-4 focus:ring-amber-500/10 focus:border-amber-600 transition-all"
                    />

                    <button
                      disabled={readOnly}
                      onClick={() => handleUpdateTeamLeads('rapidao', currentDayStats.rapidaoLeads + 1)}
                      className="w-12 h-12 rounded-xl bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40 flex items-center justify-center font-black transition-all shadow-md shadow-amber-500/20 shrink-0"
                    >
                      <Plus size={18} />
                    </button>
                  </div>

                  {/* Quick Add Buttons */}
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mr-1">Atalhos:</span>
                    {['+1', '+5', '+10', '+50'].map(numStr => {
                      const val = parseInt(numStr.replace('+', ''), 10);
                      return (
                        <button
                          key={numStr}
                          disabled={readOnly}
                          onClick={() => handleUpdateTeamLeads('rapidao', currentDayStats.rapidaoLeads + val)}
                          className="flex-1 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 font-extrabold text-xs rounded-xl border border-amber-200/60 transition-all"
                        >
                          {numStr}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Report & Analysis View */
        <div className="space-y-6">
          {/* Period Filter Buttons */}
          <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <BarChart3 size={18} className="text-indigo-600" />
              <span className="text-xs font-bold text-zinc-700 uppercase tracking-wider">Período de Análise:</span>
            </div>

            <div className="flex items-center bg-zinc-100 p-1 rounded-xl border border-zinc-200/80 w-full sm:w-auto">
              <button
                onClick={() => setPeriodFilter('7')}
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  periodFilter === '7' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                Últimos 7 dias
              </button>
              <button
                onClick={() => setPeriodFilter('15')}
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  periodFilter === '15' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                Últimos 15 dias
              </button>
              <button
                onClick={() => setPeriodFilter('30')}
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  periodFilter === '30' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                Últimos 30 dias
              </button>
              <button
                onClick={() => setPeriodFilter('month')}
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  periodFilter === 'month' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                Este Mês
              </button>
            </div>
          </div>

          {/* Period Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-indigo-100 shadow-sm">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-600 block mb-1">
                Time Flash ⚡
              </span>
              <div className="text-3xl font-black text-indigo-600 tracking-tight">
                {periodReport.totalFlashLeads} <span className="text-sm font-bold text-indigo-400">leads</span>
              </div>
              <div className="mt-2 text-xs font-semibold text-zinc-600 space-y-0.5 border-t border-zinc-100 pt-2">
                <p>Operadores: <strong className="text-zinc-900">{periodReport.sumFlashOperators} op.</strong></p>
                <p>Conversão Média: <strong className="text-indigo-600">{periodReport.avgFlashConversion.toFixed(1)} leads/op.</strong></p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-amber-100 shadow-sm">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-600 block mb-1">
                Time Rapidão 🚀
              </span>
              <div className="text-3xl font-black text-amber-600 tracking-tight">
                {periodReport.totalRapidaoLeads} <span className="text-sm font-bold text-amber-400">leads</span>
              </div>
              <div className="mt-2 text-xs font-semibold text-zinc-600 space-y-0.5 border-t border-zinc-100 pt-2">
                <p>Operadores: <strong className="text-zinc-900">{periodReport.sumRapidaoOperators} op.</strong></p>
                <p>Conversão Média: <strong className="text-amber-600">{periodReport.avgRapidaoConversion.toFixed(1)} leads/op.</strong></p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 block mb-1">
                Total Geral do Período
              </span>
              <div className="text-3xl font-black text-zinc-900 tracking-tight">
                {periodReport.totalPeriodLeads} <span className="text-sm font-bold text-zinc-400">leads</span>
              </div>
              <div className="mt-2 text-xs font-semibold text-zinc-600 space-y-0.5 border-t border-zinc-100 pt-2">
                <p>Total Operadores: <strong className="text-zinc-900">{periodReport.sumOperators} op.</strong></p>
                <p>Conversão Geral: <strong className="text-emerald-600">{periodReport.avgLeadsPerOperator.toFixed(1)} leads/op.</strong></p>
              </div>
            </div>
          </div>

          {/* Detailed Daily Table */}
          <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-sm">
            <div className="p-5 border-b border-zinc-100">
              <h3 className="font-bold text-base text-zinc-900">Relatório de Leads por Equipe</h3>
              <p className="text-xs text-zinc-500">Histórico diário detalhando operadores, total de leads e conversão por equipe</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-50/80 border-b border-zinc-100 text-[11px] font-extrabold text-zinc-400 uppercase tracking-wider">
                    <th className="px-4 py-3 text-left">Data / Dia</th>
                    <th className="px-3 py-2 text-center bg-indigo-50/50 text-indigo-900 border-x border-indigo-100" colSpan={3}>Time Flash ⚡</th>
                    <th className="px-3 py-2 text-center bg-amber-50/50 text-amber-900 border-x border-amber-100" colSpan={3}>Time Rapidão 🚀</th>
                    <th className="px-3 py-2 text-center bg-zinc-100/60 text-zinc-900" colSpan={3}>Total Geral</th>
                  </tr>
                  <tr className="bg-zinc-50 border-b border-zinc-200 text-[10px] font-extrabold text-zinc-500 uppercase tracking-wider">
                    <th className="px-4 py-2"></th>
                    <th className="px-2 py-2 text-center bg-indigo-50/30 text-indigo-800">Op.</th>
                    <th className="px-2 py-2 text-center bg-indigo-50/30 text-indigo-800">Leads</th>
                    <th className="px-2 py-2 text-center bg-indigo-50/30 text-indigo-800 border-r border-indigo-100">Conversão</th>
                    <th className="px-2 py-2 text-center bg-amber-50/30 text-amber-800">Op.</th>
                    <th className="px-2 py-2 text-center bg-amber-50/30 text-amber-800">Leads</th>
                    <th className="px-2 py-2 text-center bg-amber-50/30 text-amber-800 border-r border-amber-100">Conversão</th>
                    <th className="px-2 py-2 text-center bg-zinc-50 text-zinc-800">Op.</th>
                    <th className="px-2 py-2 text-center bg-zinc-50 text-zinc-900">Leads</th>
                    <th className="px-2 py-2 text-center bg-zinc-50 text-emerald-700">Conversão</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 text-xs text-zinc-700">
                  {periodReport.dailyRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="text-center py-8 text-zinc-400 font-bold">
                        Nenhum registro encontrado para o período.
                      </td>
                    </tr>
                  ) : (
                    periodReport.dailyRows.map(row => {
                      const flashConv = row.flashPresent > 0 ? (row.flashLeads / row.flashPresent).toFixed(1) : '0.0';
                      const rapidaoConv = row.rapidaoPresent > 0 ? (row.rapidaoLeads / row.rapidaoPresent).toFixed(1) : '0.0';
                      const totalConv = row.totalPresent > 0 ? (row.totalLeads / row.totalPresent).toFixed(1) : '0.0';

                      return (
                        <tr key={row.date} className="hover:bg-zinc-50/80 transition-colors">
                          <td className="px-4 py-3">
                            <span className="font-bold text-zinc-900 block">{formatBRDate(row.date)}</span>
                            <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">{row.dayOfWeek}</span>
                          </td>
                          
                          {/* Flash */}
                          <td className="px-2 py-3 text-center font-bold text-indigo-950 bg-indigo-50/20">{row.flashPresent} op.</td>
                          <td className="px-2 py-3 text-center font-black text-indigo-600 bg-indigo-50/40">{row.flashLeads}</td>
                          <td className="px-2 py-3 text-center font-bold text-indigo-800 bg-indigo-50/20 border-r border-indigo-100/60">
                            {flashConv} <span className="text-[9px] text-zinc-400 font-normal">/op</span>
                          </td>

                          {/* Rapidão */}
                          <td className="px-2 py-3 text-center font-bold text-amber-950 bg-amber-50/20">{row.rapidaoPresent} op.</td>
                          <td className="px-2 py-3 text-center font-black text-amber-600 bg-amber-50/40">{row.rapidaoLeads}</td>
                          <td className="px-2 py-3 text-center font-bold text-amber-800 bg-amber-50/20 border-r border-amber-100/60">
                            {rapidaoConv} <span className="text-[9px] text-zinc-400 font-normal">/op</span>
                          </td>

                          {/* Total */}
                          <td className="px-2 py-3 text-center font-extrabold text-zinc-800">{row.totalPresent} op.</td>
                          <td className="px-2 py-3 text-center font-black text-zinc-900 text-sm">{row.totalLeads}</td>
                          <td className="px-2 py-3 text-center font-black text-emerald-600">
                            {totalConv} <span className="text-[9px] text-zinc-400 font-normal">/op</span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
