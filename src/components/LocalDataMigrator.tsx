/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc, getDocs, query, limit } from 'firebase/firestore';
import { 
  Database, 
  AlertCircle, 
  CheckCircle2, 
  RefreshCw, 
  Sparkles, 
  DatabaseZap, 
  Download, 
  Upload, 
  FileText, 
  Trash2, 
  ArrowRight,
  Settings,
  X,
  History
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Promoter, Employee, Attendance, Advance } from '../types';

interface LocalDataMigratorProps {
  existingPromoters: Promoter[];
}

export function LocalDataMigrator({ existingPromoters }: LocalDataMigratorProps) {
  const [localData, setLocalData] = useState<{
    promoters: any[];
    attendance: any[];
    advances: any[];
    employees: any[];
    absences: any[];
    employeeAdvances: any[];
    source: 'raw' | 'backup' | 'dismissed' | 'none';
  } | null>(null);

  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationStep, setMigrationStep] = useState<string>('');
  const [migrationSuccess, setMigrationSuccess] = useState(false);
  const [progress, setProgress] = useState(0);
  
  // Advanced panel state
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [manualJson, setManualJson] = useState('');
  const [manualParseError, setManualParseError] = useState<string | null>(null);
  const [parsedManualData, setParsedManualData] = useState<any | null>(null);
  const [allKeys, setAllKeys] = useState<{ key: string; length: number; preview: string }[]>([]);

  const LOCAL_KEYS = {
    promoters: ['promoters', 'promoter_list', 'local_promoters'],
    attendance: ['allAttendance', 'attendance', 'attendances', 'local_attendance', 'attendanceData'],
    advances: ['allAdvances', 'advances', 'local_advances', 'advancesMap'],
    employees: ['employees', 'employee_list', 'local_employees'],
    absences: ['allAbsences', 'absences', 'local_absences', 'employee_absences'],
    employeeAdvances: ['allEmployeeAdvances', 'employeeAdvances', 'employee_advances', 'local_employee_advances']
  };

  const tryParseData = (value: string | null): any[] => {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
      if (typeof parsed === 'object' && parsed !== null) {
        const values = Object.values(parsed);
        if (values.every(v => Array.isArray(v))) {
          return values.flat();
        }
        return values;
      }
      return [];
    } catch {
      return [];
    }
  };

  const scanLocalStorage = () => {
    // 1. Scan for raw keys first
    const found = {
      promoters: [] as any[],
      attendance: [] as any[],
      advances: [] as any[],
      employees: [] as any[],
      absences: [] as any[],
      employeeAdvances: [] as any[],
      source: 'raw' as 'raw' | 'backup' | 'dismissed' | 'none'
    };

    let hasRaw = false;
    for (const k of LOCAL_KEYS.promoters) {
      const data = tryParseData(localStorage.getItem(k));
      if (data.length > 0) { found.promoters = data; hasRaw = true; break; }
    }
    for (const k of LOCAL_KEYS.attendance) {
      const data = tryParseData(localStorage.getItem(k));
      if (data.length > 0) { found.attendance = data; hasRaw = true; break; }
    }
    for (const k of LOCAL_KEYS.advances) {
      const data = tryParseData(localStorage.getItem(k));
      if (data.length > 0) { found.advances = data; hasRaw = true; break; }
    }
    for (const k of LOCAL_KEYS.employees) {
      const data = tryParseData(localStorage.getItem(k));
      if (data.length > 0) { found.employees = data; hasRaw = true; break; }
    }
    for (const k of LOCAL_KEYS.absences) {
      const data = tryParseData(localStorage.getItem(k));
      if (data.length > 0) { found.absences = data; hasRaw = true; break; }
    }
    for (const k of LOCAL_KEYS.employeeAdvances) {
      const data = tryParseData(localStorage.getItem(k));
      if (data.length > 0) { found.employeeAdvances = data; hasRaw = true; break; }
    }

    if (hasRaw) {
      found.source = 'raw';
      setLocalData(found);
      return;
    }

    // 2. Scan for active backups
    const activeBackup = localStorage.getItem('rapidaocred_local_backup');
    if (activeBackup) {
      try {
        const parsedBackup = JSON.parse(activeBackup);
        const backupData = {
          promoters: tryParseData(parsedBackup.promoters || parsedBackup.promoter_list || parsedBackup.local_promoters),
          attendance: tryParseData(parsedBackup.allAttendance || parsedBackup.attendance || parsedBackup.attendances || parsedBackup.local_attendance),
          advances: tryParseData(parsedBackup.allAdvances || parsedBackup.advances || parsedBackup.local_advances || parsedBackup.advancesMap),
          employees: tryParseData(parsedBackup.employees || parsedBackup.employee_list || parsedBackup.local_employees),
          absences: tryParseData(parsedBackup.allAbsences || parsedBackup.absences || parsedBackup.local_absences),
          employeeAdvances: tryParseData(parsedBackup.allEmployeeAdvances || parsedBackup.employeeAdvances),
          source: 'backup' as const
        };
        const hasBackupData = Object.values(backupData).some(val => Array.isArray(val) && val.length > 0);
        if (hasBackupData) {
          setLocalData(backupData);
          return;
        }
      } catch (e) {
        console.error("Failed to parse local backup key", e);
      }
    }

    // 3. Scan for dismissed backup keys
    const dismissedBackup = localStorage.getItem('rapidaocred_local_backup_dismissed');
    if (dismissedBackup) {
      try {
        const parsedBackup = JSON.parse(dismissedBackup);
        const backupData = {
          promoters: tryParseData(parsedBackup.promoters || parsedBackup.promoter_list || parsedBackup.local_promoters),
          attendance: tryParseData(parsedBackup.allAttendance || parsedBackup.attendance || parsedBackup.attendances || parsedBackup.local_attendance),
          advances: tryParseData(parsedBackup.allAdvances || parsedBackup.advances || parsedBackup.local_advances || parsedBackup.advancesMap),
          employees: tryParseData(parsedBackup.employees || parsedBackup.employee_list || parsedBackup.local_employees),
          absences: tryParseData(parsedBackup.allAbsences || parsedBackup.absences || parsedBackup.local_absences),
          employeeAdvances: tryParseData(parsedBackup.allEmployeeAdvances || parsedBackup.employeeAdvances),
          source: 'dismissed' as const
        };
        const hasBackupData = Object.values(backupData).some(val => Array.isArray(val) && val.length > 0);
        if (hasBackupData) {
          setLocalData(backupData);
          return;
        }
      } catch (e) {
        console.error("Failed to parse dismissed backup", e);
      }
    }

    setLocalData(null);
  };

  const loadAllLocalStorageKeys = () => {
    const keys: { key: string; length: number; preview: string }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const val = localStorage.getItem(key) || '';
        keys.push({
          key,
          length: val.length,
          preview: val.substring(0, 80) + (val.length > 80 ? '...' : '')
        });
      }
    }
    setAllKeys(keys);
  };

  useEffect(() => {
    scanLocalStorage();
    loadAllLocalStorageKeys();
  }, []);

  const handleMigrateData = async (targetData: typeof localData) => {
    if (!targetData) return;
    setIsMigrating(true);
    setProgress(10);

    try {
      const promoterIdMap: Record<string, string> = {};
      const employeeIdMap: Record<string, string> = {};

      // 1. Migrate Promoters
      if (targetData.promoters.length > 0) {
        setMigrationStep('Migrando Promotores...');
        let count = 0;
        for (const p of targetData.promoters) {
          if (!p.name) continue;
          
          const existing = existingPromoters.find(ep => 
            ep.document === p.document || ep.name.trim().toLowerCase() === p.name.trim().toLowerCase()
          );

          if (existing) {
            promoterIdMap[p.id || p.name] = existing.id;
          } else {
            const docRef = await addDoc(collection(db, 'promoters'), {
              name: p.name,
              document: p.document || '',
              pixKey: p.pixKey || '',
              pixKeyType: p.pixKeyType || 'CPF',
              phoneNumber: p.phoneNumber || '',
              defaultDailyRate: Number(p.defaultDailyRate || p.dailyRate) || 100,
              active: p.active !== undefined ? p.active : true,
              team: p.team || 'flash',
              createdAt: p.createdAt || new Date().toISOString(),
              updatedAt: p.updatedAt || new Date().toISOString()
            });
            promoterIdMap[p.id || p.name] = docRef.id;
          }
          count++;
          setProgress(10 + Math.floor((count / targetData.promoters.length) * 20));
        }
      }

      // 2. Migrate Promoter Attendance
      if (targetData.attendance.length > 0) {
        setMigrationStep('Migrando Presenças dos Promotores...');
        let count = 0;
        for (const a of targetData.attendance) {
          const newPromoterId = promoterIdMap[a.promoterId] || a.promoterId;
          if (!newPromoterId || !a.date || !a.status) continue;

          await addDoc(collection(db, 'promoters', newPromoterId, 'attendance'), {
            promoterId: newPromoterId,
            date: a.date,
            status: a.status,
            paymentStatus: a.paymentStatus || 'pending',
            dailyRate: Number(a.dailyRate) || 100,
            recordedAt: a.recordedAt || new Date().toISOString()
          });
          count++;
          setProgress(30 + Math.floor((count / targetData.attendance.length) * 20));
        }
      }

      // 3. Migrate Promoter Advances
      if (targetData.advances.length > 0) {
        setMigrationStep('Migrando Adiantamentos dos Promotores...');
        let count = 0;
        for (const adv of targetData.advances) {
          const newPromoterId = promoterIdMap[adv.promoterId] || adv.promoterId;
          if (!newPromoterId || !adv.date || !adv.amount) continue;

          await addDoc(collection(db, 'promoters', newPromoterId, 'advances'), {
            promoterId: newPromoterId,
            amount: Number(adv.amount),
            date: adv.date,
            status: adv.status || 'pending',
            notes: adv.notes || ''
          });
          count++;
          setProgress(50 + Math.floor((count / targetData.advances.length) * 15));
        }
      }

      // 4. Migrate Employees
      if (targetData.employees.length > 0) {
        setMigrationStep('Migrando Funcionários Mensalistas...');
        let count = 0;
        for (const e of targetData.employees) {
          if (!e.name) continue;

          const q = query(collection(db, 'employees'), limit(50));
          const snapshot = await getDocs(q);
          const onlineEmployees = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee));
          
          const existing = onlineEmployees.find(ee => 
            ee.document === e.document || ee.name.trim().toLowerCase() === e.name.trim().toLowerCase()
          );

          if (existing) {
            employeeIdMap[e.id || e.name] = existing.id;
          } else {
            const docRef = await addDoc(collection(db, 'employees'), {
              name: e.name,
              document: e.document || '',
              pixKey: e.pixKey || '',
              pixKeyType: e.pixKeyType || 'CPF',
              phoneNumber: e.phoneNumber || '',
              baseSalary: Number(e.baseSalary) || 0,
              active: e.active !== undefined ? e.active : true,
              team: e.team || 'flash',
              createdAt: e.createdAt || new Date().toISOString(),
              updatedAt: e.updatedAt || new Date().toISOString()
            });
            employeeIdMap[e.id || e.name] = docRef.id;
          }
          count++;
          setProgress(65 + Math.floor((count / targetData.employees.length) * 15));
        }
      }

      // 5. Migrate Employee Absences
      if (targetData.absences.length > 0) {
        setMigrationStep('Migrando Faltas dos Funcionários...');
        let count = 0;
        for (const ab of targetData.absences) {
          const newEmployeeId = employeeIdMap[ab.employeeId] || ab.employeeId;
          if (!newEmployeeId || !ab.date) continue;

          await addDoc(collection(db, 'employees', newEmployeeId, 'absences'), {
            employeeId: newEmployeeId,
            date: ab.date,
            discount: Number(ab.discount) || 0,
            reason: ab.reason || '',
            recordedAt: ab.recordedAt || new Date().toISOString()
          });
          count++;
          setProgress(80 + Math.floor((count / targetData.absences.length) * 10));
        }
      }

      // 6. Migrate Employee Advances
      if (targetData.employeeAdvances.length > 0) {
        setMigrationStep('Migrando Adiantamentos dos Funcionários...');
        let count = 0;
        for (const ea of targetData.employeeAdvances) {
          const newEmployeeId = employeeIdMap[ea.employeeId] || ea.employeeId;
          if (!newEmployeeId || !ea.date || !ea.amount) continue;

          await addDoc(collection(db, 'employees', newEmployeeId, 'advances'), {
            employeeId: newEmployeeId,
            amount: Number(ea.amount),
            date: ea.date,
            status: ea.status || 'pending',
            notes: ea.notes || '',
            recordedAt: ea.recordedAt || new Date().toISOString()
          });
          count++;
          setProgress(90 + Math.floor((count / targetData.employeeAdvances.length) * 10));
        }
      }

      setProgress(100);
      setMigrationStep('Migração concluída com sucesso!');
      setMigrationSuccess(true);

      // Clean up keys and save backup
      const backup: Record<string, any> = {};
      Object.entries(LOCAL_KEYS).forEach(([type, keys]) => {
        keys.forEach(key => {
          const val = localStorage.getItem(key);
          if (val) {
            backup[key] = val;
            localStorage.removeItem(key);
          }
        });
      });
      localStorage.setItem('rapidaocred_local_backup', JSON.stringify(backup));
      
      setTimeout(() => {
        setIsMigrating(false);
        setLocalData(null);
        window.location.reload(); // Reload to refresh all list listeners from Firestore
      }, 2000);

    } catch (err) {
      console.error('Migration error:', err);
      setMigrationStep('Erro durante a migração. Verifique sua conexão.');
      setIsMigrating(false);
    }
  };

  const handleDismiss = () => {
    const backup: Record<string, any> = {};
    Object.entries(LOCAL_KEYS).forEach(([type, keys]) => {
      keys.forEach(key => {
        const val = localStorage.getItem(key);
        if (val) {
          backup[key] = val;
          localStorage.removeItem(key);
        }
      });
    });
    localStorage.setItem('rapidaocred_local_backup_dismissed', JSON.stringify(backup));
    setLocalData(null);
  };

  // Manual Paste JSON parsing
  const handleManualJsonChange = (val: string) => {
    setManualJson(val);
    setManualParseError(null);
    setParsedManualData(null);

    if (!val.trim()) return;

    try {
      const parsed = JSON.parse(val);
      const output = {
        promoters: tryParseData(parsed.promoters || parsed.promoter_list || parsed.local_promoters),
        attendance: tryParseData(parsed.allAttendance || parsed.attendance || parsed.attendances || parsed.local_attendance || parsed.attendanceData),
        advances: tryParseData(parsed.allAdvances || parsed.advances || parsed.local_advances || parsed.advancesMap),
        employees: tryParseData(parsed.employees || parsed.employee_list || parsed.local_employees),
        absences: tryParseData(parsed.allAbsences || parsed.absences || parsed.local_absences || parsed.absencesList),
        employeeAdvances: tryParseData(parsed.allEmployeeAdvances || parsed.employeeAdvances || parsed.local_employee_advances)
      };

      const hasContent = Object.values(output).some(arr => arr.length > 0);
      if (!hasContent) {
        setManualParseError('JSON válido, mas nenhum dado compatível de equipe, presença ou adiantamento foi encontrado.');
        return;
      }

      setParsedManualData(output);
    } catch (e: any) {
      setManualParseError(`JSON inválido: ${e.message}`);
    }
  };

  const handleManualImport = async () => {
    if (!parsedManualData) return;
    await handleMigrateData({
      ...parsedManualData,
      source: 'raw'
    });
  };

  // Export current online database as a backup file
  const handleExportOnlineData = async () => {
    try {
      const backupObj: Record<string, any> = {
        exportedAt: new Date().toISOString(),
        promoters: [],
        employees: []
      };

      // 1. Fetch promoters
      const promSnap = await getDocs(collection(db, 'promoters'));
      const promotersList = promSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      backupObj.promoters = promotersList;

      // Subcollections of promoters
      const attendanceList: any[] = [];
      const advancesList: any[] = [];

      for (const p of promotersList) {
        const attSnap = await getDocs(collection(db, 'promoters', p.id, 'attendance'));
        attSnap.docs.forEach(doc => {
          attendanceList.push({ id: doc.id, promoterId: p.id, ...doc.data() });
        });

        const advSnap = await getDocs(collection(db, 'promoters', p.id, 'advances'));
        advSnap.docs.forEach(doc => {
          advancesList.push({ id: doc.id, promoterId: p.id, ...doc.data() });
        });
      }
      backupObj.allAttendance = attendanceList;
      backupObj.allAdvances = advancesList;

      // 2. Fetch employees
      const empSnap = await getDocs(collection(db, 'employees'));
      const employeesList = empSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      backupObj.employees = employeesList;

      // Subcollections of employees
      const absencesList: any[] = [];
      const empAdvancesList: any[] = [];

      for (const e of employeesList) {
        const absSnap = await getDocs(collection(db, 'employees', e.id, 'absences'));
        absSnap.docs.forEach(doc => {
          absencesList.push({ id: doc.id, employeeId: e.id, ...doc.data() });
        });

        const advSnap = await getDocs(collection(db, 'employees', e.id, 'advances'));
        advSnap.docs.forEach(doc => {
          empAdvancesList.push({ id: doc.id, employeeId: e.id, ...doc.data() });
        });
      }
      backupObj.allAbsences = absencesList;
      backupObj.allEmployeeAdvances = empAdvancesList;

      // Download file
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupObj, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `rapidaocred_backup_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

    } catch (err) {
      console.error("Failed to export database backup", err);
      alert("Erro ao exportar backup de dados.");
    }
  };

  const clearLocalStorageBackup = () => {
    if (confirm('Tem certeza de que deseja limpar os backups locais armazenados? Esta ação é irreversível.')) {
      localStorage.removeItem('rapidaocred_local_backup');
      localStorage.removeItem('rapidaocred_local_backup_dismissed');
      scanLocalStorage();
      loadAllLocalStorageKeys();
    }
  };

  const totalItems = localData ? (
    localData.promoters.length + 
    localData.attendance.length + 
    localData.advances.length + 
    localData.employees.length + 
    localData.absences.length + 
    localData.employeeAdvances.length
  ) : 0;

  return (
    <div className="space-y-6">
      {/* 1. Main local data detection banner */}
      <AnimatePresence>
        {localData && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 via-white to-sky-50 p-6 shadow-md"
          >
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="flex gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/25 animate-bounce">
                  <DatabaseZap size={24} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-zinc-900 flex items-center gap-2">
                    Restaurar Dados Anteriores Detectados 
                    {localData.source !== 'raw' && (
                      <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                        <History size={10} /> Recuperado do Backup
                      </span>
                    )}
                    <Sparkles size={16} className="text-amber-500 animate-pulse" />
                  </h3>
                  <p className="mt-1 text-sm font-medium text-zinc-600 max-w-xl">
                    Encontramos <span className="font-bold text-indigo-600">{totalItems} registros</span> salvos localmente neste navegador (promotores, equipes, presenças ou adiantamentos). Deseja restaurá-los e colocá-los no Banco de Dados online?
                  </p>
                  
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-zinc-500">
                    {localData.promoters.length > 0 && (
                      <span className="bg-indigo-100/50 text-indigo-700 px-2 py-0.5 rounded-lg">
                        👥 {localData.promoters.length} Promotores/Equipes
                      </span>
                    )}
                    {(localData.attendance.length > 0 || localData.advances.length > 0) && (
                      <span className="bg-indigo-100/50 text-indigo-700 px-2 py-0.5 rounded-lg">
                        💰 {localData.attendance.length} Presenças / {localData.advances.length} Adiantamentos
                      </span>
                    )}
                    {localData.employees.length > 0 && (
                      <span className="bg-sky-100/50 text-sky-700 px-2 py-0.5 rounded-lg">
                        👔 {localData.employees.length} Mensalistas
                      </span>
                    )}
                    {(localData.absences.length > 0 || localData.employeeAdvances.length > 0) && (
                      <span className="bg-sky-100/50 text-sky-700 px-2 py-0.5 rounded-lg">
                        📊 {localData.absences.length + localData.employeeAdvances.length} Registros Mensalistas
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 gap-3 w-full md:w-auto">
                {migrationSuccess ? (
                  <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 px-4 py-2.5 rounded-xl text-sm font-bold w-full md:w-auto justify-center shadow-sm animate-pulse">
                    <CheckCircle2 size={18} />
                    Importado com sucesso!
                  </div>
                ) : isMigrating ? (
                  <div className="flex flex-col items-center gap-2 w-full md:w-60">
                    <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs animate-pulse">
                      <RefreshCw size={14} className="animate-spin" />
                      {migrationStep}
                    </div>
                    <div className="w-full h-2 bg-indigo-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-600 transition-all duration-300" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 w-full md:w-auto">
                    <button
                      onClick={handleDismiss}
                      className="flex-1 md:flex-none px-4 py-2.5 text-xs font-bold text-zinc-500 hover:text-zinc-800 transition-colors"
                    >
                      Descartar
                    </button>
                    <button
                      onClick={() => handleMigrateData(localData)}
                      className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white transition-all hover:bg-indigo-700 shadow-md shadow-indigo-600/15 hover:shadow-indigo-600/25 active:scale-95"
                    >
                      <Database size={16} />
                      Importar para Nuvem
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. Control panel toggler */}
      <div className="flex items-center justify-between bg-zinc-50 border border-zinc-100 p-4 rounded-xl">
        <div className="flex items-center gap-3">
          <Settings size={20} className="text-zinc-500" />
          <div>
            <h4 className="text-sm font-extrabold text-zinc-800">
              Gerenciador de Backups e Recuperação de Dados
            </h4>
            <p className="text-xs font-semibold text-zinc-500">
              Ferramentas avançadas para recuperar dados locais antigos, importar backups ou exportar o banco.
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-xs font-extrabold text-indigo-600 hover:text-indigo-800 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-all"
        >
          {showAdvanced ? 'Ocultar Opções' : 'Mostrar Opções'}
        </button>
      </div>

      {/* 3. Expandable advanced features */}
      <AnimatePresence>
        {showAdvanced && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border border-zinc-200 bg-white rounded-2xl shadow-sm p-6 space-y-6"
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* Left Column: Actions and Exports */}
              <div className="space-y-6">
                <div>
                  <h4 className="text-sm font-bold text-zinc-900 mb-2 flex items-center gap-2">
                    <Download size={16} className="text-emerald-600" />
                    Exportar Banco de Dados Atual
                  </h4>
                  <p className="text-xs font-medium text-zinc-500 mb-3">
                    Gere e faça download de um arquivo de backup (.json) contendo todos os promotores, mensalistas, presenças e adiantamentos atuais na nuvem.
                  </p>
                  <button
                    onClick={handleExportOnlineData}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white transition-all shadow-sm active:scale-95"
                  >
                    <Download size={14} />
                    Exportar Backup da Nuvem
                  </button>
                </div>

                <hr className="border-zinc-100" />

                <div>
                  <h4 className="text-sm font-bold text-zinc-900 mb-2 flex items-center gap-2">
                    <History size={16} className="text-indigo-600" />
                    Varredura e Restauração de Backups Locais
                  </h4>
                  <p className="text-xs font-medium text-zinc-500 mb-3">
                    Tente recuperar dados locais caso tenha descartado a notificação principal anteriormente.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={scanLocalStorage}
                      className="inline-flex items-center gap-2 border border-zinc-200 hover:bg-zinc-50 px-4 py-2.5 rounded-xl text-xs font-bold text-zinc-700 transition-all"
                    >
                      <RefreshCw size={14} />
                      Buscar Novamente
                    </button>
                    
                    {(localStorage.getItem('rapidaocred_local_backup') || localStorage.getItem('rapidaocred_local_backup_dismissed')) && (
                      <button
                        onClick={clearLocalStorageBackup}
                        className="inline-flex items-center gap-2 border border-red-200 hover:bg-red-50 text-red-600 px-4 py-2.5 rounded-xl text-xs font-bold transition-all"
                      >
                        <Trash2 size={14} />
                        Limpar Backup Local
                      </button>
                    )}
                  </div>
                </div>

                <hr className="border-zinc-100" />

                <div>
                  <h4 className="text-sm font-bold text-zinc-800 mb-2">
                    Chaves no LocalStorage Atual
                  </h4>
                  <div className="max-h-40 overflow-y-auto border border-zinc-100 rounded-xl divide-y divide-zinc-50 text-[11px] font-mono">
                    {allKeys.length === 0 ? (
                      <p className="p-3 text-zinc-400 italic">Nenhuma chave encontrada.</p>
                    ) : (
                      allKeys.map(k => (
                        <div key={k.key} className="p-2 flex justify-between gap-4 hover:bg-zinc-50">
                          <span className="font-semibold text-indigo-900 shrink-0">{k.key}</span>
                          <span className="text-zinc-500 truncate text-right">{k.preview} ({k.length} bytes)</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Manual JSON Import */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                  <Upload size={16} className="text-indigo-600" />
                  Importar Manualmente via JSON
                </h4>
                <p className="text-xs font-medium text-zinc-500">
                  Se você possui um backup em formato JSON (antigo ou baixado), cole-o no campo de texto abaixo para analisar e importar de volta ao banco de dados na nuvem.
                </p>

                <textarea
                  value={manualJson}
                  onChange={(e) => handleManualJsonChange(e.target.value)}
                  placeholder='Cole aqui seu JSON de backup (Ex: {"promoters": [...], "attendance": [...]})'
                  className="w-full h-40 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs font-mono text-zinc-800 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all resize-none"
                />

                {manualParseError && (
                  <div className="text-xs font-bold text-red-600 bg-red-50 border border-red-100 rounded-lg p-3 flex gap-2">
                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    <span>{manualParseError}</span>
                  </div>
                )}

                {parsedManualData && (
                  <motion.div 
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 text-xs font-bold text-zinc-700 space-y-3"
                  >
                    <p className="text-indigo-900">Backup Carregado com Sucesso! Conteúdo detectado:</p>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-600">
                      <div>👥 Promotores: {parsedManualData.promoters.length}</div>
                      <div>📅 Presenças: {parsedManualData.attendance.length}</div>
                      <div>💸 Adiantamentos: {parsedManualData.advances.length}</div>
                      <div>👔 Mensalistas: {parsedManualData.employees.length}</div>
                      <div>📋 Faltas Mensalistas: {parsedManualData.absences.length}</div>
                      <div>💰 Adiantamentos Mensalistas: {parsedManualData.employeeAdvances.length}</div>
                    </div>
                    
                    <button
                      onClick={handleManualImport}
                      disabled={isMigrating}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-4 py-2.5 text-xs font-bold text-white transition-all shadow-sm active:scale-95"
                    >
                      {isMigrating ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" />
                          Importando...
                        </>
                      ) : (
                        <>
                          <Database size={14} />
                          Salvar Dados Carregados na Nuvem
                        </>
                      )}
                    </button>
                  </motion.div>
                )}
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
