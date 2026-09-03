/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  CalendarDays, 
  Wallet, 
  Plus, 
  LogOut, 
  Search,
  LayoutDashboard,
  CheckCircle2,
  XCircle,
  Clock,
  Menu,
  X,
  FileBarChart,
  Briefcase,
  UserCog,
  Target,
  Settings,
  Eye,
  EyeOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  googleProvider, 
  auth, 
  db,
  signOut 
} from '@/src/lib/firebase';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp,
  orderBy,
  where,
  getDocs
} from 'firebase/firestore';
import { Promoter, Attendance, Advance, OperationType, AppUser } from './types';
import { handleFirestoreError, formatDate, formatCurrency } from './lib/utils';
import { AdminSecurity } from './lib/security';

// Components
import PromoterCard from './components/PromoterCard';
import PromoterModal from './components/PromoterModal';
import AttendanceTracker from './components/AttendanceTracker';
import LeadManager from './components/LeadManager';
import AdvanceManager from './components/AdvanceManager';
import PaymentReport from './components/PaymentReport';
import GoogleSheetsSync from './components/GoogleSheetsSync';
import { EmployeeManager } from './components/EmployeeManager';
import { LocalDataMigrator } from './components/LocalDataMigrator';
import UserManager from './components/UserManager';
import SettingsManager from './components/SettingsManager';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<'admin' | 'viewer'>('admin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [promoters, setPromoters] = useState<Promoter[]>([]);
  const [allAttendance, setAllAttendance] = useState<Attendance[]>([]);
  const [allAdvances, setAllAdvances] = useState<Advance[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'promoters' | 'attendance' | 'leads' | 'advances' | 'reports' | 'employees' | 'users' | 'settings'>('dashboard');
  const [isPromoterModalOpen, setIsPromoterModalOpen] = useState(false);
  const [editingPromoter, setEditingPromoter] = useState<Promoter | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<'all' | 'flash' | 'rapidao'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Lock selectedTeam if user has a team restriction
  useEffect(() => {
    if (user && user.team && user.team !== 'all') {
      setSelectedTeam(user.team);
    }
  }, [user]);

  const filteredPromoters = useMemo(() => {
    return promoters.filter(p => {
      // Team filter
      if (selectedTeam !== 'all') {
        const promoterTeam = p.team || 'flash';
        if (promoterTeam !== selectedTeam) return false;
      }
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = p.name.toLowerCase().includes(query);
        const matchesDoc = p.document.toLowerCase().includes(query);
        return matchesName || matchesDoc;
      }
      return true;
    });
  }, [promoters, selectedTeam, searchQuery]);

  const filteredAttendance = useMemo(() => {
    return allAttendance.filter(a => filteredPromoters.some(p => p.id === a.promoterId));
  }, [allAttendance, filteredPromoters]);

  const filteredAdvances = useMemo(() => {
    return allAdvances.filter(a => filteredPromoters.some(p => p.id === a.promoterId));
  }, [allAdvances, filteredPromoters]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        if (firebaseUser.isAnonymous) {
          // If anonymous, retrieve actual user and role details from localStorage
          const stored = localStorage.getItem('rapidaocred_session');
          if (stored) {
            try {
              const parsed = JSON.parse(stored);
              setUser(parsed.user);
              setUserRole(parsed.role);
            } catch {
              setUser({
                uid: 'admin-local',
                displayName: 'Administrador',
                email: 'admin@rapidao.com'
              });
              setUserRole('admin');
            }
          } else {
            setUser({
              uid: 'admin-local',
              displayName: 'Administrador',
              email: 'admin@rapidao.com'
            });
            setUserRole('admin');
          }
        } else {
          // Real Google account login
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            displayName: firebaseUser.displayName || firebaseUser.email || 'Usuário Google',
            photoURL: firebaseUser.photoURL
          });
          setUserRole('admin'); // Default google users to admin
        }
        setLoading(false);
      } else {
        // No firebase user is currently active
        // Check for local storage custom credential login
        const stored = localStorage.getItem('rapidaocred_session');
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            setUser(parsed.user);
            setUserRole(parsed.role);
            setLoading(false);
          } catch {
            localStorage.removeItem('rapidaocred_session');
            setUser(null);
            setLoading(false);
          }
        } else {
          setUser(null);
          setLoading(false);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'promoters'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promoter));
      setPromoters(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'promoters');
    });

    return () => unsubscribe();
  }, [user]);

  // Aggregate all financial data for summary
  useEffect(() => {
    if (!user || promoters.length === 0) return;

    const unsubscribes: (() => void)[] = [];

    promoters.forEach(p => {
      // Attendance
      const attendanceQ = query(collection(db, `promoters/${p.id}/attendance`));
      const unsubAttendance = onSnapshot(attendanceQ, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, promoterId: doc.data().promoterId || p.id } as Attendance));
        setAllAttendance(prev => {
          const others = prev.filter(a => a.promoterId !== p.id);
          return [...others, ...data];
        });
      });
      unsubscribes.push(unsubAttendance);

      // Advances
      const advancesQ = query(collection(db, `promoters/${p.id}/advances`));
      const unsubAdvances = onSnapshot(advancesQ, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, promoterId: doc.data().promoterId || p.id } as Advance));
        setAllAdvances(prev => {
          const others = prev.filter(a => a.promoterId !== p.id);
          return [...others, ...data];
        });
      });
      unsubscribes.push(unsubAdvances);
    });

    return () => unsubscribes.forEach(u => u());
  }, [user, promoters]);

  const financialSummary = useMemo(() => {
    const unpaidAttendance = filteredAttendance.filter(a => a.paymentStatus === 'pending');
    const totalUnpaidAmount = unpaidAttendance.reduce((sum, a) => {
      if (a.status === 'absent') return sum;
      const rate = a.dailyRate || 100;
      return sum + (a.status === 'half-day' ? rate / 2 : rate);
    }, 0);

    const pendingAdvances = filteredAdvances.filter(a => a.status === 'pending');
    const totalPendingAdvances = pendingAdvances.reduce((sum, a) => sum + a.amount, 0);

    return {
      unpaidDays: unpaidAttendance.length,
      unpaidAmount: totalUnpaidAmount,
      pendingAdvances: totalPendingAdvances,
      netBalance: totalUnpaidAmount - totalPendingAdvances
    };
  }, [filteredAttendance, filteredAdvances]);

  const handleLogin = async () => {
    setLoginError('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error("Login Error:", error);
      let errorMsg = error.message || 'Erro ao realizar login.';
      if (error.code === 'auth/unauthorized-domain' || (errorMsg && errorMsg.includes('unauthorized-domain'))) {
        errorMsg = 'Domínio não autorizado no Firebase! Por favor, acesse o Console do Firebase (Authentication > Settings > Authorized domains) e adicione o domínio atual.';
      } else if (error.code === 'auth/popup-closed-by-user') {
        errorMsg = 'A janela de autenticação foi fechada antes de concluir o login.';
      }
      setLoginError(errorMsg);
    }
  };

  const handleLogout = async () => {
    try {
      localStorage.removeItem('rapidaocred_session');
      await signOut(auth);
      setUser(null);
    } catch (error) {
      console.error("Logout Error:", error);
    }
  };

  const handleCredentialLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setIsAuthenticating(true);

    const cleanUser = username.trim().toLowerCase();
    const cleanPass = password.trim();

    try {
      // 1. Query Firestore 'users' collection
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('username', '==', cleanUser));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0];
        const userData = userDoc.data();

        // If this is the master admin user
        if (cleanUser === 'admin') {
          const isValid = await AdminSecurity.verifyAdminPassword(cleanPass, userData.password);
          if (isValid) {
            const adminUser = {
              uid: userDoc.id,
              displayName: userData.displayName || 'Administrador',
              email: `${userData.username}@rapidao.com`,
              team: userData.team || 'all'
            };

            localStorage.setItem('rapidaocred_session', JSON.stringify({
              user: adminUser,
              role: 'admin'
            }));

            setUser(adminUser);
            setUserRole('admin');
            setIsAuthenticating(false);
            return;
          } else {
            setLoginError('Senha de administrador incorreta.');
            setIsAuthenticating(false);
            return;
          }
        } else if (userData.password === cleanPass || userData.password?.trim() === cleanPass) {
          const customUser = {
            uid: userDoc.id,
            displayName: userData.displayName || userData.username,
            email: `${userData.username}@rapidao.com`,
            team: userData.team || 'all'
          };

          localStorage.setItem('rapidaocred_session', JSON.stringify({
            user: customUser,
            role: userData.role || 'viewer'
          }));

          setUser(customUser);
          setUserRole(userData.role || 'viewer');
          setIsAuthenticating(false);
          return;
        } else {
          setLoginError('Senha incorreta para o usuário informado.');
          setIsAuthenticating(false);
          return;
        }
      }

      // 3. Fallback verification for master admin
      if (cleanUser === 'admin') {
        const isValid = await AdminSecurity.verifyAdminPassword(cleanPass);
        if (isValid) {
          const adminUser = { uid: 'admin-local', displayName: 'Administrador', email: 'admin@rapidao.com', team: 'all' };
          localStorage.setItem('rapidaocred_session', JSON.stringify({ user: adminUser, role: 'admin' }));
          setUser(adminUser);
          setUserRole('admin');
          setIsAuthenticating(false);
          return;
        } else {
          setLoginError('Senha de administrador incorreta.');
          setIsAuthenticating(false);
          return;
        }
      }

      // 4. Default viewer fallback
      if ((cleanUser === 'visualizacao' || cleanUser === 'viewer' || cleanUser === 'view') && cleanPass === 'view123') {
        const viewerUser = { uid: 'viewer-local', displayName: 'Visualizador', email: 'view@rapidao.com', team: 'all' };
        localStorage.setItem('rapidaocred_session', JSON.stringify({ user: viewerUser, role: 'viewer' }));
        setUser(viewerUser);
        setUserRole('viewer');
        setIsAuthenticating(false);
        return;
      }

      setLoginError('Usuário não encontrado ou senha inválida.');
    } catch (err: any) {
      console.error('Credential login error:', err);
      setLoginError(err?.message ? `Erro técnico durante o login: ${err.message}` : 'Erro técnico durante o login.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleQuickLogin = async (role: 'admin' | 'viewer') => {
    setLoginError('');
    setIsAuthenticating(true);
    try {
      if (role === 'admin') {
        const adminUser = { uid: 'admin-local', displayName: 'Administrador (Presete)', email: 'admin@rapidao.com' };
        localStorage.setItem('rapidaocred_session', JSON.stringify({ user: adminUser, role: 'admin' }));
        setUser(adminUser);
        setUserRole('admin');
      } else {
        const viewerUser = { uid: 'viewer-local', displayName: 'Visualizador (Presete)', email: 'view@rapidao.com' };
        localStorage.setItem('rapidaocred_session', JSON.stringify({ user: viewerUser, role: 'viewer' }));
        setUser(viewerUser);
        setUserRole('viewer');
      }
    } catch (err) {
      console.error('Quick login error:', err);
      setLoginError('Erro ao realizar o login rápido.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleTogglePromoterStatus = async (promoter: Promoter) => {
    if (userRole === 'viewer') return;
    try {
      await updateDoc(doc(db, 'promoters', promoter.id), {
        active: !promoter.active,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'promoters');
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-300 border-t-zinc-900" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 p-4 font-sans">
        <div className="w-full max-w-md space-y-6 rounded-3xl bg-white p-8 shadow-xl border border-zinc-100">
          <div className="text-center space-y-2">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-dark text-brand-lime shadow-lg shadow-brand-lime/10">
              <Users size={32} />
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight text-zinc-900">RAPIDÃO CRED</h2>
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Portal de Gestão de Equipe</p>
          </div>

          <form onSubmit={handleCredentialLogin} className="space-y-4">
            {loginError && (
              <div className="rounded-xl bg-red-50 p-3.5 text-xs font-semibold text-red-800 border border-red-100 flex items-start gap-2 animate-pulse">
                <XCircle size={16} className="shrink-0 mt-0.5" />
                <span>{loginError}</span>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Usuário</label>
              <input
                type="text"
                required
                placeholder="Digite seu usuário"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm font-bold text-zinc-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Senha</label>
              <div className="relative">
                <input
                  type={showLoginPassword ? 'text' : 'password'}
                  required
                  placeholder="Digite sua senha de acesso"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 pl-4 pr-11 py-2.5 text-sm font-bold text-zinc-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword(!showLoginPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 p-1 transition-colors"
                  title={showLoginPassword ? "Ocultar senha" : "Exibir senha"}
                >
                  {showLoginPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isAuthenticating}
              className="w-full flex items-center justify-center rounded-xl bg-zinc-900 py-3 text-sm font-bold text-white transition-all hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50 shadow-md shadow-zinc-900/10"
            >
              {isAuthenticating ? 'Autenticando...' : 'Acessar Sistema'}
            </button>
          </form>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-zinc-200"></div>
            <span className="flex-shrink mx-4 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Ou autenticação direta</span>
            <div className="flex-grow border-t border-zinc-200"></div>
          </div>

          <button
            onClick={handleLogin}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-xs font-bold text-zinc-700 transition-all hover:bg-zinc-50 active:scale-[0.98]"
          >
            <img src="https://www.google.com/favicon.ico" alt="Google" className="h-4 w-4" />
            Entrar com Google (Admin)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex w-64 flex-col bg-brand-dark border-r border-brand-accent/30">
        <div className="p-6 flex items-center gap-3">
          <div className="bg-brand-lime text-brand-dark p-2 rounded-lg shadow-[0_0_15px_rgba(163,255,0,0.3)]">
            <Users size={20} />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-white tracking-tighter text-xl leading-none">RAPIDÃO</span>
            <span className="font-bold text-brand-lime tracking-[0.2em] text-[10px] leading-none mt-1">CRED</span>
          </div>
        </div>
        
        <nav className="flex-1 px-4 space-y-2 mt-4">
          <NavItem 
            active={activeTab === 'dashboard'} 
            icon={<LayoutDashboard size={20} />} 
            label="Início" 
            onClick={() => setActiveTab('dashboard')} 
          />
          <NavItem 
            active={activeTab === 'promoters'} 
            icon={<Users size={20} />} 
            label="Equipe" 
            onClick={() => setActiveTab('promoters')} 
          />
          <NavItem 
            active={activeTab === 'attendance'} 
            icon={<CalendarDays size={20} />} 
            label="Presença" 
            onClick={() => setActiveTab('attendance')} 
          />
          <NavItem 
            active={activeTab === 'leads'} 
            icon={<Target size={20} />} 
            label="Leads" 
            onClick={() => setActiveTab('leads')} 
          />
          <NavItem 
            active={activeTab === 'advances'} 
            icon={<Wallet size={20} />} 
            label="Adiantamentos" 
            onClick={() => setActiveTab('advances')} 
          />
          <NavItem 
            active={activeTab === 'employees'} 
            icon={<Briefcase size={20} />} 
            label="Funcionários" 
            onClick={() => setActiveTab('employees')} 
          />
          <NavItem 
            active={activeTab === 'reports'} 
            icon={<FileBarChart size={20} />} 
            label="Relatórios" 
            onClick={() => setActiveTab('reports')} 
          />
          {userRole === 'admin' && (
            <NavItem 
              active={activeTab === 'users'} 
              icon={<UserCog size={20} />} 
              label="Usuários" 
              onClick={() => setActiveTab('users')} 
            />
          )}
          <NavItem 
            active={activeTab === 'settings'} 
            icon={<Settings size={20} />} 
            label="Configurações" 
            onClick={() => setActiveTab('settings')} 
          />
        </nav>

        <div className="p-4 border-t border-brand-accent/20">
          <button 
            onClick={handleLogout}
            className="flex w-full items-center gap-3 px-4 py-2 text-sm font-medium text-zinc-400 hover:text-brand-lime hover:bg-brand-surface rounded-lg transition-colors"
          >
            <LogOut size={18} />
            Sair
          </button>
        </div>
      </aside>

      {/* Mobile Nav */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-brand-dark border-b border-brand-accent/30 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-brand-lime text-brand-dark p-1.5 rounded-md">
            <Users size={16} />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-white tracking-tighter text-sm leading-none">RAPIDÃO</span>
            <span className="font-bold text-brand-lime tracking-widest text-[8px] leading-none mt-0.5">CRED</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => { setEditingPromoter(null); setIsPromoterModalOpen(true); }}
            className="p-2 text-brand-lime hover:bg-brand-surface rounded-lg transition-colors"
          >
            <Plus size={20} />
          </button>
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-white">
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, x: -100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -100 }}
            className="fixed inset-0 z-40 bg-white md:hidden pt-20 px-6"
          >
            <nav className="space-y-6">
              <button onClick={() => { setActiveTab('dashboard'); setIsMobileMenuOpen(false); }} className={`flex w-full items-center gap-4 text-xl font-medium ${activeTab === 'dashboard' ? 'text-zinc-900' : 'text-zinc-400'}`}>
                <LayoutDashboard size={24} /> Dashboard
              </button>
              <button onClick={() => { setActiveTab('promoters'); setIsMobileMenuOpen(false); }} className={`flex w-full items-center gap-4 text-xl font-medium ${activeTab === 'promoters' ? 'text-zinc-900' : 'text-zinc-400'}`}>
                <Users size={24} /> Equipe
              </button>
              <button onClick={() => { setActiveTab('attendance'); setIsMobileMenuOpen(false); }} className={`flex w-full items-center gap-4 text-xl font-medium ${activeTab === 'attendance' ? 'text-zinc-900' : 'text-zinc-400'}`}>
                <CalendarDays size={24} /> Presença
              </button>
              <button onClick={() => { setActiveTab('leads'); setIsMobileMenuOpen(false); }} className={`flex w-full items-center gap-4 text-xl font-medium ${activeTab === 'leads' ? 'text-zinc-900' : 'text-zinc-400'}`}>
                <Target size={24} /> Leads
              </button>
              <button onClick={() => { setActiveTab('advances'); setIsMobileMenuOpen(false); }} className={`flex w-full items-center gap-4 text-xl font-medium ${activeTab === 'advances' ? 'text-zinc-900' : 'text-zinc-400'}`}>
                <Wallet size={24} /> Adiantamentos
              </button>
              <button onClick={() => { setActiveTab('employees'); setIsMobileMenuOpen(false); }} className={`flex w-full items-center gap-4 text-xl font-medium ${activeTab === 'employees' ? 'text-zinc-900' : 'text-zinc-400'}`}>
                <Briefcase size={24} /> Funcionários
              </button>
              <button onClick={() => { setActiveTab('reports'); setIsMobileMenuOpen(false); }} className={`flex w-full items-center gap-4 text-xl font-medium ${activeTab === 'reports' ? 'text-zinc-900' : 'text-zinc-400'}`}>
                <FileBarChart size={24} /> Relatórios
              </button>
              {userRole === 'admin' && (
                <button onClick={() => { setActiveTab('users'); setIsMobileMenuOpen(false); }} className={`flex w-full items-center gap-4 text-xl font-medium ${activeTab === 'users' ? 'text-zinc-900' : 'text-zinc-400'}`}>
                  <UserCog size={24} /> Usuários
                </button>
              )}
              <button onClick={() => { setActiveTab('settings'); setIsMobileMenuOpen(false); }} className={`flex w-full items-center gap-4 text-xl font-medium ${activeTab === 'settings' ? 'text-zinc-900' : 'text-zinc-400'}`}>
                <Settings size={24} /> Configurações
              </button>
              <div className="pt-6 border-t border-zinc-100">
                <button onClick={handleLogout} className="flex w-full items-center gap-4 text-xl font-medium text-zinc-400">
                  <LogOut size={24} /> Sair
                </button>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-12 lg:p-16 pt-24 md:pt-12 overflow-auto bg-zinc-50/50">
        <header className="mb-10 flex flex-col lg:flex-row lg:items-end justify-between gap-6 max-w-7xl mx-auto">
          <div className="space-y-4">
            <div>
              <h1 className="text-3xl font-extrabold text-zinc-900 tracking-tight lg:text-4xl">
                {activeTab === 'dashboard' && 'Visão Geral'}
                {activeTab === 'promoters' && 'Gerenciar Equipe'}
                {activeTab === 'attendance' && 'Controle de Presença'}
                {activeTab === 'leads' && 'Controle de Leads'}
                {activeTab === 'advances' && 'Adiantamentos'}
                {activeTab === 'reports' && 'Relatórios Financeiros'}
                {activeTab === 'employees' && 'Funcionários Mensalistas'}
                {activeTab === 'users' && 'Controle de Usuários'}
                {activeTab === 'settings' && 'Configurações & Ambiente'}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-zinc-500 font-medium">
                  Bem-vindo, {user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || 'Usuário'}.
                </p>
                <span className={`text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full border ${
                  userRole === 'admin' 
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  {userRole === 'admin' ? 'Administrador' : 'Somente Leitura'}
                </span>
              </div>
            </div>

            {/* Segmented control for Team Filter */}
            {activeTab !== 'employees' && activeTab !== 'users' && activeTab !== 'settings' && (
              (!user?.team || user.team === 'all') ? (
                <div className="flex bg-zinc-200/50 p-1 rounded-2xl w-fit border border-zinc-200 shadow-inner">
                  <button
                    onClick={() => setSelectedTeam('all')}
                    className={`px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                      selectedTeam === 'all'
                        ? 'bg-white text-zinc-800 shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-800'
                    }`}
                  >
                    👥 Todos
                  </button>
                  <button
                    onClick={() => setSelectedTeam('flash')}
                    className={`px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                      selectedTeam === 'flash'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-zinc-500 hover:text-indigo-600'
                    }`}
                  >
                    ⚡ Time Flash
                  </button>
                  <button
                    onClick={() => setSelectedTeam('rapidao')}
                    className={`px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                      selectedTeam === 'rapidao'
                        ? 'bg-amber-500 text-white shadow-sm'
                        : 'text-zinc-500 hover:text-amber-600'
                    }`}
                  >
                    🚀 Time Rapidão
                  </button>
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-white border border-zinc-200 text-zinc-700 font-bold text-sm shadow-sm select-none">
                  {user.team === 'flash' ? '⚡ Time Flash' : '🚀 Time Rapidão'}
                </div>
              )
            )}
          </div>

          {activeTab !== 'employees' && activeTab !== 'reports' && activeTab !== 'users' && activeTab !== 'settings' && userRole !== 'viewer' && (
            <button 
              onClick={() => { setEditingPromoter(null); setIsPromoterModalOpen(true); }}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-dark px-6 py-3 text-sm font-bold text-brand-lime transition-all hover:bg-brand-surface border border-brand-lime/20 shadow-xl shadow-brand-lime/10 active:scale-95 self-start lg:self-end"
            >
              <Plus size={20} />
              Adicionar Promotor
            </button>
          )}
        </header>

        <section className="max-w-7xl mx-auto pb-12">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'dashboard' && (
                <>
                  <LocalDataMigrator existingPromoters={promoters} />
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
                  <StatCard 
                    label="Pendente Pagamento" 
                    value={formatCurrency(financialSummary.unpaidAmount)} 
                    icon={<Clock className="text-amber-600" />} 
                    subtext={`${financialSummary.unpaidDays} dias não pagos`}
                  />
                  <StatCard 
                    label="Adiantamentos" 
                    value={formatCurrency(financialSummary.pendingAdvances)} 
                    icon={<Wallet className="text-red-600" />} 
                  />
                  <StatCard 
                    label="Saldo Líquido" 
                    value={formatCurrency(financialSummary.netBalance)} 
                    icon={<CheckCircle2 className="text-green-600" />} 
                    subtext="Diárias - Adiantamentos"
                  />
                  
                  <div className="col-span-full">
                    <GoogleSheetsSync 
                      promoters={filteredPromoters}
                      allAttendance={filteredAttendance}
                      allAdvances={filteredAdvances}
                    />
                  </div>
                  
                  <div className="col-span-full mt-4">
                    <h2 className="text-lg font-bold text-zinc-900 mb-4 flex items-center gap-2">
                       Promotores Ativos ({filteredPromoters.filter(p => p.active).length})
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {filteredPromoters.filter(p => p.active).slice(0, 4).map(promoter => (
                        <PromoterCard 
                          key={promoter.id} 
                          promoter={promoter} 
                          onEdit={(p) => { setEditingPromoter(p); setIsPromoterModalOpen(true); }}
                          onToggleStatus={() => handleTogglePromoterStatus(promoter)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                </>
              )}

              {activeTab === 'promoters' && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row items-center gap-4 mb-6">
                    <div className="relative flex-1 w-full">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                      <input 
                        type="text" 
                        placeholder="Buscar por nome ou documento..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-lime/10 focus:border-brand-lime transition-all text-sm shadow-sm"
                      />
                    </div>
                    
                    <div className="flex items-center gap-6 self-stretch px-2">
                       <div className="flex items-center gap-2">
                        <div 
                          onClick={() => setShowInactive(!showInactive)}
                          className={`relative w-10 h-6 rounded-full cursor-pointer transition-colors duration-200 ${showInactive ? 'bg-brand-lime' : 'bg-zinc-200'}`}
                        >
                          <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform duration-200 shadow-sm ${showInactive ? 'translate-x-4' : ''}`} />
                        </div>
                        <span className="text-xs font-bold text-zinc-500 uppercase tracking-tight">Ver Inativos</span>
                      </div>

                      {userRole !== 'viewer' && (
                        <button 
                          onClick={() => { setEditingPromoter(null); setIsPromoterModalOpen(true); }}
                          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-brand-dark px-6 py-2.5 text-sm font-semibold text-brand-lime transition-all hover:bg-brand-surface border border-brand-lime/20 shadow-lg shadow-brand-lime/5"
                        >
                          <Plus size={18} />
                          Adicionar Promotor
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredPromoters
                      .filter(p => showInactive || p.active)
                      .map(promoter => (
                      <PromoterCard 
                        key={promoter.id} 
                        promoter={promoter} 
                        onEdit={(p) => { if (userRole === 'viewer') return; setEditingPromoter(p); setIsPromoterModalOpen(true); }}
                        onToggleStatus={userRole === 'viewer' ? undefined : () => handleTogglePromoterStatus(promoter)}
                        readOnly={userRole === 'viewer'}
                      />
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'attendance' && (
                <AttendanceTracker promoters={filteredPromoters} readOnly={userRole === 'viewer'} />
              )}

              {activeTab === 'leads' && (
                <LeadManager 
                  promoters={promoters} 
                  allAttendance={allAttendance} 
                  readOnly={userRole === 'viewer'} 
                  selectedTeam={selectedTeam} 
                />
              )}

              {activeTab === 'advances' && (
                <AdvanceManager promoters={filteredPromoters} readOnly={userRole === 'viewer'} />
              )}

              {activeTab === 'reports' && (
                <div className="space-y-6">
                  <GoogleSheetsSync 
                    promoters={filteredPromoters}
                    allAttendance={filteredAttendance}
                    allAdvances={filteredAdvances}
                  />
                  <PaymentReport promoters={filteredPromoters} />
                </div>
              )}

              {activeTab === 'employees' && (
                <EmployeeManager readOnly={userRole === 'viewer'} userTeam={user?.team || 'all'} />
              )}

              {activeTab === 'users' && (
                <UserManager readOnly={userRole === 'viewer'} />
              )}

              {activeTab === 'settings' && (
                <SettingsManager user={user} userRole={userRole} />
              )}
            </motion.div>
          </AnimatePresence>
        </section>
      </main>

      <PromoterModal 
        isOpen={isPromoterModalOpen} 
        onClose={() => setIsPromoterModalOpen(false)}
        editingPromoter={editingPromoter}
      />
    </div>
  );
}

function NavItem({ active, icon, label, onClick }: { active: boolean, icon: React.ReactNode, label: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all ${
        active 
          ? 'bg-brand-lime text-brand-dark shadow-lg shadow-brand-lime/20 font-bold' 
          : 'text-zinc-400 hover:text-brand-lime hover:bg-brand-surface'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function StatCard({ label, value, icon, subtext }: { label: string, value: string | number, icon: React.ReactNode, subtext?: string }) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm shadow-zinc-100 flex flex-col justify-between">
      <div className="flex items-center justify-between mb-4">
        <span className="text-zinc-500 text-xs font-bold uppercase tracking-wider">{label}</span>
        <div className="p-2 bg-zinc-50 rounded-lg">{icon}</div>
      </div>
      <div>
        <div className="text-3xl font-bold text-zinc-900 tracking-tight">{value}</div>
        {subtext && <div className="mt-1 text-xs text-zinc-500 font-medium">{subtext}</div>}
      </div>
    </div>
  );
}
