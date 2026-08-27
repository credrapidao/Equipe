/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Wallet, Plus, Trash2, CheckCircle2, Clock, DollarSign, Copy, Check, PlusCircle, XCircle, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, deleteDoc, serverTimestamp, orderBy, where, limit, getDocs, writeBatch } from 'firebase/firestore';
import { Promoter, Advance, OperationType } from '../types';
import { handleFirestoreError, formatCurrency, formatDate } from '../lib/utils';

interface AdvanceManagerProps {
  promoters: Promoter[];
  readOnly?: boolean;
}

export default function AdvanceManager({ promoters, readOnly }: AdvanceManagerProps) {
  const [advancesMap, setAdvancesMap] = useState<Record<string, Advance[]>>({});
  const [weeklyPending, setWeeklyPending] = useState<Record<string, number>>({});
  const [weeklyPaidAtt, setWeeklyPaidAtt] = useState<Record<string, number>>({});
  const [isAdding, setIsAdding] = useState(false);
  const [selectedPromoterId, setSelectedPromoterId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(formatDate(new Date()));
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [globalCopied, setGlobalCopied] = useState(false);
  const [selectedBalances, setSelectedBalances] = useState<Set<string>>(new Set());
  const [selectedAdvances, setSelectedAdvances] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'registration' | 'history'>('registration');
  const [searchTerm, setSearchTerm] = useState('');

  // 1. DATA FLATTENING
  const advances: Advance[] = React.useMemo(() => {
    const list = Object.values(advancesMap).flat() as Advance[];
    const filtered = list.filter(a => 
      (a.promoterName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (a.notes?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );
    return filtered.sort((a, b) => b.date.localeCompare(a.date));
  }, [advancesMap, searchTerm]);

  // 2. LOGIC HELPERS
  const getPendingBalance = (promoterId: string) => {
    const totalAttendance = weeklyPending[promoterId] || 0;
    const paidAttendance = weeklyPaidAtt[promoterId] || 0;

    const totalPendingAdvances = (advancesMap[promoterId] || [])
      .filter(a => a.status === 'pending')
      .reduce((sum, a) => sum + a.amount, 0);

    const totalPaidAdvances = (advancesMap[promoterId] || [])
      .filter(a => a.status === 'paid')
      .reduce((sum, a) => sum + a.amount, 0);

    const unclearedPaidAdvances = Math.max(0, totalPaidAdvances - paidAttendance);

    return Math.max(0, Math.round((totalAttendance - totalPendingAdvances - unclearedPaidAdvances) * 100) / 100);
  };

  const getTotalPaid = (promoterId: string) => {
    return (advancesMap[promoterId] || [])
      .filter(a => a.status === 'paid')
      .reduce((sum, a) => sum + a.amount, 0);
  };

  const getWeeklyTotalPaid = (promoterId: string) => {
    const now = new Date();
    const currentWeekStart = new Date(now);
    currentWeekStart.setDate(now.getDate() - now.getDay());
    currentWeekStart.setHours(0, 0, 0, 0);

    return (advancesMap[promoterId] || [])
      .filter(a => a.status === 'paid' && new Date(a.date + 'T12:00:00') >= currentWeekStart)
      .reduce((sum, a) => sum + a.amount, 0);
  };

  const totalsSummary = React.useMemo(() => {
    const pendingReg = promoters.reduce((acc, p) => acc + getPendingBalance(p.id), 0);
    const registered = advances.filter(a => a.status === 'pending').reduce((acc, a) => acc + a.amount, 0);
    const paid = advances.filter(a => a.status === 'paid').reduce((acc, a) => acc + a.amount, 0);
    
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    startOfWeek.setHours(0,0,0,0);
    
    const weekTotal = advances
      .filter(a => new Date(a.date + 'T12:00:00') >= startOfWeek)
      .reduce((acc, a) => acc + a.amount, 0);

    return { pendingReg, registered, paid, weekTotal };
  }, [promoters, advances, weeklyPending, weeklyPaidAtt]);

  useEffect(() => {
    const unsubscribes: (() => void)[] = [];
    setAdvancesMap({});
    setWeeklyPending({});
    setWeeklyPaidAtt({});

    promoters.forEach(promoter => {
      const q = query(
        collection(db, 'promoters', promoter.id, 'advances'),
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

      const unsubAtt = onSnapshot(collection(db, 'promoters', promoter.id, 'attendance'), (snapshot) => {
        let pendingTotal = 0;
        let paidTotal = 0;

        snapshot.docs.forEach(doc => {
          const data = doc.data();
          if (data.status === 'absent') return;
          const rate = data.dailyRate || 100;
          const val = data.status === 'half-day' ? rate / 2 : rate;

          if (data.paymentStatus === 'paid') {
            paidTotal += val;
          } else {
            pendingTotal += val;
          }
        });

        setWeeklyPending(prev => ({ ...prev, [promoter.id]: pendingTotal }));
        setWeeklyPaidAtt(prev => ({ ...prev, [promoter.id]: paidTotal }));
      });
      unsubscribes.push(unsubAtt);
    });

    return () => unsubscribes.forEach(unsub => unsub());
  }, [promoters]);

  const handleAddAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPromoterId || !amount || processing) return;

    setProcessing(true);
    try {
      const promoter = promoters.find(p => p.id === selectedPromoterId);
      await addDoc(collection(db, 'promoters', selectedPromoterId, 'advances'), {
        promoterId: selectedPromoterId,
        promoterName: promoter?.name || '---',
        amount: parseFloat(amount),
        date: date,
        status: 'pending',
        notes: notes,
        createdAt: serverTimestamp()
      });

      setIsAdding(false);
      setAmount('');
      setNotes('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `promoters/${selectedPromoterId}/advances`);
    } finally {
      setProcessing(false);
    }
  };

  const updateAdvanceStatus = async (advance: Advance, newStatus: 'pending' | 'paid') => {
    if (advance.status === newStatus) return;
    
    try {
      const batch = writeBatch(db);
      const advanceRef = doc(db, 'promoters', advance.promoterId, 'advances', advance.id);
      batch.update(advanceRef, { status: newStatus });
      
      const attendanceSnapshot = await getDocs(collection(db, 'promoters', advance.promoterId, 'attendance'));
      const attendanceDocs = attendanceSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as any))
        .sort((a, b) => a.date.localeCompare(b.date));
      
      if (newStatus === 'paid') {
        let remainingToCover = advance.amount;
        for (const att of attendanceDocs) {
          if (remainingToCover <= 0.01) break;
          if (att.paymentStatus !== 'paid') {
            const rate = att.dailyRate || 100;
            const value = att.status === 'half-day' ? rate / 2 : (att.status === 'absent' ? 0 : rate);
            
            batch.update(doc(db, 'promoters', advance.promoterId, 'attendance', att.id), { 
              paymentStatus: 'paid',
              updatedAt: serverTimestamp()
            });
            remainingToCover -= value;
          }
        }
      } else {
        const paid = attendanceDocs.filter(a => a.paymentStatus === 'paid');
        if (paid.length > 0) {
          batch.update(doc(db, 'promoters', advance.promoterId, 'attendance', paid[paid.length - 1].id), { 
            paymentStatus: 'pending',
            updatedAt: serverTimestamp()
          });
        }
      }
      await batch.commit();
    } catch (err) {
      console.error('Error updating status:', err);
      alert('Erro técnico ao atualizar status: ' + (err instanceof Error ? err.message : String(err)));
      handleFirestoreError(err, OperationType.UPDATE, `promoters/${advance.promoterId}/advances/${advance.id}`);
    }
  };

  const handleToggleStatus = async (advance: Advance) => {
    if (processing) return;
    setProcessing(true);
    try {
      const nextStatus = advance.status === 'pending' ? 'paid' : 'pending';
      await updateAdvanceStatus(advance, nextStatus);
    } catch (err) {
      console.error('Error toggling status:', err);
    } finally {
      setProcessing(false);
    }
  };

  const deleteAdvance = async (advance: Advance) => {
    if (!confirm('Tem certeza que deseja excluir este adiantamento?')) return;
    setProcessing(true);
    try {
      const batch = writeBatch(db);
      
      if (advance.status === 'paid') {
        const attendanceSnapshot = await getDocs(collection(db, 'promoters', advance.promoterId, 'attendance'));
        const paidDocs = attendanceSnapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as any))
          .filter(a => a.paymentStatus === 'paid')
          .sort((a, b) => b.date.localeCompare(a.date)); // Newest first

        let amountToRevert = advance.amount;
        for (const att of paidDocs) {
          if (amountToRevert <= 0.01) break;
          
          const rate = att.dailyRate || 100;
          const value = att.status === 'half-day' ? rate / 2 : (att.status === 'absent' ? 0 : rate);
          
          batch.update(doc(db, 'promoters', advance.promoterId, 'attendance', att.id), { 
            paymentStatus: 'pending',
            updatedAt: serverTimestamp()
          });
          amountToRevert -= value;
        }
      }
      
      batch.delete(doc(db, 'promoters', advance.promoterId, 'advances', advance.id));
      await batch.commit();
      alert('Registro excluído e saldos revertidos.');
    } catch (err) {
      console.error('Erro ao excluir adiantamento:', err);
      alert('Erro ao excluir adiantamento: ' + (err instanceof Error ? err.message : String(err)));
      handleFirestoreError(err, OperationType.DELETE, `promoters/${advance.promoterId}/advances`);
    } finally {
      setProcessing(false);
    }
  };

  const copyPaymentInfo = (advance: Advance, promoter: Promoter | undefined) => {
    if (!promoter) return;
    const text = `Nome: ${promoter.name}\nCPF: ${promoter.document}\nChave Pix (${promoter.pixKeyType}): ${promoter.pixKey}\nValor: ${formatCurrency(advance.amount)}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(advance.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const copyIndividual = (e: React.MouseEvent, promoter: Promoter, amount: number) => {
    e.stopPropagation();
    const text = `NOME: ${promoter.name}\nCPF: ${promoter.document}\nPIX (${promoter.pixKeyType}): ${promoter.pixKey}\nVALOR: ${formatCurrency(amount)}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(promoter.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const toggleBalanceSelection = (promoterId: string) => {
    setSelectedBalances(prev => {
      const next = new Set(prev);
      if (next.has(promoterId)) next.delete(promoterId);
      else next.add(promoterId);
      return next;
    });
  };

  const selectAllPending = () => {
    const allPendingBalanceIds = pendingDisplayList
      .filter(i => i.type === 'balance')
      .map(i => i.promoterId);
      
    if (selectedBalances.size === allPendingBalanceIds.length) setSelectedBalances(new Set());
    else setSelectedBalances(new Set(allPendingBalanceIds));
  };

  const handleSinglePay = async (promoterId: string) => {
    if (processing) return;
    const promoter = promoters.find(p => p.id === promoterId);
    if (!promoter) return;
    const net = getPendingBalance(promoterId);
    if (net < 0.01) return;

    if (!window.confirm(`Deseja QUITAR o pagamento para ${promoter.name}?\nValor: ${formatCurrency(net)}`)) return;

    setProcessing(true);
    try {
      const batch = writeBatch(db);
      const today = formatDate(new Date());
      const newDocRef = doc(collection(db, 'promoters', promoter.id, 'advances'));
      
      batch.set(newDocRef, {
        promoterId: promoter.id,
        promoterName: promoter.name,
        amount: net,
        date: today,
        status: 'paid',
        notes: 'Quitação Direta',
        createdAt: serverTimestamp()
      });

      const attendanceSnapshot = await getDocs(collection(db, 'promoters', promoter.id, 'attendance'));
      attendanceSnapshot.docs.forEach(attDoc => {
        const data = attDoc.data();
        if (data.paymentStatus !== 'paid') {
          batch.update(doc(db, 'promoters', promoter.id, 'attendance', attDoc.id), { 
            paymentStatus: 'paid',
            updatedAt: serverTimestamp()
          });
        }
      });

      await batch.commit();
      alert('Pagamento quitado com sucesso!');
    } catch (err) {
      console.error('Erro na quitação individual:', err);
      alert('Erro ao processar quitação: ' + (err instanceof Error ? err.message : String(err)));
      handleFirestoreError(err, OperationType.WRITE, `promoters/${promoter.id}/advances-and-attendance`);
    } finally {
      setProcessing(false);
    }
  };

  const handleSingleRegister = async (promoterId: string) => {
    if (processing) return;
    const promoter = promoters.find(p => p.id === promoterId);
    if (!promoter) return;
    const net = getPendingBalance(promoterId);
    if (net < 0.01) return;

    if (!window.confirm(`Deseja REGISTRAR a pendência para ${promoter.name}?\nValor: ${formatCurrency(net)}`)) return;

    setProcessing(true);
    try {
      const today = formatDate(new Date());
      await addDoc(collection(db, 'promoters', promoter.id, 'advances'), {
        promoterId: promoter.id,
        promoterName: promoter.name,
        amount: net,
        date: today,
        status: 'pending',
        notes: 'Registro de Saldo Pendente',
        createdAt: serverTimestamp()
      });
      alert('Pendente registrado! Agora ele aparece na lista para ser pago.');
    } catch (err) {
      console.error('Erro no registro:', err);
      alert('Erro ao registrar pendência.');
    } finally {
      setProcessing(false);
    }
  };

  const registerSelected = async (status: 'pending' | 'paid') => {
    if (selectedBalances.size === 0 || processing) return;
    
    const candidates = promoters
      .filter(p => selectedBalances.has(p.id))
      .map(p => ({ promoter: p, net: getPendingBalance(p.id) }))
      .filter(item => item.net >= 0.01);
    
    if (candidates.length === 0) {
      alert('Nenhum saldo pendente encontrado para os selecionados.');
      return;
    }

    const totalAmount = candidates.reduce((acc, c) => acc + c.net, 0);
    const label = status === 'paid' ? 'Registrar + Quitar' : 'Registrar';
    if (!window.confirm(`Deseja ${label} para ${candidates.length} promotores?\nValor Total: ${formatCurrency(totalAmount)}`)) return;

    setProcessing(true);
    try {
      const batch = writeBatch(db);
      const today = formatDate(new Date());

      // Usamos Promise.all para buscar todas as presenças em paralelo ANTES de commitar o batch
      await Promise.all(candidates.map(async ({ promoter, net }) => {
        const newDocRef = doc(collection(db, 'promoters', promoter.id, 'advances'));
        batch.set(newDocRef, {
          promoterId: promoter.id,
          promoterName: promoter.name,
          amount: net,
          date: today,
          status: status,
          notes: status === 'paid' ? 'Registro e Quitação em Lote' : 'Registro em Lote',
          createdAt: serverTimestamp()
        });

        if (status === 'paid') {
          const attendanceSnapshot = await getDocs(collection(db, 'promoters', promoter.id, 'attendance'));
          attendanceSnapshot.docs.forEach(attDoc => {
            if (attDoc.data().paymentStatus !== 'paid') {
              batch.update(doc(db, 'promoters', promoter.id, 'attendance', attDoc.id), { 
                paymentStatus: 'paid',
                updatedAt: serverTimestamp()
              });
            }
          });
        }
      }));

      await batch.commit();
      alert('Operação concluída com sucesso!');
      setSelectedBalances(new Set());
    } catch (err) {
      console.error('Erro na quitação em lote:', err);
      alert('Erro ao processar quitação em lote: ' + (err instanceof Error ? err.message : String(err)));
      handleFirestoreError(err, OperationType.WRITE, 'batch-register');
    } finally {
      setProcessing(false);
    }
  };

  const copyWeeklyPaidReport = () => {
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    startOfWeek.setHours(0,0,0,0);

    const paidThisWeek = advances
      .filter(a => a.status === 'paid' && new Date(a.date + 'T12:00:00') >= startOfWeek);

    if (paidThisWeek.length === 0) {
      alert('Nenhum pagamento registrado nesta semana.');
      return;
    }

    const report = paidThisWeek
      .map(a => {
        const totalReceived = getTotalPaid(a.promoterId);
        const dateStr = new Date(a.date + 'T12:00:00').toLocaleDateString('pt-BR');
        return `• ${a.promoterName}: ${formatCurrency(a.amount)} em ${dateStr} (Total Geral Recebido: ${formatCurrency(totalReceived)})`;
      })
      .join('\n');
    
    const total = paidThisWeek.reduce((acc, a) => acc + a.amount, 0);
    const text = `RELATÓRIO DE PAGAMENTOS (SEMANAL):\n\n${report}\n\nTOTAL PAGO: ${formatCurrency(total)}`;
    
    navigator.clipboard.writeText(text).then(() => {
      setGlobalCopied(true);
      setTimeout(() => setGlobalCopied(false), 2000);
      alert('Relatório de pagos copiado para o clipboard!');
    });
  };

  const copySelectedBalances = () => {
    const list = promoters
      .filter(p => selectedBalances.has(p.id))
      .map(p => ({ p, net: getPendingBalance(p.id) }))
      .filter(i => i.net > 0.01)
      .map(i => `NOME: ${i.p.name}\nCPF: ${i.p.document}\nPIX (${i.p.pixKeyType}): ${i.p.pixKey}\nVALOR: ${formatCurrency(i.net)}`)
      .join('\n\n---\n\n');
    
    if (list) {
      navigator.clipboard.writeText(`DADOS PARA PAGAMENTO:\n\n${list}`);
      setGlobalCopied(true);
      setTimeout(() => setGlobalCopied(false), 2000);
    }
  };

  const registerAllWeeklyAdvances = async () => {
    if (processing) return;
    const candidates = promoters.map(p => ({ promoter: p, net: getPendingBalance(p.id) })).filter(item => item.net >= 0.01);
    if (candidates.length === 0) {
      alert('Não há saldos pendentes no momento.');
      return;
    }
    
    if (!window.confirm(`Deseja registrar TODOS os ${candidates.length} saldos pendentes?\nTotal: ${formatCurrency(candidates.reduce((a, b) => a + b.net, 0))}`)) return;

    setProcessing(true);
    try {
      const batch = writeBatch(db);
      const today = formatDate(new Date());
      candidates.forEach(({ promoter, net }) => {
        const newRef = doc(collection(db, 'promoters', promoter.id, 'advances'));
        batch.set(newRef, { 
          promoterId: promoter.id, 
          promoterName: promoter.name, 
          amount: net, 
          date: today, 
          status: 'pending',
          notes: 'Fatura Total',
          createdAt: serverTimestamp() 
        });
      });
      await batch.commit();
      alert('Todos os registros foram realizados com sucesso.');
    } catch (err) { 
      console.error(err); 
      alert('Erro ao processar registro total.');
    } finally { 
      setProcessing(false); 
    }
  };

  const updateBatchStatus = async (newStatus: 'pending' | 'paid') => {
    if (selectedAdvances.size === 0 || processing) return;
    
    const count = selectedAdvances.size;
    if (!confirm(`Deseja alterar o status de ${count} registros para "${newStatus === 'paid' ? 'Quitado' : 'Registrado'}"?`)) return;

    setProcessing(true);
    try {
      const targets = advances.filter(a => selectedAdvances.has(a.id));
      for (const advance of targets) {
        if (advance.status !== newStatus) {
          await updateAdvanceStatus(advance, newStatus);
        }
      }
      setSelectedAdvances(new Set());
      alert('Registros atualizados com sucesso.');
    } catch (err) { 
      console.error('Erro no update em lote:', err);
      alert('Falha ao atualizar alguns registros.');
    } finally { 
      setProcessing(false); 
    }
  };

  const deleteBatchAdvances = async () => {
    if (selectedAdvances.size === 0 || !confirm(`Excluir ${selectedAdvances.size} registros selecionados?`)) return;
    setProcessing(true);
    try {
      const batch = writeBatch(db);
      for (const id of selectedAdvances) {
        const adv = advances.find(a => a.id === id);
        if (adv) {
          batch.delete(doc(db, 'promoters', adv.promoterId, 'advances', adv.id));
          
          // Note: Full reconciliation on delete is complex in batch because we need data
          // But we can at least delete the advance records.
        }
      }
      await batch.commit();
      setSelectedAdvances(new Set());
      alert('Registros excluídos.');
    } catch (err) { 
      console.error(err);
      alert('Erro ao excluir.');
    } finally { 
      setProcessing(false); 
    }
  };

  const copyPendingSummary = () => {
    const list = promoters
      .map(p => ({ p, net: getPendingBalance(p.id) }))
      .filter(i => i.net > 0.01)
      .map(i => `NOME: ${i.p.name}\nCPF: ${i.p.document}\nPIX (${i.p.pixKeyType}): ${i.p.pixKey}\nVALOR: ${formatCurrency(i.net)}`)
      .join('\n\n---\n\n');
    
    if (list) {
      navigator.clipboard.writeText(`ADIANTAMENTOS PENDENTES:\n\n${list}`);
      setGlobalCopied(true);
      setTimeout(() => setGlobalCopied(false), 2000);
    }
  };

  const pendingDisplayList = React.useMemo(() => {
    const list: any[] = [];
    
    // 1. Attendance balances (unregistered)
    promoters.forEach(p => {
      const net = getPendingBalance(p.id);
      const matchesSearch = (p.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || 
                           (p.document || '').includes(searchTerm);
                           
      if (net >= 0.01 && matchesSearch && (p.active || net >= 0.01)) {
        list.push({
          id: `balance-${p.id}`,
          promoter: p,
          promoterId: p.id,
          amount: net,
          status: 'pending-reg',
          date: formatDate(new Date()),
          type: 'balance'
        });
      }
    });

    // 2. Registered pending advances
    advances
      .filter(a => a.status === 'pending')
      .forEach(a => {
        const promoter = promoters.find(p => p.id === a.promoterId);
        const matchesSearch = (promoter?.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || 
                             (promoter?.document || '').includes(searchTerm) ||
                             (a.notes?.toLowerCase() || '').includes(searchTerm.toLowerCase());
        if (matchesSearch) {
          list.push({
            id: a.id,
            advance: a,
            promoter: promoter,
            promoterId: a.promoterId,
            amount: a.amount,
            status: 'pending',
            date: a.date,
            type: 'advance'
          });
        }
      });

    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [promoters, advances, weeklyPending, weeklyPaidAtt, searchTerm]);

  return (
    <div className="space-y-6">
      {/* 1. DASHBOARD HUB */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Pend. Registro', value: totalsSummary.pendingReg, color: 'text-red-600', bg: 'bg-red-50', icon: <Clock size={20} /> },
          { label: 'Registrados', value: totalsSummary.registered, color: 'text-amber-600', bg: 'bg-amber-50', icon: <CheckCircle2 size={20} /> },
          { label: 'Quitados', value: totalsSummary.paid, color: 'text-brand-lime', bg: 'bg-brand-dark', icon: <DollarSign size={20} /> },
          { label: 'Esta Semana', value: totalsSummary.weekTotal, color: 'text-indigo-600', bg: 'bg-indigo-50', icon: <Wallet size={20} /> },
        ].map((stat, i) => (
          <div key={i} className={`p-4 rounded-2xl border border-zinc-200 shadow-sm ${stat.bg === 'bg-brand-dark' ? 'bg-brand-dark' : 'bg-white'}`}>
            <div className="flex items-center gap-3 mb-2">
              <div className={`${stat.bg === 'bg-brand-dark' ? 'text-brand-lime' : stat.color}`}>{stat.icon}</div>
              <span className={`text-[10px] font-bold uppercase tracking-widest ${stat.bg === 'bg-brand-dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>{stat.label}</span>
            </div>
            <div className={`text-xl font-black tabular-nums ${stat.bg === 'bg-brand-dark' ? 'text-brand-lime' : stat.color}`}>
              {formatCurrency(stat.value)}
            </div>
          </div>
        ))}
      </div>

      {/* 2. NAVIGATION AND GLOBAL ACTIONS */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-zinc-100 rounded-xl w-fit">
          <button 
            onClick={() => setActiveTab('registration')}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'registration' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
          >
            Aguardando Registro
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'history' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
          >
            Histórico e Status
          </button>
        </div>

        <div className="flex flex-1 max-w-md relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-brand-dark transition-colors" size={16} />
          <input 
            type="text"
            placeholder="Pesquisar por nome ou CPF..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-zinc-200 rounded-xl pl-10 pr-4 py-2 text-sm font-medium focus:outline-none focus:ring-4 focus:ring-brand-lime/10 focus:border-brand-lime transition-all"
          />
        </div>

        {!readOnly && (
          <button 
            onClick={() => setIsAdding(!isAdding)}
            className={`px-4 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-2 shadow-sm border ${
              isAdding 
                ? 'bg-zinc-100 text-zinc-500 border-zinc-200' 
                : 'bg-brand-dark text-brand-lime border-brand-lime/20 hover:bg-zinc-800'
            }`}
          >
            {isAdding ? <XCircle size={16} /> : <PlusCircle size={16} />}
            {isAdding ? 'Fechar Lançamento' : 'Lançar Manual'}
          </button>
        )}
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="overflow-hidden"
          >
            <form onSubmit={handleAddAdvance} className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2 mb-2 text-brand-dark">
                <PlusCircle size={18} />
                <h4 className="font-black text-sm uppercase tracking-wider">Novo Lançamento Manual</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Promotor</label>
                  <select 
                    required
                    value={selectedPromoterId}
                    onChange={e => setSelectedPromoterId(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm focus:border-brand-lime focus:outline-none focus:ring-4 focus:ring-brand-lime/10 transition-all font-bold"
                  >
                    <option value="">Selecionar...</option>
                    {promoters.filter(p => p.active).map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Valor (R$)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">R$</span>
                    <input 
                      required
                      type="number" 
                      step="0.01"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 pl-10 pr-4 py-2.5 text-sm focus:border-brand-lime focus:outline-none focus:ring-4 focus:ring-brand-lime/10 transition-all font-bold"
                      placeholder="0,00"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Data</label>
                  <input 
                    required
                    type="date" 
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm focus:border-brand-lime focus:outline-none focus:ring-4 focus:ring-brand-lime/10 transition-all font-bold"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Observações (opcional)</label>
                <input 
                  type="text" 
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm focus:border-brand-lime focus:outline-none focus:ring-4 focus:ring-brand-lime/10 transition-all"
                  placeholder="Ex: Adiantamento para transporte"
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => setIsAdding(false)} className="rounded-xl bg-zinc-100 px-6 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-200 transition-all">Cancelar</button>
                <button 
                  type="submit" 
                  disabled={processing}
                  className="rounded-xl bg-brand-dark px-10 py-2.5 text-sm font-semibold text-brand-lime hover:bg-brand-surface transition-all border border-brand-lime/20 shadow-lg shadow-brand-lime/5 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {processing && <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-lime/30 border-t-brand-lime" />}
                  Confirmar Registro
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {activeTab === 'registration' ? (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm">
            <div className="flex items-center gap-4">
              <h3 className="font-bold text-zinc-900 text-sm uppercase tracking-wider">Aguardando Registro e Pagamento</h3>
              <div className="flex gap-4">
                <button onClick={selectAllPending} className="text-xs font-bold text-indigo-600 hover:underline">
                  {selectedBalances.size === pendingDisplayList.filter(i => i.type === 'balance').length ? 'Desmarcar Todos' : 'Marcar Todos'}
                </button>
                <div className="flex gap-2">
                  <button 
                    onClick={copyPendingSummary} 
                    className={`text-xs font-bold flex items-center gap-1 transition-colors ${globalCopied ? 'text-green-600' : 'text-zinc-500 hover:text-zinc-900'}`}
                  >
                    {globalCopied ? <Check size={12} /> : <Copy size={12} />}
                    {globalCopied ? 'Copiado!' : 'Copiar Toda Pendência'}
                  </button>
                  {selectedBalances.size > 0 && (
                    <button 
                      onClick={copySelectedBalances}
                      className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors"
                    >
                      <Copy size={12} /> Copiar Seleção ({selectedBalances.size})
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest leading-none mb-1">Total Pendente</div>
                <div className="text-lg font-black text-red-600 tabular-nums leading-none">
                  {formatCurrency(pendingDisplayList.reduce((acc, p) => acc + p.amount, 0))}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-zinc-50 text-zinc-500 text-[10px] uppercase font-bold tracking-widest border-b border-zinc-100">
                  <tr>
                    <th className="px-6 py-4 w-12"></th>
                    <th className="px-6 py-4">Promotor / Dados PIX</th>
                    <th className="px-6 py-4 text-center">Status</th>
                    <th className="px-6 py-4 text-right">Valor</th>
                    <th className="px-6 py-4 text-right w-40">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {pendingDisplayList.map((item) => (
                    <tr 
                      key={item.id} 
                      className={`transition-colors cursor-pointer ${item.type === 'balance' && selectedBalances.has(item.promoterId) ? 'bg-indigo-50/50' : 'hover:bg-zinc-50'}`}
                      onClick={() => item.type === 'balance' && toggleBalanceSelection(item.promoterId)}
                    >
                      <td className="px-6 py-4">
                        {item.type === 'balance' ? (
                          <div className={`h-5 w-5 rounded border-2 flex items-center justify-center transition-all ${selectedBalances.has(item.promoterId) ? 'bg-indigo-600 border-indigo-600' : 'border-zinc-200'}`}>
                            {selectedBalances.has(item.promoterId) && <Check size={14} className="text-white" strokeWidth={3} />}
                          </div>
                        ) : (
                          <div className="h-5 w-5 flex items-center justify-center text-amber-500">
                            <Clock size={16} />
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-600 font-black text-xs border border-zinc-200 shrink-0">
                            {(item.promoter?.name || '??').split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-zinc-900 leading-tight">{item.promoter?.name || '---'}</div>
                            <div className="text-[10px] text-zinc-400 font-medium">
                              {item.type === 'advance' ? (
                                <span className="text-indigo-600 font-bold uppercase tracking-widest">{formatDate(new Date(item.date + 'T12:00:00'))} • Adiantamento</span>
                              ) : (
                                <span>CPF: {item.promoter?.document} • PIX: {item.promoter?.pixKey}</span>
                              )}
                            </div>
                            {getWeeklyTotalPaid(item.promoterId) > 0 && (
                              <div className="text-[9px] text-emerald-600 font-black bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-lg w-fit mt-1 shadow-sm uppercase tracking-wider">
                                Já Recebeu: {formatCurrency(getWeeklyTotalPaid(item.promoterId))}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider border bg-amber-50 text-amber-600 border-amber-100">
                          PENDENTE - AGUARDANDO
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-black text-red-600 tabular-nums">
                        {formatCurrency(item.amount)}
                      </td>
                      <td className="px-6 py-4 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-end gap-2">
                          {!readOnly && (
                            item.type === 'balance' ? (
                              <div className="flex gap-2">
                                <button 
                                  disabled={processing}
                                  onClick={() => handleSingleRegister(item.promoterId)}
                                  className="bg-zinc-100 text-zinc-600 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase hover:bg-zinc-200 transition-all shadow-sm border border-zinc-200"
                                >
                                  Registrar
                                </button>
                                <button 
                                  disabled={processing}
                                  onClick={() => handleSinglePay(item.promoterId)}
                                  className="bg-zinc-900 text-brand-lime px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-zinc-800 disabled:opacity-50 transition-all shadow-sm"
                                >
                                  Quitar
                                </button>
                              </div>
                            ) : (
                              <button 
                                disabled={processing}
                                onClick={() => handleToggleStatus(item.advance)}
                                className="bg-brand-lime text-brand-dark px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-opacity-90 disabled:opacity-50 transition-all shadow-sm border border-brand-dark/10 flex items-center gap-2"
                              >
                                <DollarSign size={12} /> Pagar Agora
                              </button>
                            )
                          )}
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              if (item.promoter) copyIndividual(e, item.promoter, item.amount);
                            }}
                            className={`p-2 rounded-lg transition-all ${copiedId === item.id ? 'text-green-600 bg-green-50' : 'text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100'}`}
                          >
                            {copiedId === item.id ? <Check size={16} /> : <Copy size={16} />}
                          </button>
                          {!readOnly && item.type === 'advance' && (
                            <button 
                              onClick={() => deleteAdvance(item.advance)}
                              className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {pendingDisplayList.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-zinc-500 font-medium italic">
                        Não há registros ou pagamentos pendentes.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm">
            <div className="flex items-center gap-4">
              <h3 className="font-bold text-zinc-900 text-sm uppercase tracking-wider">Histórico de Movimentações</h3>
              <div className="h-8 w-px bg-zinc-100 hidden md:block" />
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest leading-none">Total Quitados</span>
                <span className="text-sm font-black text-brand-lime bg-brand-dark px-2 rounded-lg mt-0.5">{formatCurrency(totalsSummary.paid)}</span>
              </div>
              <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{selectedAdvances.size} selecionados</div>
            </div>
            
            <div className="flex items-center gap-2">
              <button 
                onClick={copyWeeklyPaidReport}
                className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl font-bold text-xs hover:bg-indigo-100 transition-all border border-indigo-200 flex items-center gap-2"
              >
                <Copy size={14} /> Relatório de Pagos
              </button>
              {promoters.some(p => getPendingBalance(p.id) > 0.01) && (
                <button 
                  onClick={registerAllWeeklyAdvances}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold text-xs hover:bg-indigo-700 shadow-sm"
                >
                  Registrar Tudo
                </button>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-zinc-50 text-zinc-500 text-[10px] uppercase font-bold tracking-widest border-b border-zinc-100">
                  <tr>
                    <th className="px-6 py-4 w-12"></th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Promotor / Data</th>
                    <th className="px-6 py-4 text-right">Valor</th>
                    <th className="px-6 py-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {advances.map(advance => (
                    <tr 
                      key={advance.id} 
                      className={`hover:bg-zinc-50 transition-colors cursor-pointer ${selectedAdvances.has(advance.id) ? 'bg-indigo-50/50' : ''}`}
                      onClick={() => {
                        setSelectedAdvances(prev => {
                          const next = new Set(prev);
                          if (next.has(advance.id)) next.delete(advance.id);
                          else next.add(advance.id);
                          return next;
                        });
                      }}
                    >
                      <td className="px-6 py-4">
                        <div className={`h-4 w-4 rounded border flex items-center justify-center transition-all ${selectedAdvances.has(advance.id) ? 'bg-indigo-600 border-indigo-600' : 'border-zinc-200'}`}>
                          {selectedAdvances.has(advance.id) && <Check size={12} className="text-white" strokeWidth={3} />}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-zinc-50 flex items-center justify-center text-zinc-400 font-black text-xs border border-zinc-100 shrink-0">
                            {(advance.promoterName || '??').split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-zinc-900 leading-tight">{advance.promoterName}</div>
                            <div className="text-[10px] text-zinc-400 font-medium">#{advance.id.substring(0, 8)} • {new Date(advance.date + 'T12:00:00').toLocaleDateString('pt-BR')}</div>
                            <div className="text-[9px] text-zinc-500 font-bold mt-1 uppercase tracking-wider">
                              Cota: {formatCurrency(advance.amount)} • Total Pago: {formatCurrency(getTotalPaid(advance.promoterId))}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider border ${
                          advance.status === 'paid' 
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                            : 'bg-amber-50 text-amber-600 border-amber-100'
                        }`}>
                          {advance.status === 'paid' ? 'Efetivado' : 'Aguardando'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-black text-zinc-900 tabular-nums">
                        {formatCurrency(advance.amount)}
                      </td>
                      <td className="px-6 py-4 text-right" onClick={e => e.stopPropagation()}>
                        {!readOnly && (
                          <div className="flex justify-end gap-2 text-zinc-900">
                            {advance.status === 'pending' ? (
                              <button 
                                disabled={processing}
                                onClick={() => handleToggleStatus(advance)}
                                className="bg-brand-lime text-brand-dark px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-opacity-90 disabled:opacity-50 transition-all shadow-sm border border-brand-dark/10 flex items-center gap-2"
                              >
                                <DollarSign size={12} /> Pagar Agora
                              </button>
                            ) : (
                              <button 
                                disabled={processing}
                                onClick={() => handleToggleStatus(advance)}
                                className="p-1 px-3 text-[10px] font-bold border border-zinc-200 rounded-lg hover:bg-zinc-50 disabled:opacity-50 flex items-center gap-2"
                              >
                                {processing ? <div className="h-2 w-2 animate-spin rounded-full border border-zinc-900/30 border-t-zinc-900" /> : null}
                                Estornar
                              </button>
                            )}
                            <button 
                              disabled={processing}
                              onClick={() => deleteAdvance(advance)}
                              className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                              title="Excluir"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {advances.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-zinc-500 font-medium italic">
                        Nenhum adiantamento no histórico.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Bar */}
      <AnimatePresence>
        {(selectedBalances.size > 0 || selectedAdvances.size > 0) && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl px-4"
          >
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-2xl flex items-center justify-between gap-6">
              <div className="flex items-center gap-4 pl-2">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Selecionados</span>
                  <span className="text-brand-lime font-black text-lg leading-none">
                    {activeTab === 'registration' ? selectedBalances.size : selectedAdvances.size} Itens
                  </span>
                </div>
                <div className="h-8 w-px bg-zinc-800" />
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Total</span>
                  <span className="text-white font-black text-lg leading-none tabular-nums">
                    {formatCurrency(
                      activeTab === 'registration' 
                        ? pendingDisplayList.filter(p => p.type === 'balance' && selectedBalances.has(p.promoterId)).reduce((acc, p) => acc + p.amount, 0)
                        : advances.filter(a => selectedAdvances.has(a.id)).reduce((acc, a) => acc + a.amount, 0)
                    )}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {activeTab === 'registration' ? (
                  <div className="flex gap-2">
                    <button 
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        registerSelected('pending');
                      }}
                      disabled={processing}
                      className="px-4 py-2.5 rounded-xl bg-zinc-800 text-white font-bold text-sm hover:bg-zinc-700 transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                      {processing && <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
                      Registrar Selecionados
                    </button>
                    <button 
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        registerSelected('paid');
                      }}
                      disabled={processing}
                      className="px-6 py-2.5 rounded-xl bg-brand-lime text-zinc-900 font-black text-sm hover:scale-105 active:scale-95 transition-all flex items-center gap-2 shadow-lg shadow-brand-lime/20 disabled:opacity-50"
                    >
                      {processing ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-900/30 border-t-zinc-900" /> : <DollarSign size={18} />}
                      Quitar Selecionados
                    </button>
                  </div>
                ) : (
                  <>
                    <button 
                      onClick={() => updateBatchStatus('pending')}
                      className="px-4 py-2.5 rounded-xl bg-amber-500/20 text-amber-500 font-bold text-sm hover:bg-amber-500/30 transition-all"
                    >
                      Marcar Registrados
                    </button>
                    <button 
                      onClick={() => updateBatchStatus('paid')}
                      className="px-4 py-2.5 rounded-xl bg-green-500/20 text-green-500 font-bold text-sm hover:bg-green-500/30 transition-all"
                    >
                      Marcar Quitados
                    </button>
                    <button 
                      onClick={deleteBatchAdvances}
                      className="p-2.5 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-all"
                    >
                      <Trash2 size={20} />
                    </button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

