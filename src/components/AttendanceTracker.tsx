/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Check, X, Clock, ArrowRightLeft, Users, Filter, CheckCircle2 } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, setDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Promoter, Attendance, OperationType, Team } from '../types';
import { handleFirestoreError, formatDate } from '../lib/utils';
import { useTeams, getTeamDisplay, getTeamColorStyle } from '../lib/teams';

export const HOURLY_RATE = 20; // R$ 20,00 por hora trabalhada
export const DEFAULT_HOURS = 5; // 5 horas padrão de trabalho

interface AttendanceTrackerProps {
  promoters: Promoter[];
  readOnly?: boolean;
  teams?: Team[];
  userRole?: 'admin' | 'supervisor' | 'viewer';
}

export default function AttendanceTracker({ 
  promoters, 
  readOnly, 
  teams: propTeams,
  userRole = 'admin' 
}: AttendanceTrackerProps) {
  const { teams: hookTeams } = useTeams();
  const teamsList = propTeams && propTeams.length > 0 ? propTeams : hookTeams;
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const [attendanceData, setAttendanceData] = useState<Record<string, Attendance>>({});
  const [inputHours, setInputHours] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [filterOnlyLoaned, setFilterOnlyLoaned] = useState(false);

  const isSupervisor = userRole === 'supervisor';

  useEffect(() => {
    setLoading(true);
    
    const unsubscribes = promoters.map(promoter => {
      const q = query(
        collection(db, `promoters/${promoter.id}/attendance`),
        where('date', '==', selectedDate)
      );

      return onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
          const data = snapshot.docs[0].data() as Attendance;
          data.id = snapshot.docs[0].id;
          setAttendanceData(prev => ({ ...prev, [promoter.id]: data }));
        } else {
          setAttendanceData(prev => {
            const next = { ...prev };
            delete next[promoter.id];
            return next;
          });
        }
        setLoading(false);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, `promoters/${promoter.id}/attendance`);
      });
    });

    return () => unsubscribes.forEach(unsub => unsub());
  }, [selectedDate, promoters]);

  const toggleStatus = async (promoterId: string, status: Attendance['status']) => {
    const existing = attendanceData[promoterId];
    const attendanceId = existing?.id || selectedDate;
    const docRef = doc(db, `promoters/${promoterId}/attendance`, attendanceId);

    const defaultHours = status === 'present' ? DEFAULT_HOURS : (status === 'half-day' ? 2.5 : 0);
    const targetHours = status === 'absent' 
      ? 0 
      : (existing?.workedHours !== undefined && existing?.workedHours > 0 ? existing.workedHours : defaultHours);
    const calculatedRate = targetHours * HOURLY_RATE;

    try {
      if (existing && existing.status === status) {
        await deleteDoc(docRef);
        setInputHours(prev => {
          const next = { ...prev };
          delete next[promoterId];
          return next;
        });
      } else {
        await setDoc(docRef, {
          promoterId,
          date: selectedDate,
          status,
          paymentStatus: existing?.paymentStatus || 'pending',
          dailyRate: calculatedRate,
          workedHours: targetHours,
          isLoaned: existing?.isLoaned ?? false,
          recordedAt: existing?.recordedAt || new Date().toISOString()
        });
        setInputHours(prev => {
          const next = { ...prev };
          delete next[promoterId];
          return next;
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `promoters/${promoterId}/attendance`);
    }
  };

  const updateAttendanceField = async (promoterId: string, updates: Partial<Attendance>) => {
    const existing = attendanceData[promoterId];
    if (!existing) return;

    try {
      await updateDoc(doc(db, `promoters/${promoterId}/attendance`, existing.id), updates);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `promoters/${promoterId}/attendance`);
    }
  };

  const toggleLoaned = async (promoterId: string, isLoaned: boolean) => {
    const existing = attendanceData[promoterId];
    const attendanceId = existing?.id || selectedDate;
    const docRef = doc(db, `promoters/${promoterId}/attendance`, attendanceId);

    try {
      if (existing) {
        await updateDoc(docRef, { isLoaned });
      } else {
        const defaultHours = DEFAULT_HOURS;
        const calculatedRate = defaultHours * HOURLY_RATE;
        await setDoc(docRef, {
          promoterId,
          date: selectedDate,
          status: 'present',
          paymentStatus: 'pending',
          dailyRate: calculatedRate,
          workedHours: defaultHours,
          isLoaned,
          recordedAt: new Date().toISOString()
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `promoters/${promoterId}/attendance`);
    }
  };

  const updateWorkedHours = async (promoterId: string, hours: number) => {
    const existing = attendanceData[promoterId];
    const attendanceId = existing?.id || selectedDate;
    const docRef = doc(db, `promoters/${promoterId}/attendance`, attendanceId);

    const cleanHours = Math.max(0, Math.min(24, isNaN(hours) ? 0 : hours));
    const calculatedRate = cleanHours * HOURLY_RATE;
    const calculatedStatus: Attendance['status'] = cleanHours >= DEFAULT_HOURS 
      ? 'present' 
      : (cleanHours > 0 ? 'half-day' : 'absent');

    try {
      if (existing) {
        await updateDoc(docRef, { 
          workedHours: cleanHours,
          dailyRate: calculatedRate,
          status: calculatedStatus
        });
      } else {
        await setDoc(docRef, {
          promoterId,
          date: selectedDate,
          status: calculatedStatus,
          paymentStatus: 'pending',
          dailyRate: calculatedRate,
          workedHours: cleanHours,
          isLoaned: false,
          recordedAt: new Date().toISOString()
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `promoters/${promoterId}/attendance`);
    }
  };

  const moveDate = (days: number) => {
    const current = new Date(selectedDate + 'T00:00:00');
    current.setDate(current.getDate() + days);
    setSelectedDate(formatDate(current));
  };

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

  // Day summary metrics
  const dayStats = useMemo(() => {
    let present = 0;
    let halfDay = 0;
    let absent = 0;
    let totalHours = 0;
    let loaned = 0;
    let totalAmount = 0;

    promoters.forEach(p => {
      const att = attendanceData[p.id];
      if (att) {
        if (att.status === 'present') present++;
        if (att.status === 'half-day') halfDay++;
        if (att.status === 'absent') absent++;
        const h = att.workedHours !== undefined ? att.workedHours : (att.status === 'present' ? DEFAULT_HOURS : (att.status === 'half-day' ? 2.5 : 0));
        totalHours += h;
        if (att.isLoaned) loaned++;
        const pay = att.status === 'absent'
          ? 0
          : (att.workedHours !== undefined ? att.workedHours * HOURLY_RATE : (att.dailyRate !== undefined ? att.dailyRate : (h * HOURLY_RATE)));
        totalAmount += pay;
      }
    });

    return { present, halfDay, absent, totalHours, loaned, totalAmount, total: promoters.length };
  }, [promoters, attendanceData]);

  const visiblePromoters = useMemo(() => {
    return promoters
      .filter(p => p.active || attendanceData[p.id])
      .filter(p => {
        if (filterOnlyLoaned) {
          return Boolean(attendanceData[p.id]?.isLoaned);
        }
        return true;
      });
  }, [promoters, attendanceData, filterOnlyLoaned]);

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-sm">
      {/* Top Header */}
      <div className="p-6 border-b border-zinc-100 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-zinc-100 rounded-xl text-zinc-600">
            <Calendar size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-zinc-900 tracking-tight">
                {isSupervisor ? 'Controle de Presença da Equipe' : 'Registro de Presença e Controle Financeiro'}
              </h2>
              {isSupervisor && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-blue-100 text-blue-800">
                  Visão do Supervisor
                </span>
              )}
            </div>
            <p className="text-xs font-bold text-indigo-600 mt-0.5">
              {getDayOfWeek(selectedDate)}, {new Date(selectedDate + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-zinc-50 p-1 rounded-xl border border-zinc-200">
            <button onClick={() => moveDate(-1)} className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg text-zinc-600 transition-all" title="Dia anterior">
              <ChevronLeft size={20} />
            </button>
            <div className="px-2 py-1 text-sm font-extrabold text-zinc-900 tabular-nums flex items-center gap-1">
              <input 
                type="date"
                value={selectedDate}
                onChange={e => e.target.value && setSelectedDate(e.target.value)}
                className="bg-transparent focus:outline-none cursor-pointer font-bold text-sm text-zinc-800"
              />
            </div>
            <button onClick={() => moveDate(1)} className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg text-zinc-600 transition-all" title="Próximo dia">
              <ChevronRight size={20} />
            </button>
          </div>

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
      </div>

      {/* Summary KPI Bar */}
      <div className="px-6 py-3 bg-zinc-50 border-b border-zinc-100 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="text-zinc-600">Presentes:</span>
            <strong className="text-zinc-900">{dayStats.present}</strong>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span className="text-zinc-600">Meio Período:</span>
            <strong className="text-zinc-900">{dayStats.halfDay}</strong>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span className="text-zinc-600">Faltas:</span>
            <strong className="text-zinc-900">{dayStats.absent}</strong>
          </div>
          <div className="flex items-center gap-1.5 pl-2 border-l border-zinc-200">
            <Clock size={14} className="text-zinc-400" />
            <span className="text-zinc-600">Horas Totais:</span>
            <strong className="text-zinc-900 font-bold">{Number(dayStats.totalHours.toFixed(1)).toLocaleString('pt-BR')}h</strong>
          </div>
          <div className="flex items-center gap-1.5 pl-2 border-l border-zinc-200">
            <span className="text-emerald-600 font-black">R$</span>
            <span className="text-zinc-600">Total a Pagar (Equipe):</span>
            <strong className="text-emerald-700 font-black bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg">
              R$ {dayStats.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </strong>
          </div>
          <div className="flex items-center gap-1.5 pl-2 border-l border-zinc-200">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
            <span className="text-zinc-600">Emprestados:</span>
            <strong className={`px-1.5 py-0.2 rounded font-black ${dayStats.loaned > 0 ? 'bg-purple-100 text-purple-800' : 'text-zinc-900'}`}>
              {dayStats.loaned}
            </strong>
          </div>
        </div>

        {/* Filter by loaned toggle */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilterOnlyLoaned(!filterOnlyLoaned)}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border ${
              filterOnlyLoaned
                ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-100'
            }`}
          >
            <ArrowRightLeft size={13} />
            <span>{filterOnlyLoaned ? 'Mostrando Apenas Emprestados' : 'Filtrar Emprestados'}</span>
            {dayStats.loaned > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${filterOnlyLoaned ? 'bg-purple-800 text-white' : 'bg-purple-100 text-purple-700'}`}>
                {dayStats.loaned}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Supervisor Helper Banner */}
      {isSupervisor && (
        <div className="px-6 py-2.5 bg-blue-50/80 border-b border-blue-100 flex flex-wrap items-center justify-between gap-3 text-xs text-blue-900 font-medium">
          <div className="flex items-center gap-2">
            <span className="text-base">📋</span>
            <span>
              <strong>Painel do Supervisor:</strong> Valor fixado em <strong>R$ 20,00 por hora</strong>. Cálculo exato por tempo trabalhado (ex: <strong>metade de uma hora (30m) = R$ 10,00</strong>; 2,5h = R$ 50,00; 5h = R$ 100,00).
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-extrabold text-amber-900 bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-200 shrink-0">
              ½h (30 min) = R$ 10,00
            </span>
            <span className="text-[11px] font-extrabold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-200 shrink-0">
              Taxa: R$ 20,00/h
            </span>
            <span className="text-[11px] font-bold text-blue-700 bg-white px-2 py-0.5 rounded-full border border-blue-200 shrink-0 shadow-2xs">
              ✓ Salvamento Automático
            </span>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-zinc-50 text-zinc-500 text-[10px] uppercase font-bold tracking-widest border-b border-zinc-100">
            <tr>
              <th className="px-6 py-4">Promotor</th>
              <th className="px-6 py-4">Presença</th>
              <th className="px-6 py-4 text-center">Horas Trabalhadas</th>
              <th className="px-6 py-4 text-center">
                <div className="flex flex-col items-center">
                  <span>A Receber</span>
                  <span className="text-[9px] font-bold text-emerald-600 normal-case">(R$ 20,00/h)</span>
                </div>
              </th>
              <th className="px-6 py-4 text-center">Emprestado?</th>
              {!isSupervisor && (
                <th className="px-6 py-4 text-right">Pagamento</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {visiblePromoters.map(promoter => {
              const attendance = attendanceData[promoter.id];
              const teamDisplay = getTeamDisplay(promoter.team, teamsList);
              const teamStyle = getTeamColorStyle(teamDisplay.color);
              
              // Local input or persisted hours
              const rawInput = inputHours[promoter.id];
              const currentHoursDisplay = rawInput !== undefined
                ? rawInput
                : (attendance 
                    ? (attendance.workedHours !== undefined 
                        ? String(attendance.workedHours) 
                        : (attendance.status === 'present' ? '5' : (attendance.status === 'half-day' ? '2.5' : '0')))
                    : '');

              const parsedInput = rawInput !== undefined && rawInput !== '' 
                ? parseFloat(rawInput.replace(',', '.')) 
                : null;
              const effectiveHours = parsedInput !== null && !isNaN(parsedInput)
                ? parsedInput
                : (attendance 
                    ? (attendance.workedHours !== undefined 
                        ? attendance.workedHours 
                        : (attendance.status === 'present' ? DEFAULT_HOURS : (attendance.status === 'half-day' ? 2.5 : 0)))
                    : null);

              const calculatedPay = effectiveHours !== null ? effectiveHours * HOURLY_RATE : null;

              return (
                <tr key={promoter.id} className="hover:bg-zinc-50/50 transition-colors group">
                  {/* Promoter Info */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold transition-all shrink-0 ${
                        attendance ? 'bg-brand-dark text-brand-lime shadow-sm' : 'bg-zinc-100 text-zinc-400'
                      }`}>
                        {promoter.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-extrabold text-zinc-900 leading-snug">{promoter.name}</span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${teamStyle.bg} ${teamStyle.text} border ${teamStyle.border}`}>
                            <span>{teamDisplay.icon}</span>
                            <span>{teamDisplay.name}</span>
                          </span>
                          {attendance?.isLoaned && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-200">
                              <ArrowRightLeft size={10} />
                              Emprestado
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mt-0.5">{promoter.document}</div>
                      </div>
                    </div>
                  </td>

                  {/* Presence Status Buttons */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <StatusButton 
                        active={attendance?.status === 'present'} 
                        icon={<Check size={15} />} 
                        activeColor="green"
                        title="Presente (5 horas padrão = R$ 100,00)"
                        onClick={() => toggleStatus(promoter.id, 'present')} 
                        disabled={readOnly}
                      />
                      <StatusButton 
                        active={attendance?.status === 'half-day'} 
                        icon={<Clock size={15} />} 
                        activeColor="yellow"
                        title="Meio Período (2,5 horas padrão = R$ 50,00)"
                        onClick={() => toggleStatus(promoter.id, 'half-day')} 
                        disabled={readOnly}
                      />
                      <StatusButton 
                        active={attendance?.status === 'absent'} 
                        icon={<X size={15} />} 
                        activeColor="red"
                        title="Falta (0 horas = R$ 0,00)"
                        onClick={() => toggleStatus(promoter.id, 'absent')} 
                        disabled={readOnly}
                      />
                    </div>
                  </td>

                  {/* Worked Hours Input & Quick Presets */}
                  <td className="px-6 py-4 text-center">
                    <div className="flex flex-col items-center gap-1.5">
                      <div className="flex items-center justify-center gap-1.5">
                        <input 
                          type="number"
                          min="0"
                          max="24"
                          step="0.5"
                          disabled={readOnly}
                          value={currentHoursDisplay}
                          placeholder={attendance ? '5' : '0'}
                          onChange={(e) => {
                            const val = e.target.value;
                            setInputHours(prev => ({ ...prev, [promoter.id]: val }));
                            const num = parseFloat(val.replace(',', '.'));
                            if (!isNaN(num)) {
                              updateWorkedHours(promoter.id, num);
                            }
                          }}
                          onBlur={() => {
                            setInputHours(prev => {
                              const next = { ...prev };
                              delete next[promoter.id];
                              return next;
                            });
                          }}
                          className="w-16 bg-zinc-50 border border-zinc-200 hover:border-zinc-300 focus:border-indigo-500 focus:bg-white rounded-xl px-2 py-1.5 text-xs font-bold text-zinc-900 text-center focus:outline-none transition-all disabled:opacity-50"
                          title="Digite as horas trabalhadas (ex: 0.5 para meia hora, 1, 2.5, 5)"
                        />
                        <span className="text-xs font-bold text-zinc-400">h</span>
                      </div>

                      {/* Quick Presets for Common Shifts */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={readOnly}
                          onClick={() => {
                            setInputHours(prev => ({ ...prev, [promoter.id]: '0.5' }));
                            updateWorkedHours(promoter.id, 0.5);
                          }}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold border transition-all ${
                            effectiveHours === 0.5
                              ? 'bg-amber-100 text-amber-800 border-amber-300 shadow-2xs'
                              : 'bg-zinc-100/80 hover:bg-zinc-200/90 text-zinc-600 border-zinc-200'
                          }`}
                          title="Metade de 1 hora (30 minutos) = R$ 10,00"
                        >
                          ½h (R$ 10)
                        </button>
                        <button
                          type="button"
                          disabled={readOnly}
                          onClick={() => {
                            setInputHours(prev => ({ ...prev, [promoter.id]: '2.5' }));
                            updateWorkedHours(promoter.id, 2.5);
                          }}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold border transition-all ${
                            effectiveHours === 2.5
                              ? 'bg-amber-100 text-amber-800 border-amber-300 shadow-2xs'
                              : 'bg-zinc-100/80 hover:bg-zinc-200/90 text-zinc-600 border-zinc-200'
                          }`}
                          title="Meio período padrão (2,5 horas) = R$ 50,00"
                        >
                          2,5h
                        </button>
                        <button
                          type="button"
                          disabled={readOnly}
                          onClick={() => {
                            setInputHours(prev => ({ ...prev, [promoter.id]: '5' }));
                            updateWorkedHours(promoter.id, 5);
                          }}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold border transition-all ${
                            effectiveHours === 5
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300 shadow-2xs'
                              : 'bg-zinc-100/80 hover:bg-zinc-200/90 text-zinc-600 border-zinc-200'
                          }`}
                          title="Dia completo padrão (5 horas) = R$ 100,00"
                        >
                          5h
                        </button>
                      </div>
                    </div>
                  </td>

                  {/* Calculated Pay (R$ 20/h) */}
                  <td className="px-6 py-4 text-center">
                    {calculatedPay !== null ? (
                      <div className="inline-flex flex-col items-center">
                        <div className={`inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-black tabular-nums border shadow-2xs ${
                          calculatedPay > 0 
                            ? (effectiveHours === 0.5 
                                ? 'bg-amber-50 text-amber-800 border-amber-200' 
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200')
                            : 'bg-zinc-50 text-zinc-400 border-zinc-200'
                        }`}>
                          <span>R$</span>
                          <span>{calculatedPay.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <span className="text-[10px] text-zinc-400 font-medium mt-0.5">
                          {effectiveHours === 0.5 ? '½h (30 min) × R$ 20,00' : `${String(effectiveHours).replace('.', ',')}h × R$ 20,00`}
                        </span>
                      </div>
                    ) : (
                      <span className="text-zinc-300 text-xs font-bold">---</span>
                    )}
                  </td>

                  {/* Loaned Checkbox */}
                  <td className="px-6 py-4 text-center">
                    <label className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all cursor-pointer select-none ${
                      attendance?.isLoaned
                        ? 'bg-purple-50 text-purple-700 border-purple-200 font-bold shadow-2xs'
                        : 'bg-zinc-50 text-zinc-500 border-zinc-200 hover:bg-zinc-100 font-medium'
                    } ${readOnly ? 'opacity-50 pointer-events-none' : ''}`}>
                      <input 
                        type="checkbox"
                        disabled={readOnly}
                        checked={Boolean(attendance?.isLoaned)}
                        onChange={(e) => toggleLoaned(promoter.id, e.target.checked)}
                        className="h-4 w-4 rounded border-zinc-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                      />
                      <span className="text-xs">
                        {attendance?.isLoaned ? 'Sim (Emprestado)' : 'Não'}
                      </span>
                    </label>
                  </td>

                  {/* Admin Only: Payment Status */}
                  {!isSupervisor && (
                    <td className="px-6 py-4 text-right">
                      {attendance ? (
                        <button 
                          disabled={readOnly}
                          onClick={() => updateAttendanceField(promoter.id, { paymentStatus: attendance.paymentStatus === 'paid' ? 'pending' : 'paid' })}
                          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all shadow-sm ${readOnly ? 'opacity-85 cursor-default' : ''} ${
                            attendance.paymentStatus === 'paid' 
                              ? 'bg-brand-lime text-brand-dark border border-brand-lime shadow-brand-lime/10' 
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {attendance.paymentStatus === 'paid' ? <Check size={14} /> : <Clock size={14} />}
                          {attendance.paymentStatus === 'paid' ? 'Quitado' : 'Pendente'}
                        </button>
                      ) : null}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        {visiblePromoters.length === 0 && (
          <div className="p-16 text-center text-zinc-500 font-medium">
            {filterOnlyLoaned 
              ? 'Nenhum promotor emprestado nesta data.' 
              : 'Nenhum promotor cadastrado para registrar presença nesta equipe.'}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusButton({ active, icon, activeColor, onClick, disabled, title }: { 
  active: boolean, 
  icon: React.ReactNode, 
  activeColor: 'green' | 'red' | 'yellow',
  onClick: () => void,
  disabled?: boolean,
  title?: string
}) {
  const colors = {
    green: active ? 'bg-brand-lime text-brand-dark border-brand-lime shadow-md shadow-brand-lime/20' : 'text-zinc-400 border-zinc-200 hover:border-brand-lime hover:text-brand-lime bg-white',
    red: active ? 'bg-red-600 text-white border-red-600 shadow-md shadow-red-100' : 'text-zinc-400 border-zinc-200 hover:border-red-600 hover:text-red-600 bg-white',
    yellow: active ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-100' : 'text-zinc-400 border-zinc-200 hover:border-amber-500 hover:text-amber-500 bg-white',
  };

  return (
    <button 
      type="button"
      title={title}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className={`p-2 rounded-lg border transition-all ${disabled ? 'opacity-55 cursor-not-allowed' : ''} ${colors[activeColor]}`}
    >
      {icon}
    </button>
  );
}
