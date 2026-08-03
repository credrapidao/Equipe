/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Check, X, Clock } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, setDoc, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { Promoter, Attendance, OperationType } from '../types';
import { handleFirestoreError, formatDate } from '../lib/utils';

interface AttendanceTrackerProps {
  promoters: Promoter[];
  readOnly?: boolean;
}

export default function AttendanceTracker({ promoters, readOnly }: AttendanceTrackerProps) {
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const [attendanceData, setAttendanceData] = useState<Record<string, Attendance>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    // This is tricky: we want attendance for it date across all promoters.
    // In our rules, it's under promoters/{id}/attendance.
    // To list all, we'd need a collectionGroup or fetch for each visible promoter.
    // Since we usually have a small number of promoters, we can fetch for each.
    
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
    const promoter = promoters.find(p => p.id === promoterId);
    const defaultRate = promoter?.defaultDailyRate || 100;
    const attendanceId = existing?.id || selectedDate;
    const docRef = doc(db, `promoters/${promoterId}/attendance`, attendanceId);

    try {
      if (existing && existing.status === status) {
        await deleteDoc(docRef);
      } else {
        await setDoc(docRef, {
          promoterId,
          date: selectedDate,
          status,
          paymentStatus: existing?.paymentStatus || 'pending',
          dailyRate: existing?.dailyRate || defaultRate,
          recordedAt: new Date().toISOString()
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

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-sm">
      <div className="p-6 border-b border-zinc-100 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-zinc-100 rounded-xl text-zinc-600">
            <Calendar size={20} />
          </div>
          <div>
            <h2 className="font-bold text-zinc-900 tracking-tight">Registro de Presença e Controle Financeiro</h2>
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

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-zinc-50 text-zinc-500 text-[10px] uppercase font-bold tracking-widest border-b border-zinc-100">
            <tr>
              <th className="px-8 py-5">Promotor</th>
              <th className="px-8 py-5">Presença</th>
              <th className="px-8 py-5">Valor Diária</th>
              <th className="px-8 py-5 text-right">Pagamento</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {promoters
              .filter(p => p.active || attendanceData[p.id])
              .map(promoter => {
              const attendance = attendanceData[promoter.id];
              return (
                <tr key={promoter.id} className="hover:bg-zinc-50/50 transition-colors group">
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                        attendance ? 'bg-brand-dark text-brand-lime shadow-lg' : 'bg-zinc-100 text-zinc-400'
                      }`}>
                        {promoter.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-extrabold text-zinc-900">{promoter.name}</div>
                        <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mt-0.5">{promoter.document}</div>
                      </div>
                    </div>
                  </td>

                  <td className="px-8 py-6">
                    <div className="flex items-center gap-3">
                      <StatusButton 
                        active={attendance?.status === 'present'} 
                        icon={<Check size={16} />} 
                        activeColor="green"
                        onClick={() => toggleStatus(promoter.id, 'present')} 
                        disabled={readOnly}
                      />
                      <StatusButton 
                        active={attendance?.status === 'half-day'} 
                        icon={<Clock size={16} />} 
                        activeColor="yellow"
                        onClick={() => toggleStatus(promoter.id, 'half-day')} 
                        disabled={readOnly}
                      />
                      <StatusButton 
                        active={attendance?.status === 'absent'} 
                        icon={<X size={16} />} 
                        activeColor="red"
                        onClick={() => toggleStatus(promoter.id, 'absent')} 
                        disabled={readOnly}
                      />
                    </div>
                  </td>

                  <td className="px-8 py-6">
                    {attendance ? (
                      <div className="flex items-center gap-2 group/input">
                        <span className="text-zinc-400 text-xs font-bold">R$</span>
                        <input 
                          type="number"
                          disabled={readOnly}
                          value={attendance.dailyRate}
                          onChange={(e) => updateAttendanceField(promoter.id, { dailyRate: Number(e.target.value) })}
                          className="w-20 bg-zinc-50 border border-zinc-100 hover:border-zinc-200 focus:border-brand-lime focus:bg-white rounded-lg px-2 py-1 text-sm font-bold text-zinc-900 focus:outline-none transition-all ring-offset-white focus:ring-2 focus:ring-brand-lime/20 disabled:opacity-55 disabled:cursor-not-allowed"
                        />
                      </div>
                    ) : (
                      <span className="text-zinc-300 text-[10px] font-bold uppercase tracking-widest pl-4">---</span>
                    )}
                  </td>

                  <td className="px-8 py-6 text-right">
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
                </tr>
              );
            })}
          </tbody>
        </table>

        {promoters.length === 0 && (
          <div className="p-16 text-center text-zinc-500 font-medium">
            Nenhum promotor cadastrado para registrar presença.
          </div>
        )}
      </div>
    </div>
  );
}

function StatusButton({ active, icon, activeColor, onClick, disabled }: { 
  active: boolean, 
  icon: React.ReactNode, 
  activeColor: 'green' | 'red' | 'yellow',
  onClick: () => void,
  disabled?: boolean
}) {
  const colors = {
    green: active ? 'bg-brand-lime text-brand-dark border-brand-lime shadow-md shadow-brand-lime/20' : 'text-zinc-400 border-zinc-200 hover:border-brand-lime hover:text-brand-lime bg-white',
    red: active ? 'bg-red-600 text-white border-red-600 shadow-md shadow-red-100' : 'text-zinc-400 border-zinc-200 hover:border-red-600 hover:text-red-600 bg-white',
    yellow: active ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-100' : 'text-zinc-400 border-zinc-200 hover:border-amber-500 hover:text-amber-500 bg-white',
  };

  return (
    <button 
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className={`p-2 rounded-lg border transition-all ${disabled ? 'opacity-55 cursor-not-allowed' : ''} ${colors[activeColor]}`}
    >
      {icon}
    </button>
  );
}
