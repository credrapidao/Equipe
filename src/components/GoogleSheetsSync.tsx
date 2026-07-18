/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  FileSpreadsheet, 
  RefreshCw, 
  ExternalLink, 
  CheckCircle2, 
  AlertTriangle, 
  Lock,
  CloudLightning,
  Sparkles
} from 'lucide-react';
import { db, googleSignIn, getAccessToken, setAccessToken } from '../lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Promoter, Attendance, Advance } from '../types';

interface GoogleSheetsSyncProps {
  promoters: Promoter[];
  allAttendance: Attendance[];
  allAdvances: Advance[];
}

export default function GoogleSheetsSync({ 
  promoters, 
  allAttendance, 
  allAdvances 
}: GoogleSheetsSyncProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(null);
  const [spreadsheetUrl, setSpreadsheetUrl] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // Load existing spreadsheet configuration from Firestore on mount
  useEffect(() => {
    async function loadConfig() {
      try {
        const configRef = doc(db, 'config', 'google_sheets');
        const docSnap = await getDoc(configRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setSpreadsheetId(data.spreadsheetId || null);
          setSpreadsheetUrl(data.spreadsheetUrl || null);
          if (data.updatedAt) {
            const date = data.updatedAt.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt);
            setLastSync(date.toLocaleString('pt-BR'));
          }
        }
      } catch (error) {
        console.warn('Erro ao carregar configuração da planilha:', error);
      } finally {
        setIsLoadingConfig(false);
      }
    }

    loadConfig();

    // Check if we already have an access token cached in-memory
    const token = getAccessToken();
    if (token) {
      setIsConnected(true);
    }
  }, []);

  const handleConnect = async () => {
    setIsConnecting(true);
    setStatusMessage(null);
    try {
      const result = await googleSignIn();
      if (result && result.accessToken) {
        setIsConnected(true);
        setStatusMessage({
          type: 'success',
          text: 'Conexão com Google Drive realizada com sucesso!'
        });
      } else {
        throw new Error('Não foi possível obter o token de acesso do Google.');
      }
    } catch (error: any) {
      console.error('Erro na conexão com o Google:', error);
      setStatusMessage({
        type: 'error',
        text: `Erro ao conectar: ${error.message || 'Verifique as permissões da janela pop-up.'}`
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const formatToBrazilianDate = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  // Helper to construct the multi-sheet data payload
  const prepareDataPayload = () => {
    // 1. Sheet "Resumo Geral"
    const summaryRows = promoters.map(p => {
      const promoterAttendance = allAttendance.filter(a => a.promoterId === p.id);
      const promoterAdvances = allAdvances.filter(a => a.promoterId === p.id);

      const daysWorked = promoterAttendance.filter(a => a.status === 'present' || a.status === 'half-day').length;

      const totalDiarias = promoterAttendance.reduce((sum, a) => {
        if (a.status === 'absent') return sum;
        const rate = a.dailyRate || p.defaultDailyRate || 100;
        return sum + (a.status === 'half-day' ? rate / 2 : rate);
      }, 0);

      const totalAdiantamentos = promoterAdvances
        .filter(a => a.status === 'pending' || a.status === 'paid')
        .reduce((sum, a) => sum + a.amount, 0);

      const saldoLiquido = totalDiarias - totalAdiantamentos;

      return [
        p.name,
        p.document,
        p.team === 'rapidao' ? 'Time Rapidão' : 'Time Flash',
        p.pixKey,
        p.pixKeyType,
        daysWorked,
        totalDiarias,
        totalAdiantamentos,
        saldoLiquido
      ];
    });

    // 2. Sheet "Promotores"
    const promotersRows = promoters.map(p => [
      p.id,
      p.name,
      p.document,
      p.team === 'rapidao' ? 'Time Rapidão' : 'Time Flash',
      p.pixKeyType,
      p.pixKey,
      p.defaultDailyRate,
      p.active ? 'Ativo' : 'Inativo'
    ]);

    // 3. Sheet "Presença e Frequência"
    const sortedAttendance = [...allAttendance].sort((a, b) => b.date.localeCompare(a.date));
    const attendanceRows = sortedAttendance.map(a => {
      const promoter = promoters.find(p => p.id === a.promoterId);
      const statusText = a.status === 'present' ? 'Presente' : a.status === 'half-day' ? 'Meio-período' : 'Ausente';
      const paymentStatusText = a.paymentStatus === 'paid' ? 'Pago' : 'Pendente';
      const promoterName = promoter ? promoter.name : 'Promotor Excluído';
      const rate = a.dailyRate || promoter?.defaultDailyRate || 100;
      const value = a.status === 'absent' ? 0 : a.status === 'half-day' ? rate / 2 : rate;

      return [
        formatToBrazilianDate(a.date),
        promoterName,
        promoter?.team === 'rapidao' ? 'Time Rapidão' : 'Time Flash',
        statusText,
        value,
        paymentStatusText
      ];
    });

    // 4. Sheet "Adiantamentos e Pagamentos"
    const sortedAdvances = [...allAdvances].sort((a, b) => b.date.localeCompare(a.date));
    const advancesRows = sortedAdvances.map(a => {
      const promoter = promoters.find(p => p.id === a.promoterId);
      const promoterName = a.promoterName || promoter?.name || 'Promotor Excluído';
      const statusText = a.status === 'paid' ? 'Liquidado' : 'Pendente';
      return [
        formatToBrazilianDate(a.date),
        promoterName,
        promoter?.team === 'rapidao' ? 'Time Rapidão' : 'Time Flash',
        a.notes || 'Adiantamento',
        a.amount,
        statusText
      ];
    });

    return {
      summaryRows,
      promotersRows,
      attendanceRows,
      advancesRows
    };
  };

  const handleCreateSpreadsheet = async () => {
    const token = getAccessToken();
    if (!token) {
      setStatusMessage({ type: 'error', text: 'Sessão expirada. Por favor, reconecte sua conta do Google.' });
      setIsConnected(false);
      return;
    }

    setIsSyncing(true);
    setStatusMessage({ type: 'info', text: 'Criando planilha no Google Drive...' });

    try {
      // 1. Create Spreadsheet with predefined sheets and frozen headers
      const createResponse = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          properties: {
            title: 'Acompanhamento de Promotores - CredRapidão'
          },
          sheets: [
            {
              properties: {
                title: 'Resumo Geral',
                gridProperties: {
                  frozenRowCount: 1
                }
              }
            },
            {
              properties: {
                title: 'Promotores',
                gridProperties: {
                  frozenRowCount: 1
                }
              }
            },
            {
              properties: {
                title: 'Presença e Frequência',
                gridProperties: {
                  frozenRowCount: 1
                }
              }
            },
            {
              properties: {
                title: 'Adiantamentos e Pagamentos',
                gridProperties: {
                  frozenRowCount: 1
                }
              }
            }
          ]
        })
      });

      if (!createResponse.ok) {
        const errData = await createResponse.json();
        throw new Error(errData.error?.message || 'Erro ao criar planilha.');
      }

      const spreadsheet = await createResponse.json();
      const newSpreadsheetId = spreadsheet.spreadsheetId;
      const newSpreadsheetUrl = spreadsheet.spreadsheetUrl;

      // 2. Format the created sheets headers and auto-resize columns
      const sheetMetadata = spreadsheet.sheets || [];
      const formattingRequests = sheetMetadata.map((sheet: any) => {
        const sheetId = sheet.properties.sheetId;
        return [
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 0,
                endRowIndex: 1
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: {
                    red: 0.1,    // 242424 (Dark Charcoal)
                    green: 0.1,
                    blue: 0.1
                  },
                  textFormat: {
                    foregroundColor: {
                      red: 0.64,  // brand-lime highlight (#a3ff00 is approx R:0.64 G:1 B:0)
                      green: 1.0,
                      blue: 0.0
                    },
                    bold: true,
                    fontSize: 10
                  },
                  horizontalAlignment: 'LEFT'
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
            }
          },
          {
            autoResizeDimensions: {
              dimensions: {
                sheetId: sheetId,
                dimension: 'COLUMNS',
                startIndex: 0,
                endIndex: 10
              }
            }
          }
        ];
      }).flat();

      if (formattingRequests.length > 0) {
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${newSpreadsheetId}:batchUpdate`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ requests: formattingRequests })
        });
      }

      // 3. Write data values
      const { summaryRows, promotersRows, attendanceRows, advancesRows } = prepareDataPayload();

      const writeResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${newSpreadsheetId}/values:batchUpdate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: [
            {
              range: "'Resumo Geral'!A1",
              values: [
                ['Nome do Promotor', 'CPF / Documento', 'Equipe', 'Chave Pix', 'Tipo Chave Pix', 'Dias Trabalhados', 'Total Diárias (R$)', 'Total Adiantamentos (R$)', 'Saldo Líquido (R$)'],
                ...summaryRows
              ]
            },
            {
              range: "'Promotores'!A1",
              values: [
                ['ID Promotor', 'Nome', 'CPF / Documento', 'Equipe', 'Tipo Chave Pix', 'Chave Pix', 'Valor Diária (R$)', 'Status'],
                ...promotersRows
              ]
            },
            {
              range: "'Presença e Frequência'!A1",
              values: [
                ['Data', 'Nome do Promotor', 'Equipe', 'Status de Presença', 'Valor Recebido (R$)', 'Status Pagamento'],
                ...attendanceRows
              ]
            },
            {
              range: "'Adiantamentos e Pagamentos'!A1",
              values: [
                ['Data', 'Nome do Promotor', 'Equipe', 'Descrição / Notas', 'Valor Adiantado (R$)', 'Status'],
                ...advancesRows
              ]
            }
          ]
        })
      });

      if (!writeResponse.ok) {
        throw new Error('Planilha criada, mas falhou ao preencher os dados iniciais.');
      }

      // 4. Save configuration in Firestore config collection
      const configRef = doc(db, 'config', 'google_sheets');
      await setDoc(configRef, {
        spreadsheetId: newSpreadsheetId,
        spreadsheetUrl: newSpreadsheetUrl,
        updatedAt: serverTimestamp()
      });

      setSpreadsheetId(newSpreadsheetId);
      setSpreadsheetUrl(newSpreadsheetUrl);
      setLastSync(new Date().toLocaleString('pt-BR'));
      setStatusMessage({
        type: 'success',
        text: 'Planilha criada no Google Drive e dados sincronizados com sucesso!'
      });

    } catch (error: any) {
      console.error('Erro ao criar planilha:', error);
      setStatusMessage({
        type: 'error',
        text: `Erro ao criar planilha: ${error.message || error}`
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncData = async () => {
    if (!spreadsheetId) return;

    const token = getAccessToken();
    if (!token) {
      setStatusMessage({ type: 'error', text: 'Sessão expirada. Por favor, reconecte sua conta do Google.' });
      setIsConnected(false);
      return;
    }

    setIsSyncing(true);
    setStatusMessage({ type: 'info', text: 'Atualizando dados da planilha...' });

    try {
      // 1. Clear old values in ranges
      const clearResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchClear`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ranges: [
            "'Resumo Geral'!A1:Z1000",
            "'Promotores'!A1:Z1000",
            "'Presença e Frequência'!A1:Z1000",
            "'Adiantamentos e Pagamentos'!A1:Z1000"
          ]
        })
      });

      if (!clearResponse.ok) {
        throw new Error('Falha ao limpar dados antigos da planilha.');
      }

      // 2. Write fresh values
      const { summaryRows, promotersRows, attendanceRows, advancesRows } = prepareDataPayload();

      const writeResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: [
            {
              range: "'Resumo Geral'!A1",
              values: [
                ['Nome do Promotor', 'CPF / Documento', 'Equipe', 'Chave Pix', 'Tipo Chave Pix', 'Dias Trabalhados', 'Total Diárias (R$)', 'Total Adiantamentos (R$)', 'Saldo Líquido (R$)'],
                ...summaryRows
              ]
            },
            {
              range: "'Promotores'!A1",
              values: [
                ['ID Promotor', 'Nome', 'CPF / Documento', 'Equipe', 'Tipo Chave Pix', 'Chave Pix', 'Valor Diária (R$)', 'Status'],
                ...promotersRows
              ]
            },
            {
              range: "'Presença e Frequência'!A1",
              values: [
                ['Data', 'Nome do Promotor', 'Equipe', 'Status de Presença', 'Valor Recebido (R$)', 'Status Pagamento'],
                ...attendanceRows
              ]
            },
            {
              range: "'Adiantamentos e Pagamentos'!A1",
              values: [
                ['Data', 'Nome do Promotor', 'Equipe', 'Descrição / Notas', 'Valor Adiantado (R$)', 'Status'],
                ...advancesRows
              ]
            }
          ]
        })
      });

      if (!writeResponse.ok) {
        throw new Error('Erro ao gravar os novos dados na planilha.');
      }

      // 3. Auto-resize columns on sync just in case data lengths changed
      // First fetch spreadsheet metadata to get sheetIds
      const metaResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?includeGridData=false`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (metaResponse.ok) {
        const metadata = await metaResponse.json();
        const resizeRequests = (metadata.sheets || []).map((sheet: any) => ({
          autoResizeDimensions: {
            dimensions: {
              sheetId: sheet.properties.sheetId,
              dimension: 'COLUMNS',
              startIndex: 0,
              endIndex: 10
            }
          }
        }));

        if (resizeRequests.length > 0) {
          await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ requests: resizeRequests })
          });
        }
      }

      // 4. Update sync timestamp in Firestore
      const configRef = doc(db, 'config', 'google_sheets');
      await setDoc(configRef, {
        spreadsheetId,
        spreadsheetUrl,
        updatedAt: serverTimestamp()
      }, { merge: true });

      setLastSync(new Date().toLocaleString('pt-BR'));
      setStatusMessage({
        type: 'success',
        text: 'Planilha atualizada com sucesso com as informações mais recentes!'
      });

    } catch (error: any) {
      console.error('Erro ao sincronizar dados:', error);
      setStatusMessage({
        type: 'error',
        text: `Erro de sincronização: ${error.message || error}`
      });
    } finally {
      setIsSyncing(false);
    }
  };

  if (isLoadingConfig) {
    return (
      <div className="flex items-center justify-center p-8 bg-white border border-zinc-200 rounded-2xl shadow-sm">
        <RefreshCw className="h-6 w-6 animate-spin text-zinc-400" />
        <span className="ml-3 text-sm text-zinc-500 font-medium">Carregando integração Google Drive...</span>
      </div>
    );
  }

  return (
    <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden font-sans">
      {/* Header Panel */}
      <div className="p-6 border-b border-zinc-100 bg-zinc-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-[#0f9d58]/10 p-2.5 rounded-xl text-[#0f9d58]">
            <FileSpreadsheet size={24} />
          </div>
          <div>
            <h3 className="text-base font-bold text-zinc-900 flex items-center gap-1.5">
              Planilha de Acompanhamento no Google Drive
              <span className="inline-flex items-center gap-0.5 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-600 uppercase tracking-tight">
                Google Sheets API
              </span>
            </h3>
            <p className="text-xs text-zinc-500 font-medium mt-0.5">
              Exporte, formate e acompanhe promotores, diárias e adiantamentos de forma centralizada.
            </p>
          </div>
        </div>

        {/* Connection status badge */}
        <div>
          {isConnected ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-700 border border-green-200 shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              Conectado ao Drive
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-600 border border-zinc-200">
              <Lock size={12} className="text-zinc-400" />
              Requer Autorização
            </span>
          )}
        </div>
      </div>

      {/* Main Controls Section */}
      <div className="p-6">
        {statusMessage && (
          <div className={`mb-6 p-4 rounded-xl text-sm flex items-start gap-3 border ${
            statusMessage.type === 'success' 
              ? 'bg-green-50/70 border-green-100 text-green-800' 
              : statusMessage.type === 'error' 
              ? 'bg-red-50/70 border-red-100 text-red-800' 
              : 'bg-blue-50/70 border-blue-100 text-blue-800'
          }`}>
            {statusMessage.type === 'success' && <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />}
            {statusMessage.type === 'error' && <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />}
            {statusMessage.type === 'info' && <RefreshCw className="h-5 w-5 text-blue-600 shrink-0 mt-0.5 animate-spin" />}
            <span className="font-medium">{statusMessage.text}</span>
          </div>
        )}

        {!isConnected ? (
          <div className="text-center py-6 px-4">
            <div className="mx-auto bg-zinc-100 w-12 h-12 flex items-center justify-center rounded-full mb-4 border border-zinc-200">
              <CloudLightning className="text-zinc-400 h-6 w-6" />
            </div>
            <h4 className="text-sm font-bold text-zinc-800">Conecte sua conta Google</h4>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto mt-1 mb-6">
              Para criar e atualizar planilhas, precisamos de autorização para salvar arquivos no seu Google Drive com permissão do usuário.
            </p>
            <button
              onClick={handleConnect}
              disabled={isConnecting}
              className="inline-flex items-center gap-2.5 rounded-xl bg-zinc-900 px-6 py-3 text-sm font-bold text-white hover:bg-zinc-800 transition-all shadow-md hover:shadow-zinc-900/10 active:scale-95 disabled:opacity-75 disabled:pointer-events-none"
            >
              <img src="https://www.google.com/favicon.ico" alt="Google" className="h-4 w-4" />
              {isConnecting ? 'Conectando...' : 'Autorizar Acesso ao Google Drive'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-zinc-800">Status da Planilha:</span>
                {spreadsheetId ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 border border-blue-100">
                    Sincronizada e Ativa
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 border border-amber-100">
                    Não criada ainda
                  </span>
                )}
              </div>
              
              {lastSync && (
                <p className="text-xs text-zinc-500 font-medium">
                  Última sincronização de dados: <span className="text-zinc-700 font-semibold">{lastSync}</span>
                </p>
              )}

              <p className="text-xs text-zinc-500 max-w-lg">
                Esta integração cria e atualiza quatro abas na planilha: <span className="font-semibold text-zinc-700">Resumo Geral</span>, <span className="font-semibold text-zinc-700">Promotores</span>, <span className="font-semibold text-zinc-700">Presença e Frequência</span> e <span className="font-semibold text-zinc-700">Adiantamentos e Pagamentos</span>.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {spreadsheetId ? (
                <>
                  <button
                    onClick={handleSyncData}
                    disabled={isSyncing}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-950 px-5 py-2.5 text-xs font-bold text-brand-lime hover:bg-zinc-800 transition-all border border-brand-lime/20 shadow-md active:scale-95 disabled:opacity-75 disabled:pointer-events-none"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    Sincronizar Dados
                  </button>

                  {spreadsheetUrl && (
                    <a
                      href={spreadsheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0f9d58] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#0b8043] transition-all shadow-md active:scale-95"
                    >
                      <ExternalLink size={14} />
                      Abrir Planilha
                    </a>
                  )}
                </>
              ) : (
                <button
                  onClick={handleCreateSpreadsheet}
                  disabled={isSyncing}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0f9d58] px-6 py-3 text-sm font-bold text-white hover:bg-[#0b8043] transition-all shadow-md active:scale-95 disabled:opacity-75 disabled:pointer-events-none"
                >
                  <Sparkles size={16} />
                  {isSyncing ? 'Criando planilha...' : 'Criar Planilha no Drive'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
