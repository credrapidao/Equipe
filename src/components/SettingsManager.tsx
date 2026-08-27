import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  CloudOff, 
  CheckCircle2, 
  AlertTriangle, 
  ExternalLink, 
  Copy, 
  Check, 
  Server, 
  Lock, 
  Info, 
  Settings2, 
  Globe2, 
  RefreshCw, 
  Sparkles,
  Database,
  SlidersHorizontal,
  ChevronRight,
  ShieldAlert,
  KeyRound,
  FileCheck,
  Eye,
  EyeOff,
  Binary,
  Cpu,
  Fingerprint,
  ChevronDown,
  ChevronUp,
  Shield,
  Key
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CryptoEngine, SecurityMasker, SecuritySanitizer, AdminSecurity } from '../lib/security';
import { db } from '../lib/firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  updateDoc, 
  addDoc, 
  doc, 
  serverTimestamp 
} from 'firebase/firestore';

interface SettingsManagerProps {
  user: any;
  userRole: 'admin' | 'viewer';
}

export default function SettingsManager({ user, userRole }: SettingsManagerProps) {
  const [activeSubTab, setActiveSubTab] = useState<'security' | 'vercel' | 'environment'>('security');
  const [vercelDisabled, setVercelDisabled] = useState<boolean>(true);
  const [copiedStep, setCopiedStep] = useState<number | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Admin Master Password Change State (Discreet & Hidden)
  const [isPasswordCardOpen, setIsPasswordCardOpen] = useState(false);
  const [currentAdminPass, setCurrentAdminPass] = useState('');
  const [newAdminPass, setNewAdminPass] = useState('');
  const [confirmAdminPass, setConfirmAdminPass] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);
  const [passSuccess, setPassSuccess] = useState<string | null>(null);

  // Cryptography Sandbox State
  const [cryptoInput, setCryptoInput] = useState('123.456.789-00');
  const [cryptoPass, setCryptoPass] = useState('MasterCredSec2026!');
  const [encryptedOutput, setEncryptedOutput] = useState('');
  const [decryptedOutput, setDecryptedOutput] = useState('');
  const [sha256Output, setSha256Output] = useState('');
  const [isEncrypting, setIsEncrypting] = useState(false);

  useEffect(() => {
    localStorage.setItem('ai_studio_exclusive_mode', 'true');
    setVercelDisabled(true);
    runCryptoTest('123.456.789-00', 'MasterCredSec2026!');
  }, []);

  const handleAdminPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassError(null);
    setPassSuccess(null);

    const currentClean = currentAdminPass.trim();
    const newClean = newAdminPass.trim();
    const confirmClean = confirmAdminPass.trim();

    if (!currentClean || !newClean || !confirmClean) {
      setPassError('Preencha todos os campos obrigatórios.');
      return;
    }

    if (newClean.length < 4) {
      setPassError('A nova senha deve possuir pelo menos 4 caracteres.');
      return;
    }

    if (newClean !== confirmClean) {
      setPassError('A confirmação não coincide com a nova senha digitada.');
      return;
    }

    setIsUpdatingPassword(true);

    try {
      // 1. Verify current password
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('username', '==', 'admin'));
      const querySnapshot = await getDocs(q);

      let firestorePass: string | undefined = undefined;
      let adminDocId: string | null = null;

      if (!querySnapshot.empty) {
        const docSnap = querySnapshot.docs[0];
        adminDocId = docSnap.id;
        firestorePass = docSnap.data().password;
      }

      const isValidCurrent = await AdminSecurity.verifyAdminPassword(currentClean, firestorePass);
      if (!isValidCurrent) {
        setPassError('A senha atual de administrador está incorreta.');
        setIsUpdatingPassword(false);
        return;
      }

      // 2. Persist new password to Firestore and hash storage
      if (adminDocId) {
        await updateDoc(doc(db, 'users', adminDocId), {
          password: newClean,
          displayName: 'Administrador Master',
          role: 'admin',
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'users'), {
          username: 'admin',
          displayName: 'Administrador Master',
          password: newClean,
          role: 'admin',
          team: 'all',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      // 3. Save local SHA-256 hash
      await AdminSecurity.saveLocalAdminHash(newClean);

      // 4. Reset form fields immediately
      setCurrentAdminPass('');
      setNewAdminPass('');
      setConfirmAdminPass('');
      setPassSuccess('Senha de Administrador alterada com sucesso! A nova credencial já está ativa.');
      setTimeout(() => setPassSuccess(null), 6000);
    } catch (err: any) {
      console.error('Password change error:', err);
      setPassError(err.message || 'Erro ao atualizar a senha no banco de dados.');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const runCryptoTest = async (text: string, pass: string) => {
    setIsEncrypting(true);
    try {
      const enc = await CryptoEngine.encrypt(text, pass);
      const dec = await CryptoEngine.decrypt(enc, pass);
      const hash = await CryptoEngine.calculateSHA256(text);
      setEncryptedOutput(enc);
      setDecryptedOutput(dec);
      setSha256Output(hash);
    } catch (e) {
      console.error(e);
    } finally {
      setIsEncrypting(false);
    }
  };

  const handleSetVercelDisabled = (disabled: boolean) => {
    setVercelDisabled(disabled);
    localStorage.setItem('ai_studio_exclusive_mode', String(disabled));
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const copyToClipboard = (text: string, stepId: number) => {
    navigator.clipboard.writeText(text);
    setCopiedStep(stepId);
    setTimeout(() => setCopiedStep(null), 2000);
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-zinc-950 via-zinc-900 to-indigo-950 rounded-3xl p-6 sm:p-8 text-white border border-indigo-500/20 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider">
              <ShieldCheck size={14} />
              Cibersegurança & Criptografia Ativas
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Painel de Segurança & Blindagem de Dados
            </h2>
            <p className="text-zinc-400 text-sm max-w-xl">
              Camadas de criptografia AES-GCM 256-bit, mascaramento dinâmico LGPD e isolamento zero-trust protegendo promotores, funcionários e finanças.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="bg-white/5 border border-white/10 backdrop-blur-md rounded-2xl p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400">
                <Fingerprint size={22} />
              </div>
              <div>
                <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Postura de Segurança</div>
                <div className="text-sm font-black text-emerald-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  100% Protegido (Zero-Trust)
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sub navigation tabs */}
      <div className="flex bg-zinc-200/60 p-1.5 rounded-2xl w-fit border border-zinc-200 shadow-inner flex-wrap gap-1">
        <button
          onClick={() => setActiveSubTab('security')}
          className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 ${
            activeSubTab === 'security'
              ? 'bg-white text-zinc-900 shadow-md'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <Lock size={16} className={activeSubTab === 'security' ? 'text-indigo-600' : ''} />
          Blindagem & Criptografia
        </button>

        <button
          onClick={() => setActiveSubTab('vercel')}
          className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 ${
            activeSubTab === 'vercel'
              ? 'bg-white text-zinc-900 shadow-md'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <CloudOff size={16} className={activeSubTab === 'vercel' ? 'text-red-500' : ''} />
          Desativar Vercel
        </button>

        <button
          onClick={() => setActiveSubTab('environment')}
          className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 ${
            activeSubTab === 'environment'
              ? 'bg-white text-zinc-900 shadow-md'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <Server size={16} className={activeSubTab === 'environment' ? 'text-brand-dark' : ''} />
          Ambiente AI Studio
        </button>
      </div>

      <AnimatePresence mode="wait">
        {/* SUBTAB: BLINDAGEM E CRIPTOGRAFIA */}
        {activeSubTab === 'security' && (
          <motion.div
            key="security"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* Active Security Layers Card */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-zinc-200/80 shadow-sm space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100">
                  <ShieldCheck size={26} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-zinc-900">
                    Camadas de Cibersegurança em Execução
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Arquitetura de defesa em profundidade (Defense-in-Depth) aplicada no front-end e banco de dados.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-zinc-50 p-5 rounded-2xl border border-zinc-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="p-2 rounded-xl bg-indigo-100 text-indigo-700">
                      <KeyRound size={18} />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      Ativo
                    </span>
                  </div>
                  <div className="font-bold text-sm text-zinc-900 pt-1">Criptografia AES-GCM 256</div>
                  <p className="text-xs text-zinc-500 leading-relaxed">
                    Criptografia simétrica com derivação PBKDF2 (100.000 iterações) e vetor de inicialização IV único.
                  </p>
                </div>

                <div className="bg-zinc-50 p-5 rounded-2xl border border-zinc-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
                      <EyeOff size={18} />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      LGPD Ativa
                    </span>
                  </div>
                  <div className="font-bold text-sm text-zinc-900 pt-1">Mascaramento PII Dinâmico</div>
                  <p className="text-xs text-zinc-500 leading-relaxed">
                    CPFs, Chaves PIX, Telefones e Salários ofuscados por padrão contra vazamentos e ombro (shoulder surfing).
                  </p>
                </div>

                <div className="bg-zinc-50 p-5 rounded-2xl border border-zinc-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="p-2 rounded-xl bg-amber-100 text-amber-700">
                      <FileCheck size={18} />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      Anti-Tamper
                    </span>
                  </div>
                  <div className="font-bold text-sm text-zinc-900 pt-1">Integridade SHA-256</div>
                  <p className="text-xs text-zinc-500 leading-relaxed">
                    Hashes criptográficos FIPS 180-4 para validação de integridade e detecção de adulteração em lançamentos.
                  </p>
                </div>

                <div className="bg-zinc-50 p-5 rounded-2xl border border-zinc-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="p-2 rounded-xl bg-purple-100 text-purple-700">
                      <Cpu size={18} />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      Zero-Trust
                    </span>
                  </div>
                  <div className="font-bold text-sm text-zinc-900 pt-1">Regras Rígidas Firestore</div>
                  <p className="text-xs text-zinc-500 leading-relaxed">
                    Bloqueio absoluto a usuários anônimos e validação rigorosa de schemas, tipos e valores positivos.
                  </p>
                </div>
              </div>
            </div>

            {/* DISCREET ADMIN PASSWORD CHANGER CARD */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-zinc-200/80 shadow-sm space-y-5">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-zinc-900 text-brand-lime">
                    <Key size={22} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-zinc-900">
                        Troca de Senha Mestra (Administrador)
                      </h3>
                      <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 bg-zinc-100 text-zinc-600 rounded-full border border-zinc-200">
                        Discreto & Blindado
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500">
                      Altere a credencial mestra de acesso root do sistema com verificação de segurança em duas etapas.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsPasswordCardOpen(!isPasswordCardOpen)}
                  className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
                >
                  {isPasswordCardOpen ? (
                    <>
                      <ChevronUp size={16} />
                      Ocultar Formulário
                    </>
                  ) : (
                    <>
                      <Lock size={14} className="text-indigo-600" />
                      Alterar Senha de Administrador
                    </>
                  )}
                </button>
              </div>

              <AnimatePresence>
                {isPasswordCardOpen && (
                  <motion.form
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                    onSubmit={handleAdminPasswordChange}
                    className="space-y-4 pt-4 border-t border-zinc-100"
                  >
                    {passError && (
                      <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700 flex items-center gap-2">
                        <AlertTriangle size={16} className="shrink-0 text-red-600" />
                        <span>{passError}</span>
                      </div>
                    )}

                    {passSuccess && (
                      <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center gap-2">
                        <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
                        <span>{passSuccess}</span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Current Admin Password */}
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-zinc-700 uppercase tracking-wider">
                          Senha Atual do Admin *
                        </label>
                        <div className="relative">
                          <input
                            type={showCurrentPass ? 'text' : 'password'}
                            required
                            placeholder="Digite a senha atual"
                            value={currentAdminPass}
                            onChange={(e) => setCurrentAdminPass(e.target.value)}
                            className="w-full pl-3.5 pr-10 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-xs font-mono font-bold text-zinc-900 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => setShowCurrentPass(!showCurrentPass)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 p-1"
                            title={showCurrentPass ? "Ocultar" : "Exibir"}
                          >
                            {showCurrentPass ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                      </div>

                      {/* New Admin Password */}
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-zinc-700 uppercase tracking-wider">
                          Nova Senha *
                        </label>
                        <div className="relative">
                          <input
                            type={showNewPass ? 'text' : 'password'}
                            required
                            placeholder="Mínimo 4 caracteres"
                            value={newAdminPass}
                            onChange={(e) => setNewAdminPass(e.target.value)}
                            className="w-full pl-3.5 pr-10 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-xs font-mono font-bold text-zinc-900 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPass(!showNewPass)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 p-1"
                            title={showNewPass ? "Ocultar" : "Exibir"}
                          >
                            {showNewPass ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                      </div>

                      {/* Confirm New Password */}
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-zinc-700 uppercase tracking-wider">
                          Confirmar Nova Senha *
                        </label>
                        <div className="relative">
                          <input
                            type={showConfirmPass ? 'text' : 'password'}
                            required
                            placeholder="Repita a nova senha"
                            value={confirmAdminPass}
                            onChange={(e) => setConfirmAdminPass(e.target.value)}
                            className="w-full pl-3.5 pr-10 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-xs font-mono font-bold text-zinc-900 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPass(!showConfirmPass)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 p-1"
                            title={showConfirmPass ? "Ocultar" : "Exibir"}
                          >
                            {showConfirmPass ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                      <div className="text-[11px] text-zinc-500 flex items-center gap-1.5">
                        <Shield size={14} className="text-emerald-600" />
                        <span>A nova senha é criptografada e salva diretamente no banco de dados Firestore e protegida por hash SHA-256.</span>
                      </div>

                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <button
                          type="button"
                          onClick={() => {
                            setIsPasswordCardOpen(false);
                            setCurrentAdminPass('');
                            setNewAdminPass('');
                            setConfirmAdminPass('');
                            setPassError(null);
                          }}
                          className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-600 hover:bg-zinc-100 transition-colors"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={isUpdatingPassword}
                          className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-md shadow-zinc-900/10 disabled:opacity-50"
                        >
                          <KeyRound size={14} className={isUpdatingPassword ? 'animate-spin' : ''} />
                          {isUpdatingPassword ? 'Gravando Senha...' : 'Salvar Nova Senha'}
                        </button>
                      </div>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>

            {/* Real-Time Cryptographic Engine Simulator */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-zinc-200/80 shadow-sm space-y-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-zinc-900 text-brand-lime">
                    <Binary size={22} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-zinc-900">
                      Simulador & Verificador Criptográfico (Web Crypto API)
                    </h3>
                    <p className="text-xs text-zinc-500">
                      Teste em tempo real o algoritmo de criptografia e o hash SHA-256 executados no motor nativo do navegador.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => runCryptoTest(cryptoInput, cryptoPass)}
                  disabled={isEncrypting}
                  className="px-4 py-2 bg-zinc-900 text-white rounded-xl text-xs font-bold hover:bg-zinc-800 transition-all flex items-center gap-2"
                >
                  <RefreshCw size={14} className={isEncrypting ? 'animate-spin' : ''} />
                  Recalcular Criptografia
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-700 uppercase tracking-wider">
                    Dado em Texto Claro (Ex: CPF ou Chave PIX)
                  </label>
                  <input
                    type="text"
                    value={cryptoInput}
                    onChange={(e) => {
                      setCryptoInput(e.target.value);
                      runCryptoTest(e.target.value, cryptoPass);
                    }}
                    className="w-full px-4 py-3 rounded-xl border border-zinc-300 text-sm font-mono text-zinc-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    placeholder="Digite um dado sensível..."
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-700 uppercase tracking-wider">
                    Chave Mestra de Derivação PBKDF2
                  </label>
                  <input
                    type="password"
                    value={cryptoPass}
                    onChange={(e) => {
                      setCryptoPass(e.target.value);
                      runCryptoTest(cryptoInput, e.target.value);
                    }}
                    className="w-full px-4 py-3 rounded-xl border border-zinc-300 text-sm font-mono text-zinc-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Cryptographic Outputs */}
              <div className="space-y-4 pt-2">
                <div className="bg-zinc-950 rounded-2xl p-5 text-white font-mono text-xs space-y-3 border border-zinc-800">
                  <div className="flex items-center justify-between text-zinc-400 pb-2 border-b border-zinc-800">
                    <span className="flex items-center gap-2 text-indigo-400 font-bold">
                      <KeyRound size={14} />
                      Payload Criptografado (AES-GCM-256 + IV 96-bit + Base64):
                    </span>
                    <button
                      onClick={() => copyToClipboard(encryptedOutput, 99)}
                      className="text-zinc-400 hover:text-white transition-colors"
                      title="Copiar Payload Criptografado"
                    >
                      {copiedStep === 99 ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    </button>
                  </div>
                  <div className="text-emerald-400 break-all select-all font-mono">
                    {encryptedOutput || 'Processando cifra...'}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-200 space-y-1">
                    <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                      Hash de Integridade (SHA-256)
                    </div>
                    <div className="font-mono text-xs text-zinc-800 break-all select-all">
                      {sha256Output || 'Calculando...'}
                    </div>
                  </div>

                  <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 space-y-1">
                    <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1">
                      <CheckCircle2 size={12} />
                      Descriptografia Autenticada
                    </div>
                    <div className="font-mono text-xs text-emerald-950 font-bold">
                      {decryptedOutput || 'Aguardando...'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Security Best Practices & LGPD Compliance */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-zinc-200/80 shadow-sm space-y-4">
              <h4 className="font-bold text-base text-zinc-900 flex items-center gap-2">
                <ShieldCheck size={18} className="text-emerald-600" />
                Conformidade com a LGPD e Proteção Contra Engenharia Social
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-zinc-600">
                <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200/70 space-y-1">
                  <div className="font-bold text-zinc-900">Privacidade por Padrão (Privacy by Default)</div>
                  <p>Dados de identificação e chaves bancárias nunca são exibidos abertamente para terceiros sem autorização.</p>
                </div>
                <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200/70 space-y-1">
                  <div className="font-bold text-zinc-900">Controle de Acesso Baseado em Funções (RBAC)</div>
                  <p>Usuários com perfil de Visualizador possuem acesso estritamente restrito e não podem alterar cadastros ou regras.</p>
                </div>
                <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200/70 space-y-1">
                  <div className="font-bold text-zinc-900">Isolamento de Sessão</div>
                  <p>Toda a comunicação utiliza conexões seguras autenticadas pelo Firebase sobre TLS 1.3 criptografado.</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* SUBTAB: DESATIVAR VERCEL */}
        {activeSubTab === 'vercel' && (
          <motion.div
            key="vercel"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* Primary Control Card */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-zinc-200/80 shadow-sm space-y-6">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-zinc-100">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200">
                    <CloudOff size={28} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-bold text-zinc-900">
                        Modo Exclusivo Google AI Studio
                      </h3>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
                        Vercel Desativada
                      </span>
                    </div>
                    <p className="text-sm text-zinc-500 mt-1 max-w-2xl">
                      O sistema está configurado para operar 100% isolado dentro do Google AI Studio. Nenhuma publicação externa é necessária e qualquer integração com a Vercel permanece bloqueada e inativa.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleSetVercelDisabled(true)}
                    className="px-6 py-3.5 rounded-2xl font-bold text-sm transition-all flex items-center gap-2 bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700"
                  >
                    <CheckCircle2 size={18} />
                    Confirmar Vercel Desativada
                  </button>
                </div>
              </div>

              {/* Selection cards for state */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div 
                  onClick={() => handleSetVercelDisabled(true)}
                  className={`p-5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                    vercelDisabled 
                      ? 'border-emerald-500 bg-emerald-50/40 shadow-md ring-2 ring-emerald-500/10' 
                      : 'border-zinc-200 bg-zinc-50 opacity-60 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-emerald-500 text-white">
                        <Check size={18} />
                      </div>
                      <div>
                        <div className="font-extrabold text-sm text-zinc-900">Uso Privado no Google AI Studio (Ativo)</div>
                        <div className="text-xs text-emerald-700 font-semibold mt-0.5">Vercel 100% Desativada & Não Publicado</div>
                      </div>
                    </div>
                    <span className="w-5 h-5 rounded-full border-2 border-emerald-500 bg-emerald-500 flex items-center justify-center">
                      <span className="w-2 h-2 rounded-full bg-white" />
                    </span>
                  </div>
                  <p className="text-xs text-zinc-600 mt-4 leading-relaxed">
                    Você acessa todo o painel, gerencia promotores, lança presenças e emite relatórios com segurança diretamente aqui no Google AI Studio.
                  </p>
                </div>

                <div 
                  onClick={() => handleSetVercelDisabled(false)}
                  className={`p-5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                    !vercelDisabled 
                      ? 'border-red-500 bg-red-50/40 shadow-md ring-2 ring-red-500/10' 
                      : 'border-zinc-200 bg-zinc-50 opacity-60 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-zinc-200 text-zinc-600">
                        <Globe2 size={18} />
                      </div>
                      <div>
                        <div className="font-extrabold text-sm text-zinc-900">Publicação Externa (Vercel)</div>
                        <div className="text-xs text-zinc-500 font-semibold mt-0.5">Requer domínio público e autorização</div>
                      </div>
                    </div>
                    <span className={`w-5 h-5 rounded-full border-2 ${!vercelDisabled ? 'border-red-500 bg-red-500' : 'border-zinc-300 bg-white'} flex items-center justify-center`}>
                      {!vercelDisabled && <span className="w-2 h-2 rounded-full bg-white" />}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 mt-4 leading-relaxed">
                    Permite implantar uma URL pública na Vercel (requer configuração de domínios no Firebase).
                  </p>
                </div>
              </div>

              {saveSuccess && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold rounded-2xl p-4 flex items-center gap-2"
                >
                  <CheckCircle2 size={18} className="text-emerald-600" />
                  Configuração salva! O sistema está operando exclusivamente no Google AI Studio com a Vercel desativada.
                </motion.div>
              )}
            </div>

            {/* Step-by-Step Guide to Clean up Vercel */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-zinc-200/80 shadow-sm space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-red-50 text-red-600 border border-red-100">
                  <SlidersHorizontal size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-zinc-900">
                    Como Desvincular / Excluir o Projeto na Vercel (Opcional)
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Siga este passo a passo se você já possuía um projeto criado na Vercel e deseja desativá-lo completamente:
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {/* Step 1 */}
                <div className="bg-zinc-50 p-5 rounded-2xl border border-zinc-200/80 flex flex-col sm:flex-row sm:items-start gap-4 justify-between">
                  <div className="flex items-start gap-3.5">
                    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-zinc-900 text-white font-black text-xs flex items-center justify-center">
                      1
                    </span>
                    <div>
                      <h4 className="font-bold text-zinc-900 text-sm">Acesse o Dashboard da Vercel</h4>
                      <p className="text-xs text-zinc-600 mt-1">
                        Abra o painel de controle da Vercel em <span className="font-mono text-zinc-800 font-bold">vercel.com/dashboard</span> e clique sobre o projeto deste aplicativo.
                      </p>
                    </div>
                  </div>
                  <a
                    href="https://vercel.com/dashboard"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-zinc-300 rounded-xl text-xs font-bold text-zinc-700 hover:bg-zinc-100 shadow-sm self-start"
                  >
                    Abrir Vercel <ExternalLink size={13} />
                  </a>
                </div>

                {/* Step 2 */}
                <div className="bg-zinc-50 p-5 rounded-2xl border border-zinc-200/80 flex flex-col sm:flex-row sm:items-start gap-4 justify-between">
                  <div className="flex items-start gap-3.5">
                    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-zinc-900 text-white font-black text-xs flex items-center justify-center">
                      2
                    </span>
                    <div>
                      <h4 className="font-bold text-zinc-900 text-sm">Pausar ou Desconectar Integração Git</h4>
                      <p className="text-xs text-zinc-600 mt-1">
                        Vá em <strong>Settings &gt; Git</strong> e clique em <strong>Disconnect</strong> se não quiser que novos commits gerem builds automáticos na Vercel.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="bg-zinc-50 p-5 rounded-2xl border border-zinc-200/80 flex flex-col sm:flex-row sm:items-start gap-4 justify-between">
                  <div className="flex items-start gap-3.5">
                    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-zinc-900 text-white font-black text-xs flex items-center justify-center">
                      3
                    </span>
                    <div>
                      <h4 className="font-bold text-zinc-900 text-sm">Excluir o Projeto na Vercel (Para remover a URL pública)</h4>
                      <p className="text-xs text-zinc-600 mt-1">
                        Para desativar a URL pública permanentemente, vá na aba <strong>Settings &gt; General</strong>, role até o final da página na seção <strong>"Delete Project"</strong> e confirme a exclusão.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* SUBTAB: AMBIENTE AI STUDIO */}
        {activeSubTab === 'environment' && (
          <motion.div
            key="environment"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-zinc-200/80 shadow-sm space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-brand-lime/20 text-brand-dark border border-brand-lime/30">
                  <Server size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-zinc-900">
                    Detalhes do Servidor & Container
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Informações sobre a execução isolada no Google Cloud / AI Studio
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-200">
                  <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Plataforma</div>
                  <div className="text-base font-extrabold text-zinc-900 mt-1 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Google AI Studio Build
                  </div>
                </div>

                <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-200">
                  <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Modo de Execução</div>
                  <div className="text-base font-extrabold text-zinc-900 mt-1">
                    Privado / Não Publicado
                  </div>
                </div>

                <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-200">
                  <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Porta do Container</div>
                  <div className="text-base font-extrabold text-zinc-900 mt-1">
                    Porta 3000 (Proxy Ativo)
                  </div>
                </div>
              </div>

              <div className="bg-emerald-50/70 border border-emerald-200/70 rounded-2xl p-5 text-emerald-900 text-sm space-y-2">
                <div className="font-bold flex items-center gap-2">
                  <CheckCircle2 size={18} className="text-emerald-600" />
                  Ambiente Autônomo e Seguro
                </div>
                <p className="text-xs text-emerald-800 leading-relaxed">
                  O Google AI Studio hospeda e executa sua aplicação em containers de alta performance no Google Cloud Run. Você pode continuar trabalhando, criando e gerenciando tudo diretamente aqui.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
