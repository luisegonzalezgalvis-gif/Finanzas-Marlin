import React, { useState, useEffect, useMemo, useRef } from 'react';

// Formateador de moneda en Pesos Colombianos (COP)
const formatCOP = (val) => new Intl.NumberFormat('es-CO', { 
  style: 'currency', 
  currency: 'COP', 
  minimumFractionDigits: 0 
}).format(val || 0);

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Estados con persistencia en localStorage para Marlin (Inician vacíos o guardados)
  const [debts, setDebts] = useState(() => {
    const saved = localStorage.getItem('finanzas_marlin_debts');
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const [incomes, setIncomes] = useState(() => {
    const saved = localStorage.getItem('finanzas_marlin_incomes');
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const [expenses, setExpenses] = useState(() => {
    const saved = localStorage.getItem('finanzas_marlin_expenses');
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const [emergencyFund, setEmergencyFund] = useState(() => {
    const saved = localStorage.getItem('finanzas_marlin_reserve');
    return saved ? JSON.parse(saved) : { current: 0, targetMonths: 3 };
  });

  // Estrategia y Abono Extra
  const [payoffStrategy, setPayoffStrategy] = useState('snowball');
  const [extraAbono, setExtraAbono] = useState(0);

  // Sincronización Google Sheets
  const [sheetsUrl, setSheetsUrl] = useState(() => localStorage.getItem('finanzas_marlin_sheets_url') || '');
  const [syncing, setSyncing] = useState(false);
  const [autoSyncing, setAutoSyncing] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);

  // Modales Agregar
  const [showAddDebtModal, setShowAddDebtModal] = useState(false);
  const [newDebt, setNewDebt] = useState({ name: '', entity: '', balance: '', minPayment: '', rate: '', category: 'Tarjeta (Variable)', dueDate: '', totalInstallments: '', paidInstallments: '' });

  const [showAddIncomeModal, setShowAddIncomeModal] = useState(false);
  const [newIncome, setNewIncome] = useState({ concept: '', amount: '', frequency: 'semanal' });

  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  const [newExpense, setNewExpense] = useState({ concept: '', amount: '', frequency: 'semanal', category: 'Subsistencia', dueDate: '' });

  // Modales Editar
  const [editingExpense, setEditingExpense] = useState(null);
  const [editingDebt, setEditingDebt] = useState(null);
  const [editingIncome, setEditingIncome] = useState(null);

  // IA Asesor
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const isFirstRender = useRef(true);

  useEffect(() => {
    localStorage.setItem('finanzas_marlin_debts', JSON.stringify(debts));
  }, [debts]);

  useEffect(() => {
    localStorage.setItem('finanzas_marlin_incomes', JSON.stringify(incomes));
  }, [incomes]);

  useEffect(() => {
    localStorage.setItem('finanzas_marlin_expenses', JSON.stringify(expenses));
  }, [expenses]);

  useEffect(() => {
    localStorage.setItem('finanzas_marlin_reserve', JSON.stringify(emergencyFund));
  }, [emergencyFund]);

  // AUTO-SINCRONIZACIÓN CON GOOGLE DRIVE
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (!sheetsUrl || !sheetsUrl.trim()) return;

    const timer = setTimeout(() => {
      syncToGoogleDrive(incomes, expenses, debts, emergencyFund, true);
    }, 1200);

    return () => clearTimeout(timer);
  }, [incomes, expenses, debts, emergencyFund, sheetsUrl]);

  const showNotification = (msg, type = 'success') => {
    setToastMsg({ msg, type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  const syncToGoogleDrive = async (currIncomes, currExpenses, currDebts, currReserve, isAuto = false) => {
    if (!sheetsUrl || !sheetsUrl.trim()) return;

    if (isAuto) setAutoSyncing(true); else setSyncing(true);

    try {
      const payload = {
        action: 'sync_all',
        data: {
          incomes: currIncomes,
          expenses: currExpenses,
          debts: currDebts,
          emergencyFund: currReserve
        }
      };

      await fetch(sheetsUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!isAuto) {
        showNotification('☁️ ¡Sincronizado con éxito a tu Google Sheets!');
      }
    } catch (err) {
      console.error(err);
      if (!isAuto) showNotification('❌ Error al sincronizar con Google Drive', 'error');
    } finally {
      if (isAuto) setAutoSyncing(false); else setSyncing(false);
    }
  };

  const calculatedIncomes = useMemo(() => {
    let weeklyTotal = 0;
    let biweeklyTotal = 0;
    let monthlyTotal = 0;

    incomes.forEach(inc => {
      const amt = Number(inc.amount) || 0;
      if (inc.frequency === 'semanal') {
        weeklyTotal += amt;
        biweeklyTotal += amt * 2.166;
        monthlyTotal += amt * 4.3333;
      } else if (inc.frequency === 'quincenal') {
        weeklyTotal += amt / 2.166;
        biweeklyTotal += amt;
        monthlyTotal += amt * 2;
      } else {
        weeklyTotal += amt / 4.3333;
        biweeklyTotal += amt / 2;
        monthlyTotal += amt;
      }
    });

    return { weeklyTotal, biweeklyTotal, monthlyTotal };
  }, [incomes]);

  const calculatedExpenses = useMemo(() => {
    let weeklySubsistence = 0;
    let monthlyFixed = 0;
    let monthlyTotal = 0;

    expenses.forEach(exp => {
      const amt = Number(exp.amount) || 0;
      let mEq = 0;
      if (exp.frequency === 'semanal') {
        mEq = amt * 4.3333;
        if (exp.category === 'Subsistencia') weeklySubsistence += amt;
      } else if (exp.frequency === 'quincenal') {
        mEq = amt * 2;
      } else {
        mEq = amt;
      }

      if (exp.category === 'Fijo') monthlyFixed += mEq;
      monthlyTotal += mEq;
    });

    return { weeklySubsistence, monthlyFixed, monthlyTotal };
  }, [expenses]);

  const totals = useMemo(() => {
    const totalIncome = calculatedIncomes.monthlyTotal;
    const totalExpenses = calculatedExpenses.monthlyTotal;
    const totalDebtBalance = debts.reduce((sum, item) => sum + Number(item.balance), 0);
    const totalMinDebtPayments = debts.reduce((sum, item) => sum + Number(item.minPayment), 0);

    const weeklyMinDebtPayments = totalMinDebtPayments / 4.3333;
    const weeklyGrossIncome = calculatedIncomes.weeklyTotal;
    const weeklySubsistence = calculatedExpenses.weeklySubsistence;
    const weeklyNetAvailable = weeklyGrossIncome - weeklySubsistence;

    const netCashflow = totalIncome - totalExpenses - totalMinDebtPayments;
    const debtToIncomeRatio = totalIncome > 0 ? (totalMinDebtPayments / totalIncome) * 100 : 0;

    return {
      totalIncome,
      totalExpenses,
      totalDebtBalance,
      totalMinDebtPayments,
      netCashflow,
      debtToIncomeRatio,
      weeklyGrossIncome,
      weeklySubsistence,
      weeklyNetAvailable,
      weeklyMinDebtPayments
    };
  }, [calculatedIncomes, calculatedExpenses, debts]);

  // Clasificación de pasivos
  const categorizedDebts = useMemo(() => {
    const isCard = (debt) => {
      const cat = (debt.category || '').toLowerCase();
      return cat.includes('tarjeta');
    };

    const cards = debts.filter(d => isCard(d));
    const loans = debts.filter(d => !isCard(d));

    let totalLoanBalance = 0;
    let totalInstallmentsCount = 0;
    let totalPaidInstallmentsCount = 0;

    loans.forEach(l => {
      const bal = Number(l.balance) || 0;
      const totInst = Number(l.totalInstallments) || 0;
      const paidInst = Number(l.paidInstallments) || 0;

      totalLoanBalance += bal;
      totalInstallmentsCount += totInst;
      totalPaidInstallmentsCount += paidInst;
    });

    const installmentsProgressPct = totalInstallmentsCount > 0 ? Math.min(100, Math.round((totalPaidInstallmentsCount / totalInstallmentsCount) * 100)) : 0;

    return {
      cards,
      loans,
      loanMetrics: {
        totalLoanBalance,
        totalInstallmentsCount,
        totalPaidInstallmentsCount,
        installmentsProgressPct
      }
    };
  }, [debts]);

  const sortedDebts = useMemo(() => {
    const sorted = [...debts];
    if (payoffStrategy === 'snowball') {
      return sorted.sort((a, b) => a.balance - b.balance);
    } else {
      return sorted.sort((a, b) => b.rate - a.rate);
    }
  }, [debts, payoffStrategy]);

  const simulation = useMemo(() => {
    if (debts.length === 0) return { monthsNormal: 0, monthsAccelerated: 0, savedMonths: 0 };

    let tempDebtsNormal = debts.map(d => ({ ...d }));
    let monthsNormal = 0;
    let maxSafetyCounter = 240;

    while (tempDebtsNormal.some(d => d.balance > 0) && monthsNormal < maxSafetyCounter) {
      monthsNormal++;
      tempDebtsNormal.forEach(d => {
        if (d.balance > 0) {
          const interestMonth = (d.balance * (d.rate / 100)) / 12;
          const principalPayment = Math.max(0, d.minPayment - interestMonth);
          d.balance = Math.max(0, d.balance - principalPayment);
        }
      });
    }

    let tempDebtsAccel = sortedDebts.map(d => ({ ...d }));
    let monthsAccelerated = 0;

    while (tempDebtsAccel.some(d => d.balance > 0) && monthsAccelerated < maxSafetyCounter) {
      monthsAccelerated++;
      let extraPool = Number(extraAbono) || 0;

      tempDebtsAccel.forEach(d => {
        if (d.balance > 0) {
          const interestMonth = (d.balance * (d.rate / 100)) / 12;
          const normalPayment = Math.min(d.balance + interestMonth, d.minPayment);
          const principalPayment = Math.max(0, normalPayment - interestMonth);
          d.balance = Math.max(0, d.balance - principalPayment);
        }
      });

      for (let d of tempDebtsAccel) {
        if (d.balance > 0 && extraPool > 0) {
          const abonoActual = Math.min(d.balance, extraPool);
          d.balance -= abonoActual;
          extraPool -= abonoActual;
        }
      }
    }

    return {
      monthsNormal: monthsNormal >= maxSafetyCounter ? '20+ años' : `${monthsNormal} meses`,
      monthsAccelerated: monthsAccelerated >= maxSafetyCounter ? '20+ años' : `${monthsAccelerated} meses`,
      savedMonths: (typeof monthsNormal === 'number' && typeof monthsAccelerated === 'number')
        ? Math.max(0, monthsNormal - monthsAccelerated)
        : 0
    };
  }, [debts, sortedDebts, extraAbono]);

  const handleAddExpense = (e) => {
    e.preventDefault();
    if (!newExpense.concept || !newExpense.amount) return;

    const expObj = {
      id: `e_${Date.now()}`,
      concept: newExpense.concept,
      amount: Number(newExpense.amount) || 0,
      frequency: newExpense.frequency,
      category: newExpense.category,
      dueDate: newExpense.dueDate || ''
    };

    setExpenses(prev => [...prev, expObj]);
    setNewExpense({ concept: '', amount: '', frequency: 'semanal', category: 'Subsistencia', dueDate: '' });
    setShowAddExpenseModal(false);
    showNotification('🛒 Egreso guardado (Sincronizando...)');
  };

  const handleOpenEditExpense = (exp) => {
    setEditingExpense({ ...exp });
  };

  const handleSaveEditExpense = (e) => {
    e.preventDefault();
    if (!editingExpense || !editingExpense.concept) return;

    setExpenses(prev => prev.map(item => item.id === editingExpense.id ? {
      ...editingExpense,
      amount: Number(editingExpense.amount) || 0
    } : item));

    setEditingExpense(null);
    showNotification('✏️ Gasto actualizado (Sincronizando...)');
  };

  const handleDeleteExpense = (id) => {
    setExpenses(prev => prev.filter(e => e.id !== id));
    showNotification('🗑️ Egreso eliminado');
  };

  const handleAddDebt = (e) => {
    e.preventDefault();
    if (!newDebt.name || !newDebt.balance) return;

    const balanceNum = Number(newDebt.balance) || 0;

    const debtObj = {
      id: `d_${Date.now()}`,
      name: newDebt.name,
      entity: newDebt.entity || 'General',
      balance: balanceNum,
      minPayment: Number(newDebt.minPayment) || 0,
      rate: Number(newDebt.rate) || 0,
      category: newDebt.category || 'Tarjeta (Variable)',
      dueDate: newDebt.dueDate || '',
      totalInstallments: Number(newDebt.totalInstallments) || 0,
      paidInstallments: Number(newDebt.paidInstallments) || 0,
    };

    setDebts(prev => [...prev, debtObj]);
    setNewDebt({ name: '', entity: '', balance: '', minPayment: '', rate: '', category: 'Tarjeta (Variable)', dueDate: '', totalInstallments: '', paidInstallments: '' });
    setShowAddDebtModal(false);
    showNotification('💳 Nuevo pasivo guardado (Sincronizando...)');
  };

  const handleOpenEditDebt = (debt) => {
    setEditingDebt({ ...debt });
  };

  const handleSaveEditDebt = (e) => {
    e.preventDefault();
    if (!editingDebt || !editingDebt.name) return;

    setDebts(prev => prev.map(item => item.id === editingDebt.id ? {
      ...editingDebt,
      balance: Number(editingDebt.balance) || 0,
      minPayment: Number(editingDebt.minPayment) || 0,
      rate: Number(editingDebt.rate) || 0,
      totalInstallments: Number(editingDebt.totalInstallments) || 0,
      paidInstallments: Number(editingDebt.paidInstallments) || 0,
    } : item));

    setEditingDebt(null);
    showNotification('✏️ Pasivo actualizado (Sincronizando...)');
  };

  const handleRegisterInstallmentPayment = (debtId) => {
    setDebts(prev => prev.map(d => {
      if (d.id === debtId) {
        const currentPaid = Number(d.paidInstallments) || 0;
        const total = Number(d.totalInstallments) || 0;
        const nextPaid = total > 0 ? Math.min(total, currentPaid + 1) : currentPaid + 1;
        const cuotaAmt = Number(d.minPayment) || 0;
        const newBal = Math.max(0, d.balance - cuotaAmt);

        showNotification(`✅ Cuota #${nextPaid} registrada para ${d.name}`);
        return {
          ...d,
          paidInstallments: nextPaid,
          balance: newBal
        };
      }
      return d;
    }));
  };

  const handleDeleteDebt = (id) => {
    setDebts(prev => prev.filter(d => d.id !== id));
    showNotification('🗑️ Pasivo eliminado');
  };

  const handleAddIncome = (e) => {
    e.preventDefault();
    if (!newIncome.concept || !newIncome.amount) return;

    const incomeObj = {
      id: `i_${Date.now()}`,
      concept: newIncome.concept,
      amount: Number(newIncome.amount) || 0,
      frequency: newIncome.frequency
    };

    setIncomes(prev => [...prev, incomeObj]);
    setNewIncome({ concept: '', amount: '', frequency: 'semanal' });
    setShowAddIncomeModal(false);
    showNotification('💵 Ingreso guardado (Sincronizando...)');
  };

  const handleOpenEditIncome = (inc) => {
    setEditingIncome({ ...inc });
  };

  const handleSaveEditIncome = (e) => {
    e.preventDefault();
    if (!editingIncome || !editingIncome.concept) return;

    setIncomes(prev => prev.map(item => item.id === editingIncome.id ? {
      ...editingIncome,
      amount: Number(editingIncome.amount) || 0
    } : item));

    setEditingIncome(null);
    showNotification('✏️ Ingreso actualizado (Sincronizando...)');
  };

  const handleDeleteIncome = (id) => {
    setIncomes(prev => prev.filter(i => i.id !== id));
    showNotification('🗑️ Ingreso eliminado');
  };

  const handleClearAllData = () => {
    setIncomes([]);
    setExpenses([]);
    setDebts([]);
    setEmergencyFund({ current: 0, targetMonths: 3 });
    showNotification('✨ Aplicación reiniciada completamente en cero', 'success');
  };

  const handleSaveSheetsUrl = () => {
    localStorage.setItem('finanzas_marlin_sheets_url', sheetsUrl);
    showNotification('☁️ URL de Google Apps Script guardada en memoria local');
    if (sheetsUrl.trim()) {
      syncToGoogleDrive(incomes, expenses, debts, emergencyFund, false);
    }
  };

  const handleDownloadFromDrive = async () => {
    if (!sheetsUrl || !sheetsUrl.trim()) {
      showNotification('⚠️ Configura primero tu URL /exec de Google Apps Script', 'error');
      return;
    }
    setSyncing(true);
    try {
      const res = await fetch(sheetsUrl);
      const data = await res.json();

      if (data) {
        setIncomes(data.incomes && Array.isArray(data.incomes) ? data.incomes : []);
        setExpenses(data.expenses && Array.isArray(data.expenses) ? data.expenses : []);
        setDebts(data.debts && Array.isArray(data.debts) ? data.debts : []);
        if (data.emergencyFund && data.emergencyFund.current !== undefined) setEmergencyFund(data.emergencyFund);

        showNotification('🔄 ¡Base de datos sincronizada desde Google Sheets!');
      } else {
        showNotification('⚠️ La respuesta de la nube estaba vacía', 'error');
      }
    } catch (err) {
      console.error(err);
      showNotification('❌ Error de conexión al descargar de Google Drive', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleGenerateAiDiagnostic = async () => {
    setAiLoading(true);
    setAiAnalysis('');

    setTimeout(() => {
      const topTarget = sortedDebts.length > 0 ? sortedDebts[0] : null;
      const strategyName = payoffStrategy === 'snowball' ? 'Bola de Nieve (Atacar menor saldo primero)' : 'Avalancha (Atacar mayor tasa primero)';

      let reportText = `🛡️ 1. ANÁLISIS DE COBERTURA Y CALENDARIO DE GASTOS
• Producido Semanal Bruto: ${formatCOP(totals.weeklyGrossIncome)} COP
• Subsistencia / Alimentación Diaria: -${formatCOP(totals.weeklySubsistence)} COP
• Flujo Limpio Semanal Restante: ${formatCOP(totals.weeklyNetAvailable)} COP

💡 Evaluación de Riesgo: Tu cobertura semanal actual es del ${totals.weeklyGrossIncome > 0 ? Math.round((totals.weeklySubsistence / totals.weeklyGrossIncome) * 100) : 0}%. Tu alimentación básica está resguardada antes de pagar cualquier cuota.

🎯 2. PLAN DE DISTRIBUCIÓN Y DÍAS CLAVE DE PAGO
• Reservar semanalmente para compromisos fijos: ${formatCOP(totals.weeklyMinDebtPayments)} COP/semana.

⚡ 3. PASO A PASO PARA LIQUIDAR SU PRIMER PASIVO
• Estrategia Activa: ${strategyName}
${topTarget ? `• OBJETIVO PRIORITARIO: ${topTarget.name} (${topTarget.entity})
• Saldo Pendiente: ${formatCOP(topTarget.balance)} COP | Cuota Mínima: ${formatCOP(topTarget.minPayment)} COP
• Plan de Ataque: Aplica el abono extra mensual de ${formatCOP(extraAbono)} COP directo a este pasivo. En aprox. ${simulation.monthsAccelerated} quedarás 100% libre de deudas.` : '• ¡Felicitaciones Marlin! No tienes deudas pendientes registradas.'}`;

      setAiAnalysis(reportText);
      setAiLoading(false);
    }, 600);
  };

  const theme = {
    bgApp: isDarkMode ? 'bg-[#0a0c14] text-slate-100' : 'bg-slate-50 text-slate-900',
    sidebarBg: isDarkMode ? 'bg-[#0e111d] border-slate-800/80' : 'bg-white border-slate-200 shadow-sm',
    headerBg: isDarkMode ? 'bg-[#0a0c14]/90 border-slate-800/80' : 'bg-white/90 border-slate-200 shadow-sm',
    cardBg: isDarkMode ? 'bg-[#0e111d] border-slate-800/80 shadow-2xl' : 'bg-white border-slate-200 shadow-md',
    cardHighlight: isDarkMode ? 'bg-gradient-to-r from-indigo-950/60 via-slate-900 to-slate-900 border-indigo-500/30' : 'bg-gradient-to-r from-indigo-50 via-slate-50 to-white border-indigo-200',
    subCardBg: isDarkMode ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-100/80 border-slate-200',
    textMuted: isDarkMode ? 'text-slate-400' : 'text-slate-500',
    textMain: isDarkMode ? 'text-slate-100' : 'text-slate-800',
    inputBg: isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-300 text-slate-800',
    tableHeader: isDarkMode ? 'bg-slate-900/90 text-slate-400 border-slate-800' : 'bg-slate-100 text-slate-600 border-slate-200',
    tableRowHover: isDarkMode ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50',
  };

  return (
    <div className={`min-h-screen font-sans flex flex-col md:flex-row antialiased overflow-x-hidden transition-colors duration-300 ${theme.bgApp}`}>

      {/* NOTIFICACIÓN TOAST */}
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 animate-bounce">
          <div className={`px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border ${
            toastMsg.type === 'error' ? 'bg-slate-900 text-rose-300 border-rose-500' : 'bg-slate-900 text-emerald-300 border-emerald-500'
          }`}>
            <span className="text-sm font-bold">{toastMsg.msg}</span>
          </div>
        </div>
      )}

      {/* SIDEBAR NAVEGACIÓN VERTICAL */}
      <aside className={`w-full md:w-72 border-b md:border-b-0 md:border-r flex-shrink-0 flex flex-col justify-between p-5 transition-all duration-300 z-30 ${theme.sidebarBg} ${sidebarOpen ? 'block' : 'hidden md:flex'}`}>
        <div>
          {/* LOGO & BRANDING */}
          <div className="flex items-center justify-between pb-6 mb-6 border-b border-slate-200 dark:border-slate-800/80">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 via-blue-600 to-amber-500 p-0.5 shadow-lg shadow-indigo-500/20">
                <div className={`w-full h-full rounded-[14px] flex items-center justify-center text-xl font-black ${isDarkMode ? 'bg-[#0a0c14]' : 'bg-white'}`}>
                  💼
                </div>
              </div>
              <div>
                <h1 className="text-base font-black tracking-tight bg-gradient-to-r from-indigo-600 via-blue-600 to-amber-500 bg-clip-text text-transparent">
                  FINANZAS MARLIN
                </h1>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-indigo-500 dark:text-amber-400 font-bold uppercase tracking-widest block">
                    Control 360°
                  </span>
                  {autoSyncing && (
                    <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.2 rounded font-mono animate-pulse">
                      ☁️ Sync
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button 
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="md:hidden text-slate-400 hover:text-slate-600 dark:hover:text-white p-1"
            >
              ✕
            </button>
          </div>

          {/* MENÚ DE NAVEGACIÓN VERTICAL */}
          <nav className="space-y-1.5">
            {[
              { id: 'dashboard', label: 'Centro de Control', icon: '🎯', badge: 'Principal' },
              { id: 'ingresos', label: 'Ingresos & Subsistencia', icon: '💵', count: incomes.length },
              { id: 'gastos', label: 'Presupuesto de Gastos', icon: '🛒', count: expenses.length },
              { id: 'mapa', label: 'Ruta de Ataque', icon: '⚡', badge: 'Estrategia' },
              { id: 'pasivos', label: 'Gestor de Deudas', icon: '💳', count: debts.length },
              { id: 'matriz', label: 'Matriz 50/30/20', icon: '📊' },
              { id: 'reserva', label: 'Fondo de Emergencia', icon: '🛡️' },
              { id: 'config', label: 'Sheets (Nube)', icon: '☁️' },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-xs font-bold transition-all duration-200 group ${
                    isActive 
                      ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-lg shadow-indigo-500/20' 
                      : `${theme.textMuted} hover:bg-indigo-50 dark:hover:bg-slate-800/40 hover:text-indigo-600 dark:hover:text-slate-200`
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-base p-1.5 rounded-xl transition-all ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 group-hover:scale-110'}`}>
                      {tab.icon}
                    </span>
                    <span>{tab.label}</span>
                  </div>
                  {tab.badge && (
                    <span className={`text-[9px] px-2 py-0.5 rounded-full font-black ${isActive ? 'bg-white/20 text-white' : 'bg-indigo-100 dark:bg-slate-800 text-indigo-600 dark:text-slate-400'}`}>
                      {tab.badge}
                    </span>
                  )}
                  {tab.count !== undefined && (
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* WIDGET DE SALUD EN SIDEBAR */}
        <div className={`mt-8 p-4 rounded-2xl border space-y-3 ${theme.cardBg}`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Compromiso Deudas</span>
            <span className={`text-xs font-black ${totals.debtToIncomeRatio > 40 ? 'text-rose-500' : 'text-emerald-500'}`}>
              {totals.debtToIncomeRatio.toFixed(0)}%
            </span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-950 h-2 rounded-full overflow-hidden p-0.5 border border-slate-300 dark:border-slate-800">
            <div 
              className={`h-full rounded-full transition-all duration-700 ${totals.debtToIncomeRatio > 40 ? 'bg-gradient-to-r from-amber-500 to-rose-500' : 'bg-gradient-to-r from-emerald-500 to-teal-400'}`}
              style={{ width: `${Math.min(100, totals.debtToIncomeRatio)}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
            {totals.debtToIncomeRatio > 40 ? '⚠️ Carga alta sobre tus ingresos.' : '🟢 Nivel de endeudamiento saludable.'}
          </p>
        </div>
      </aside>

      {/* ÁREA DE TRABAJO PRINCIPAL */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        
        {/* BARRA SUPERIOR DE COMANDO */}
        <header className={`sticky top-0 z-20 backdrop-blur-md border-b px-6 py-4 flex flex-wrap items-center justify-between gap-4 transition-colors ${theme.headerBg}`}>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSidebarOpen(!sidebarOpen)} 
              className="md:hidden p-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
            >
              ☰
            </button>
            <div>
              <h2 className="text-base font-black flex items-center gap-2">
                <span>Finanzas Marlin</span>
                <span className="text-[10px] bg-indigo-100 dark:bg-slate-800 text-indigo-700 dark:text-amber-400 font-mono px-2 py-0.5 rounded-full border border-indigo-200 dark:border-slate-700">
                  COP es-CO
                </span>
                {autoSyncing && (
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-400 font-bold px-2 py-0.5 rounded-full border border-emerald-500/20 animate-pulse">
                    ⚡ Auto-Sync Sheets
                  </span>
                )}
              </h2>
              <p className={`text-xs font-medium ${theme.textMuted}`}>
                Gestión de Producido Semanal, Obligaciones Fijas y Avance de Cuotas
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="px-3 py-1.5 text-xs font-black rounded-2xl border transition-all flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-amber-300 hover:scale-105"
            >
              <span>{isDarkMode ? '☀️ Modo Claro' : '🌙 Modo Oscuro'}</span>
            </button>

            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900/90 p-1 rounded-2xl border border-slate-300 dark:border-slate-800">
              <button
                onClick={() => setPayoffStrategy('snowball')}
                className={`px-3 py-1.5 text-xs font-black rounded-xl transition ${payoffStrategy === 'snowball' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'}`}
              >
                ❄️ Bola Nieve
              </button>
              <button
                onClick={() => setPayoffStrategy('avalanche')}
                className={`px-3 py-1.5 text-xs font-black rounded-xl transition ${payoffStrategy === 'avalanche' ? 'bg-indigo-600 text-white shadow' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'}`}
              >
                🏔️ Avalancha
              </button>
            </div>

            <button
              onClick={handleGenerateAiDiagnostic}
              disabled={aiLoading}
              className="bg-gradient-to-r from-indigo-600 via-blue-600 to-amber-500 hover:opacity-90 text-white font-black text-xs px-4 py-2.5 rounded-2xl shadow-lg shadow-indigo-500/20 transition flex items-center gap-2 cursor-pointer"
            >
              {aiLoading ? (
                <>
                  <span className="animate-spin">🌀</span>
                  <span>Auditando...</span>
                </>
              ) : (
                <>
                  <span>✨ Audit con IA</span>
                </>
              )}
            </button>
          </div>
        </header>

        {/* CONTENIDO DE LAS VISTAS */}
        <main className="p-6 space-y-6 max-w-7xl mx-auto w-full">
          
          {/* INFORME AUDITORÍA IA DESPLEGABLE */}
          {aiAnalysis && (
            <div className={`p-6 rounded-3xl border border-indigo-500/40 shadow-2xl space-y-3 relative overflow-hidden animate-fadeIn ${isDarkMode ? 'bg-gradient-to-r from-slate-900 via-[#121626] to-slate-900' : 'bg-gradient-to-r from-indigo-50 via-white to-blue-50'}`}>
              <div className="flex justify-between items-center border-b border-indigo-500/20 pb-3">
                <span className="text-xs font-black text-indigo-600 dark:text-amber-400 tracking-wider flex items-center gap-2">
                  <span>🧠</span> DICTAMEN ESTRATÉGICO IA PARA MARLIN
                </span>
                <button onClick={() => setAiAnalysis('')} className="text-slate-400 hover:text-rose-500 text-xs font-bold p-1">Cerrar ❌</button>
              </div>
              <div className={`whitespace-pre-line text-xs leading-relaxed font-sans ${theme.textMain}`}>
                {aiAnalysis}
              </div>
            </div>
          )}

          {/* VISTA 1: DASHBOARD PRINCIPAL */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <div className={`p-6 rounded-3xl border shadow-xl relative overflow-hidden ${theme.cardBg}`}>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6 pb-4 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <h3 className="text-sm font-black text-indigo-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-2">
                      <span>🚰</span> Embudo del Producido Semanal de Marlin
                    </h3>
                    <p className={`text-xs ${theme.textMuted}`}>
                      Desglose real de caja: Ingresos semanales menos mercado y subsistencia personal.
                    </p>
                  </div>
                  <span className="text-xs font-black bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-3 py-1 rounded-full border border-indigo-500/20">
                    Sueldo & Alimentación Protegidos 🛡️
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
                  <div className={`p-4 rounded-2xl border ${theme.subCardBg}`}>
                    <span className={`text-[10px] font-bold block uppercase ${theme.textMuted}`}>1. Producido Semanal Bruto</span>
                    <span className="text-xl font-black text-indigo-600 dark:text-indigo-400 font-mono">
                      {formatCOP(totals.weeklyGrossIncome)}
                    </span>
                    <span className="text-[9px] text-slate-400 block mt-1">Plataformas y Conducción</span>
                  </div>

                  <div className="p-4 rounded-2xl border bg-rose-500/10 border-rose-500/20">
                    <span className="text-[10px] font-bold text-rose-500 block uppercase">2. (-) Mercado y Subsistencia</span>
                    <span className="text-xl font-black text-rose-500 font-mono">
                      -{formatCOP(totals.weeklySubsistence)}
                    </span>
                    <span className="text-[9px] text-rose-400 block mt-1">Alimentación y gastos personales</span>
                  </div>

                  <div className="p-4 rounded-2xl border bg-emerald-500/10 border-emerald-500/20">
                    <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 block uppercase">3. (=) Caja Disponible Semanal</span>
                    <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                      {formatCOP(totals.weeklyNetAvailable)}
                    </span>
                    <span className="text-[9px] text-emerald-500 block mt-1">Dinero limpio para fijos y créditos</span>
                  </div>

                  <div className="p-4 rounded-2xl border bg-amber-500/10 border-amber-500/20">
                    <span className="text-[10px] font-black text-amber-600 dark:text-amber-400 block uppercase">4. Provisión Cuotas Semanal</span>
                    <span className="text-xl font-black text-amber-500 font-mono">
                      {formatCOP(totals.weeklyMinDebtPayments)}
                    </span>
                    <span className="text-[9px] text-amber-500 block mt-1">Cuotas mínimas mensuales ÷ 4.33</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className={`lg:col-span-8 p-6 rounded-3xl border flex flex-col justify-between relative overflow-hidden ${theme.cardBg}`}>
                  <div>
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <span className="text-[10px] font-black uppercase text-amber-500 dark:text-amber-400 tracking-widest block mb-1">
                          🎯 Objetivo Inmediato de Liberación
                        </span>
                        <h3 className={`text-xl font-black ${theme.textMain}`}>
                          {sortedDebts.length > 0 ? sortedDebts[0].name : '¡Sin deudas registradas!'}
                        </h3>
                        <p className={`text-xs mt-1 ${theme.textMuted}`}>
                          Pasivo prioritario bajo la estrategia <strong className="text-indigo-600 dark:text-indigo-400 uppercase">{payoffStrategy === 'snowball' ? 'Bola de Nieve (Menor Saldo)' : 'Avalancha (Mayor Tasa)'}</strong>.
                        </p>
                      </div>

                      <div className="text-right">
                        <span className={`text-[10px] uppercase font-black block ${theme.textMuted}`}>Saldo Objetivo</span>
                        <span className="text-2xl font-black text-amber-500 dark:text-amber-400 font-mono">
                          {sortedDebts.length > 0 ? formatCOP(sortedDebts[0].balance) : '$0'}
                        </span>
                      </div>
                    </div>

                    {sortedDebts.length > 0 && (
                      <div className={`p-5 rounded-2xl border space-y-4 mb-6 ${theme.cardHighlight}`}>
                        <div className="flex justify-between items-center text-xs">
                          <span className={`font-bold ${theme.textMain}`}>Entidad: <strong>{sortedDebts[0].entity}</strong></span>
                          <span className="text-amber-600 dark:text-amber-400 font-black">Tasa: {sortedDebts[0].rate}% EA</span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-center">
                          <div className={`p-3 rounded-xl border ${theme.subCardBg}`}>
                            <span className={`text-[9px] font-bold block uppercase ${theme.textMuted}`}>Cuota Mínima</span>
                            <span className={`text-xs font-black ${theme.textMain}`}>{formatCOP(sortedDebts[0].minPayment)}</span>
                          </div>
                          <div className={`p-3 rounded-xl border ${theme.subCardBg}`}>
                            <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold block uppercase">+ Abono Extra</span>
                            <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">+{formatCOP(extraAbono)}</span>
                          </div>
                          <div className={`p-3 rounded-xl border ${theme.subCardBg} col-span-2 sm:col-span-1`}>
                            <span className="text-[9px] text-indigo-600 dark:text-indigo-300 font-bold block uppercase">Pago Total/Mes</span>
                            <span className="text-xs font-black text-indigo-600 dark:text-indigo-300">{formatCOP(sortedDebts[0].minPayment + Number(extraAbono))}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <span className={`text-[10px] font-black uppercase tracking-wider block mb-3 ${theme.textMuted}`}>
                      Línea de Ataque a Pasivos ({sortedDebts.length} Deudas en Cola)
                    </span>
                    {sortedDebts.length === 0 ? (
                      <div className={`p-4 rounded-2xl border text-center text-xs text-slate-400 italic ${theme.subCardBg}`}>
                        Aún no has ingresado deudas. ¡Empieza a cargar tus datos en el Gestor de Deudas!
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {sortedDebts.slice(0, 3).map((debt, index) => (
                          <div 
                            key={debt.id} 
                            className={`p-3.5 rounded-2xl border text-xs relative ${
                              index === 0 
                                ? 'bg-amber-500/10 border-amber-500/40' 
                                : theme.subCardBg
                            }`}
                          >
                            <div className="flex justify-between items-center mb-1">
                              <span className={`font-black ${theme.textMain}`}>{debt.name}</span>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${index === 0 ? 'bg-amber-500 text-slate-950' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
                                #{index + 1}
                              </span>
                            </div>
                            <span className="font-black text-rose-500 dark:text-rose-400 block">{formatCOP(debt.balance)}</span>
                            {debt.totalInstallments > 0 && (
                              <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold block mt-1">
                                📊 Cuotas: {debt.paidInstallments}/{debt.totalInstallments} ({Math.round((debt.paidInstallments / debt.totalInstallments) * 100)}%)
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>

                <div className="lg:col-span-4 space-y-4">
                  <div className={`p-5 rounded-3xl border space-y-3 ${theme.cardBg}`}>
                    <span className={`text-[10px] font-black uppercase tracking-wider block ${theme.textMuted}`}>
                      Flujo Libre Restante / Mes
                    </span>
                    <h3 className={`text-3xl font-black font-mono ${totals.netCashflow >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                      {formatCOP(totals.netCashflow)}
                    </h3>
                    <p className={`text-[11px] ${theme.textMuted}`}>
                      Dinero libre mensual tras egresos totales ({formatCOP(totals.totalExpenses)}) y cuotas mínimas ({formatCOP(totals.totalMinDebtPayments)}).
                    </p>
                  </div>

                  <div className={`p-5 rounded-3xl border space-y-3 ${theme.cardBg}`}>
                    <div className="flex justify-between items-center">
                      <span className={`text-[10px] font-black uppercase tracking-wider ${theme.textMuted}`}>Deuda Total Acumulada</span>
                      <span className="text-xs bg-rose-500/10 text-rose-500 border border-rose-500/20 px-2 py-0.5 rounded-full font-bold">
                        Pasivos
                      </span>
                    </div>
                    <h3 className="text-3xl font-black text-rose-500 dark:text-rose-400 font-mono">
                      {formatCOP(totals.totalDebtBalance)}
                    </h3>
                    <p className={`text-[11px] ${theme.textMuted}`}>
                      Suma total de saldos pendientes en tarjetas y préstamos.
                    </p>
                  </div>

                  <div className={`p-5 rounded-3xl border space-y-2 ${isDarkMode ? 'bg-gradient-to-br from-indigo-950/80 via-blue-950/40 to-slate-900 border-indigo-500/30' : 'bg-gradient-to-br from-indigo-50 via-blue-50 to-white border-indigo-200'}`}>
                    <span className="text-[10px] font-black uppercase text-indigo-600 dark:text-indigo-300 tracking-wider block">
                      Tiempo Estimado de Cero Deudas
                    </span>
                    <h4 className="text-2xl font-black text-amber-500 dark:text-amber-400">
                      {simulation.monthsAccelerated}
                    </h4>
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 pt-1 border-t border-indigo-200 dark:border-indigo-500/20">
                      <span>🚀</span> Reduces aprox. {simulation.savedMonths} meses de cuotas
                    </p>
                  </div>

                </div>

              </div>

            </div>
          )}

          {activeTab === 'ingresos' && (
            <div className="space-y-6">
              <div className={`p-6 rounded-3xl border space-y-6 ${theme.cardBg}`}>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <h3 className="text-lg font-black text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                      <span>💵</span> Fuentes de Ingreso Variables de Marlin
                    </h3>
                    <p className={`text-xs mt-1 ${theme.textMuted}`}>
                      Registra entradas semanales, quincenales o mensuales para iniciar tu contabilidad.
                    </p>
                  </div>

                  <button
                    onClick={() => setShowAddIncomeModal(true)}
                    className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-black text-xs px-5 py-2.5 rounded-xl shadow-lg transition hover:scale-105 cursor-pointer"
                  >
                    ➕ Añadir Fuente de Ingreso
                  </button>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800/80">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className={`font-black uppercase border-b ${theme.tableHeader}`}>
                        <th className="p-3.5">Concepto / Fuente</th>
                        <th className="p-3.5">Frecuencia</th>
                        <th className="p-3.5 text-right">Monto por Periodo</th>
                        <th className="p-3.5 text-right">Equivalente Mensual</th>
                        <th className="p-3.5 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {incomes.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="p-8 text-center text-slate-400 italic">
                            No tienes ingresos registrados. Haz clic en "Añadir Fuente de Ingreso" para agregar el primero.
                          </td>
                        </tr>
                      ) : (
                        incomes.map(inc => {
                          const amt = Number(inc.amount) || 0;
                          const monthlyEq = inc.frequency === 'semanal' ? amt * 4.3333 : inc.frequency === 'quincenal' ? amt * 2 : amt;

                          return (
                            <tr key={inc.id} className={theme.tableRowHover}>
                              <td className={`p-3.5 font-bold ${theme.textMain}`}>{inc.concept}</td>
                              <td className="p-3.5">
                                <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase ${
                                  inc.frequency === 'semanal' ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300' :
                                  inc.frequency === 'quincenal' ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300' :
                                  'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300'
                                }`}>
                                  {inc.frequency}
                                </span>
                              </td>
                              <td className="p-3.5 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">{formatCOP(amt)}</td>
                              <td className="p-3.5 text-right font-black font-mono text-emerald-600 dark:text-emerald-400">{formatCOP(monthlyEq)}</td>
                              <td className="p-3.5 text-center flex justify-center gap-2">
                                <button
                                  onClick={() => handleOpenEditIncome(inc)}
                                  className="bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 px-2.5 py-1 rounded-lg text-[10px] font-black transition cursor-pointer"
                                >
                                  Editar ✏️
                                </button>
                                <button
                                  onClick={() => handleDeleteIncome(inc.id)}
                                  className="bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 border border-rose-500/20 px-2.5 py-1 rounded-lg text-[10px] font-black transition cursor-pointer"
                                >
                                  Eliminar 🗑️
                                </button>
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

          {activeTab === 'gastos' && (
            <div className="space-y-6">
              <div className={`p-6 rounded-3xl border space-y-6 ${theme.cardBg}`}>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <h3 className="text-lg font-black text-rose-500 dark:text-rose-400 flex items-center gap-2">
                      <span>🛒</span> Gastos Personales, Subsistencia & Fijos
                    </h3>
                    <p className={`text-xs mt-1 ${theme.textMuted}`}>
                      Clasifica tus egresos semanales, fijos y de subsistencia.
                    </p>
                  </div>

                  <button
                    onClick={() => setShowAddExpenseModal(true)}
                    className="bg-gradient-to-r from-rose-500 to-amber-500 text-white font-black text-xs px-5 py-2.5 rounded-xl shadow-lg transition hover:scale-105 cursor-pointer"
                  >
                    ➕ Registrar Gasto / Egreso
                  </button>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800/80">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className={`font-black uppercase border-b ${theme.tableHeader}`}>
                        <th className="p-3.5">Concepto</th>
                        <th className="p-3.5">Categoría</th>
                        <th className="p-3.5">Frecuencia</th>
                        <th className="p-3.5">Día de Pago</th>
                        <th className="p-3.5 text-right">Monto</th>
                        <th className="p-3.5 text-right">Equivalente Mensual</th>
                        <th className="p-3.5 text-center">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {expenses.length === 0 ? (
                        <tr>
                          <td colSpan="7" className="p-8 text-center text-slate-400 italic">
                            No hay gastos registrados. Haz clic en "Registrar Gasto / Egreso" para empezar a cargar tu información.
                          </td>
                        </tr>
                      ) : (
                        expenses.map(exp => {
                          const amt = Number(exp.amount) || 0;
                          const monthlyEq = exp.frequency === 'semanal' ? amt * 4.3333 : exp.frequency === 'quincenal' ? amt * 2 : amt;

                          return (
                            <tr key={exp.id} className={theme.tableRowHover}>
                              <td className={`p-3.5 font-bold ${theme.textMain}`}>{exp.concept}</td>
                              <td className="p-3.5">
                                <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-black ${
                                  exp.category === 'Subsistencia' ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300' :
                                  exp.category === 'Fijo' ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300' :
                                  'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300'
                                }`}>
                                  {exp.category}
                                </span>
                              </td>
                              <td className="p-3.5 uppercase text-[10px] font-bold text-slate-500">{exp.frequency}</td>
                              <td className="p-3.5">
                                {exp.dueDate ? (
                                  <span className="text-[10px] bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded font-black border border-amber-300 dark:border-amber-800">
                                    📅 {exp.dueDate}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 text-[10px]">-</span>
                                )}
                              </td>
                              <td className="p-3.5 text-right font-mono font-bold text-rose-500">{formatCOP(amt)}</td>
                              <td className="p-3.5 text-right font-black font-mono text-slate-700 dark:text-slate-300">{formatCOP(monthlyEq)}</td>
                              <td className="p-3.5 text-center flex justify-center gap-2">
                                <button
                                  onClick={() => handleOpenEditExpense(exp)}
                                  className="bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 px-2.5 py-1 rounded-lg text-[10px] font-black transition cursor-pointer"
                                >
                                  Editar ✏️
                                </button>
                                <button
                                  onClick={() => handleDeleteExpense(exp.id)}
                                  className="bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 border border-rose-500/20 px-2.5 py-1 rounded-lg text-[10px] font-black transition cursor-pointer"
                                >
                                  Eliminar 🗑️
                                </button>
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

          {activeTab === 'mapa' && (
            <div className="space-y-6">
              <div className={`p-6 rounded-3xl border space-y-6 ${theme.cardBg}`}>
                
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <h3 className="text-lg font-black text-amber-500 dark:text-amber-400 flex items-center gap-2">
                      <span>⚡</span> Simulador & Ruta de Priorización
                    </h3>
                    <p className={`text-xs mt-1 ${theme.textMuted}`}>
                      Ajusta tu abono extraordinario mensual y compara la velocidad de eliminación.
                    </p>
                  </div>

                  <div className={`w-full md:w-80 p-4 rounded-2xl border space-y-2 ${theme.subCardBg}`}>
                    <div className="flex justify-between text-xs font-black">
                      <span className="text-emerald-600 dark:text-emerald-400 uppercase">Abono Extra Mensual</span>
                      <span className={`font-mono ${theme.textMain}`}>{formatCOP(extraAbono)}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1500000"
                      step="50000"
                      value={extraAbono}
                      onChange={e => setExtraAbono(e.target.value)}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  {sortedDebts.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 italic">
                      No hay deudas registradas para simular. ¡Registra tus obligaciones en la sección Gestor de Deudas!
                    </div>
                  ) : (
                    sortedDebts.map((debt, index) => (
                      <div 
                        key={debt.id} 
                        className={`p-5 rounded-2xl border transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                          index === 0 
                            ? 'bg-amber-500/10 border-amber-500/50 shadow-lg shadow-amber-500/5' 
                            : theme.subCardBg
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm ${
                            index === 0 ? 'bg-amber-500 text-slate-950 shadow-md' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                          }`}>
                            #{index + 1}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className={`font-black text-sm ${theme.textMain}`}>{debt.name}</span>
                              {index === 0 && (
                                <span className="bg-amber-500/20 text-amber-600 dark:text-amber-300 text-[9px] font-black px-2.5 py-0.5 rounded-full border border-amber-500/30">
                                  🎯 ATACAR HOY
                                </span>
                              )}
                            </div>
                            <p className={`text-xs mt-0.5 ${theme.textMuted}`}>
                              {debt.entity} • Tasa: <strong className="text-amber-500 dark:text-amber-400">{debt.rate}% EA</strong>
                              {debt.dueDate && <span className="ml-2 text-indigo-600 dark:text-amber-300 font-bold">📅 Día de pago: {debt.dueDate}</span>}
                            </p>
                          </div>
                        </div>

                        <div className="text-left md:text-right w-full md:w-auto pt-3 md:pt-0 border-t md:border-t-0 border-slate-200 dark:border-slate-800">
                          <span className="font-black text-base text-rose-500 dark:text-rose-400 block font-mono">{formatCOP(debt.balance)}</span>
                          <span className={`text-[10px] font-medium ${theme.textMuted}`}>
                            Cuota: {formatCOP(debt.minPayment)} {index === 0 && extraAbono > 0 && `+ ${formatCOP(extraAbono)} extra`}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

              </div>
            </div>
          )}

          {activeTab === 'pasivos' && (
            <div className="space-y-8">
              
              {/* SECCIÓN 1: TARJETAS DE CRÉDITO Y PASIVOS ROTATIVOS */}
              <div className={`p-6 rounded-3xl border space-y-6 ${theme.cardBg}`}>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <h3 className="text-lg font-black text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                      <span>💳</span> Tarjetas de Crédito & Cupos Rotativos
                    </h3>
                    <p className={`text-xs mt-1 ${theme.textMuted}`}>
                      Pasivos con cuotas mensuales variables o diferidas según el extracto.
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setNewDebt({ name: '', entity: '', balance: '', minPayment: '', rate: '', category: 'Tarjeta (Variable)', dueDate: '', totalInstallments: '', paidInstallments: '' });
                      setShowAddDebtModal(true);
                    }}
                    className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-black text-xs px-4 py-2.5 rounded-xl shadow-lg transition hover:scale-105 cursor-pointer"
                  >
                    ➕ Registrar Tarjeta
                  </button>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800/80">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className={`font-black uppercase border-b ${theme.tableHeader}`}>
                        <th className="p-3.5">Tarjeta / Plástico</th>
                        <th className="p-3.5">Entidad</th>
                        <th className="p-3.5">Avance / Plazo</th>
                        <th className="p-3.5">Día Corte/Pago</th>
                        <th className="p-3.5 text-right">Tasa % EA</th>
                        <th className="p-3.5 text-right">Pago Mínimo Mes</th>
                        <th className="p-3.5 text-right">Saldo Usado</th>
                        <th className="p-3.5 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {categorizedDebts.cards.length === 0 ? (
                        <tr>
                          <td colSpan="8" className="p-6 text-center text-slate-400 italic">
                            No hay tarjetas de crédito registradas.
                          </td>
                        </tr>
                      ) : (
                        categorizedDebts.cards.map(debt => {
                          const totalCuotas = Number(debt.totalInstallments) || 0;
                          const pagadasCuotas = Number(debt.paidInstallments) || 0;
                          const pctAvance = totalCuotas > 0 ? Math.min(100, Math.round((pagadasCuotas / totalCuotas) * 100)) : 0;

                          return (
                            <tr key={debt.id} className={theme.tableRowHover}>
                              <td className={`p-3.5 font-bold ${theme.textMain}`}>{debt.name}</td>
                              <td className={`p-3.5 ${theme.textMuted}`}>{debt.entity}</td>

                              <td className="p-3.5">
                                {totalCuotas > 0 ? (
                                  <div className="space-y-1 min-w-[130px]">
                                    <div className="flex justify-between items-center text-[10px] font-bold">
                                      <span className={theme.textMain}>{pagadasCuotas} de {totalCuotas} cuotas</span>
                                      <span className="text-emerald-600 dark:text-emerald-400 font-mono font-black">{pctAvance}%</span>
                                    </div>
                                    <div className="w-full bg-slate-200 dark:bg-slate-950 h-2 rounded-full overflow-hidden p-0.5 border border-slate-300 dark:border-slate-800">
                                      <div 
                                        className="bg-gradient-to-r from-indigo-500 to-emerald-400 h-full rounded-full transition-all duration-500"
                                        style={{ width: `${pctAvance}%` }}
                                      />
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-slate-400 text-[10px] italic">Plazo libre / Rotativo</span>
                                )}
                              </td>

                              <td className="p-3.5">
                                {debt.dueDate ? (
                                  <span className="text-[10px] bg-indigo-100 dark:bg-slate-800 text-indigo-700 dark:text-amber-400 px-2 py-0.5 rounded font-black">
                                    Día {debt.dueDate}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 text-[10px]">-</span>
                                )}
                              </td>
                              <td className="p-3.5 text-right font-mono font-bold text-amber-500 dark:text-amber-400">{debt.rate}%</td>
                              <td className={`p-3.5 text-right font-bold ${theme.textMain}`}>{formatCOP(debt.minPayment)}</td>
                              <td className="p-3.5 text-right font-black text-rose-500 dark:text-rose-400 font-mono">{formatCOP(debt.balance)}</td>
                              <td className="p-3.5 text-center flex items-center justify-center gap-1.5">
                                {totalCuotas > 0 && (
                                  <button
                                    onClick={() => handleRegisterInstallmentPayment(debt.id)}
                                    title="Registrar pago (+1 cuota)"
                                    className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 px-2 py-1 rounded-lg text-[10px] font-black transition cursor-pointer"
                                  >
                                    +1 Cuota ⚡
                                  </button>
                                )}
                                <button
                                  onClick={() => handleOpenEditDebt(debt)}
                                  className="bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 px-2.5 py-1 rounded-lg text-[10px] font-black transition cursor-pointer"
                                >
                                  Editar ✏️
                                </button>
                                <button
                                  onClick={() => handleDeleteDebt(debt.id)}
                                  className="bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 border border-rose-500/20 px-2.5 py-1 rounded-lg text-[10px] font-black transition cursor-pointer"
                                >
                                  Eliminar 🗑️
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* SECCIÓN 2: PRÉSTAMOS A PLAZO Y GRÁFICOS DE REALIDAD DE DEUDA */}
              <div className={`p-6 rounded-3xl border space-y-6 ${theme.cardBg}`}>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <h3 className="text-lg font-black text-amber-500 dark:text-amber-400 flex items-center gap-2">
                      <span>🏛️</span> Préstamos a Plazo & Créditos Fijos
                    </h3>
                    <p className={`text-xs mt-1 ${theme.textMuted}`}>
                      Seguimiento de cuotas pactadas y porcentaje real de cumplimiento.
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setNewDebt({ name: '', entity: '', balance: '', minPayment: '', rate: '', category: 'Préstamo (Fijo)', dueDate: '', totalInstallments: '', paidInstallments: '' });
                      setShowAddDebtModal(true);
                    }}
                    className="bg-gradient-to-r from-amber-500 to-indigo-600 text-white font-black text-xs px-4 py-2.5 rounded-xl shadow-lg transition hover:scale-105 cursor-pointer"
                  >
                    ➕ Registrar Préstamo
                  </button>
                </div>

                {/* METRICAS Y PROGRESO GENERAL DE PRÉSTAMOS */}
                <div className={`p-5 rounded-2xl border space-y-3 ${theme.subCardBg}`}>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black uppercase text-indigo-600 dark:text-indigo-400 tracking-wider">
                      Avance Total en Cuotas Canceladas
                    </span>
                    <span className="text-xs font-black font-mono text-emerald-600 dark:text-emerald-400">
                      {categorizedDebts.loanMetrics.installmentsProgressPct}% Cumplido
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between">
                    <span className="text-2xl font-black font-mono">
                      {categorizedDebts.loanMetrics.totalPaidInstallmentsCount} <span className="text-xs font-normal text-slate-400">de {categorizedDebts.loanMetrics.totalInstallmentsCount} cuotas totales</span>
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      Faltan {Math.max(0, categorizedDebts.loanMetrics.totalInstallmentsCount - categorizedDebts.loanMetrics.totalPaidInstallmentsCount)} cuotas por pagar
                    </span>
                  </div>

                  <div className="w-full bg-slate-200 dark:bg-slate-950 h-3.5 rounded-full overflow-hidden p-0.5 border border-slate-300 dark:border-slate-800">
                    <div 
                      className="bg-gradient-to-r from-indigo-500 via-blue-500 to-emerald-400 h-full rounded-full transition-all duration-700"
                      style={{ width: `${categorizedDebts.loanMetrics.installmentsProgressPct}%` }}
                    />
                  </div>
                </div>

                {/* TABLA DE PRÉSTAMOS CON CONTADOR DE CUOTAS */}
                <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800/80">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className={`font-black uppercase border-b ${theme.tableHeader}`}>
                        <th className="p-3.5">Préstamo</th>
                        <th className="p-3.5">Entidad</th>
                        <th className="p-3.5">Avance de Cuotas</th>
                        <th className="p-3.5">Día de Pago</th>
                        <th className="p-3.5 text-right">Cuota Mensual</th>
                        <th className="p-3.5 text-right">Saldo Actual</th>
                        <th className="p-3.5 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {categorizedDebts.loans.length === 0 ? (
                        <tr>
                          <td colSpan="7" className="p-6 text-center text-slate-400 italic">
                            No hay préstamos a plazo registrados.
                          </td>
                        </tr>
                      ) : (
                        categorizedDebts.loans.map(debt => {
                          const totalCuotas = Number(debt.totalInstallments) || 0;
                          const pagadasCuotas = Number(debt.paidInstallments) || 0;
                          const pctAvance = totalCuotas > 0 ? Math.min(100, Math.round((pagadasCuotas / totalCuotas) * 100)) : 0;

                          return (
                            <tr key={debt.id} className={theme.tableRowHover}>
                              <td className={`p-3.5 font-bold ${theme.textMain}`}>{debt.name}</td>
                              <td className={`p-3.5 ${theme.textMuted}`}>{debt.entity}</td>

                              <td className="p-3.5">
                                {totalCuotas > 0 ? (
                                  <div className="space-y-1 min-w-[140px]">
                                    <div className="flex justify-between items-center text-[10px] font-bold">
                                      <span className={theme.textMain}>{pagadasCuotas} de {totalCuotas} cuotas</span>
                                      <span className="text-emerald-600 dark:text-emerald-400 font-mono font-black">{pctAvance}%</span>
                                    </div>
                                    <div className="w-full bg-slate-200 dark:bg-slate-950 h-2 rounded-full overflow-hidden p-0.5 border border-slate-300 dark:border-slate-800">
                                      <div 
                                        className="bg-gradient-to-r from-emerald-500 via-teal-400 to-indigo-500 h-full rounded-full transition-all duration-500"
                                        style={{ width: `${pctAvance}%` }}
                                      />
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-slate-400 text-[10px] italic">Sin plazo fijo</span>
                                )}
                              </td>

                              <td className="p-3.5">
                                {debt.dueDate ? (
                                  <span className="text-[10px] bg-amber-100 dark:bg-slate-800 text-amber-800 dark:text-amber-400 px-2 py-0.5 rounded font-black">
                                    Día {debt.dueDate}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 text-[10px]">-</span>
                                )}
                              </td>

                              <td className={`p-3.5 text-right font-bold ${theme.textMain}`}>{formatCOP(debt.minPayment)}</td>
                              <td className="p-3.5 text-right font-black text-rose-500 dark:text-rose-400 font-mono">{formatCOP(debt.balance)}</td>
                              
                              <td className="p-3.5 text-center flex items-center justify-center gap-1.5">
                                {totalCuotas > 0 && (
                                  <button
                                    onClick={() => handleRegisterInstallmentPayment(debt.id)}
                                    title="Registrar pago de cuota mensual (+1 cuota y descuenta saldo)"
                                    className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 px-2 py-1 rounded-lg text-[10px] font-black transition flex items-center gap-1 cursor-pointer"
                                  >
                                    <span>+1 Cuota ⚡</span>
                                  </button>
                                )}
                                <button
                                  onClick={() => handleOpenEditDebt(debt)}
                                  className="bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 px-2.5 py-1 rounded-lg text-[10px] font-black transition cursor-pointer"
                                >
                                  Editar ✏️
                                </button>
                                <button
                                  onClick={() => handleDeleteDebt(debt.id)}
                                  className="bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 border border-rose-500/20 px-2.5 py-1 rounded-lg text-[10px] font-black transition cursor-pointer"
                                >
                                  Eliminar 🗑️
                                </button>
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

          {activeTab === 'matriz' && (
            <div className="space-y-6">
              <div className={`p-6 rounded-3xl border space-y-6 ${theme.cardBg}`}>
                <h3 className="text-lg font-black text-amber-500 dark:text-amber-400 flex items-center gap-2">
                  <span>🎯</span> Distribución Presupuestal 50 / 30 / 20 para Marlin
                </h3>
                <p className={`text-xs ${theme.textMuted}`}>
                  Desglose ideal sobre tus ingresos mensuales equivalentes (<strong className={theme.textMain}>{formatCOP(totals.totalIncome)}</strong>):
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className={`p-5 rounded-2xl border space-y-2 ${theme.subCardBg}`}>
                    <span className="text-xs font-black uppercase text-emerald-600 dark:text-emerald-400 block">50% Necesidades Fijas</span>
                    <span className={`text-2xl font-black font-mono ${theme.textMain}`}>{formatCOP(totals.totalIncome * 0.5)}</span>
                    <p className={`text-[10px] pt-2 border-t border-slate-200 dark:border-slate-800 ${theme.textMuted}`}>
                      Egresos reales actuales: <strong className={theme.textMain}>{formatCOP(totals.totalExpenses)}</strong>
                    </p>
                  </div>

                  <div className={`p-5 rounded-2xl border space-y-2 ${theme.subCardBg}`}>
                    <span className="text-xs font-black uppercase text-amber-500 dark:text-amber-400 block">30% Deseos y Estilo de Vida</span>
                    <span className={`text-2xl font-black font-mono ${theme.textMain}`}>{formatCOP(totals.totalIncome * 0.3)}</span>
                    <p className={`text-[10px] pt-2 border-t border-slate-200 dark:border-slate-800 ${theme.textMuted}`}>
                      Tope recomendado para gastos opcionales.
                    </p>
                  </div>

                  <div className={`p-5 rounded-2xl border space-y-2 ${isDarkMode ? 'bg-gradient-to-br from-indigo-950/80 to-slate-900 border-indigo-500/30' : 'bg-gradient-to-br from-indigo-50 to-white border-indigo-200'}`}>
                    <span className="text-xs font-black uppercase text-indigo-600 dark:text-indigo-300 block">20% Ahorro & Deudas</span>
                    <span className={`text-2xl font-black font-mono ${theme.textMain}`}>{formatCOP(totals.totalIncome * 0.2)}</span>
                    <p className={`text-[10px] pt-2 border-t border-indigo-200 dark:border-indigo-500/20 ${theme.textMuted}`}>
                      Fondo estratégico para abonos extra a capital y reserva.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'reserva' && (
            <div className="space-y-6">
              <div className={`p-6 rounded-3xl border space-y-6 ${theme.cardBg}`}>
                <h3 className="text-lg font-black text-amber-500 dark:text-amber-400 flex items-center gap-2">
                  <span>🛡️</span> Fondo de Emergencia y Resiliencia
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                  <div className="space-y-4">
                    <div>
                      <label className={`block text-xs font-black uppercase mb-1 ${theme.textMuted}`}>
                        Monto Guardado Actualmente ($ COP)
                      </label>
                      <input
                        type="number"
                        value={emergencyFund.current}
                        onChange={e => setEmergencyFund(p => ({ ...p, current: Number(e.target.value) || 0 }))}
                        className={`w-full rounded-xl px-4 py-3 text-sm font-black font-mono ${theme.inputBg}`}
                      />
                    </div>

                    <div>
                      <label className={`block text-xs font-black uppercase mb-1 ${theme.textMuted}`}>
                        Objetivo de Cobertura (Meses de Gastos Fijos)
                      </label>
                      <select
                        value={emergencyFund.targetMonths}
                        onChange={e => setEmergencyFund(p => ({ ...p, targetMonths: Number(e.target.value) }))}
                        className={`w-full rounded-xl px-4 py-3 text-xs font-bold ${theme.inputBg}`}
                      >
                        <option value={1}>1 Mes ({formatCOP(totals.totalExpenses * 1)})</option>
                        <option value={3}>3 Meses ({formatCOP(totals.totalExpenses * 3)})</option>
                        <option value={6}>6 Meses ({formatCOP(totals.totalExpenses * 6)})</option>
                      </select>
                    </div>
                  </div>

                  <div className={`p-6 rounded-2xl border text-center space-y-3 ${theme.subCardBg}`}>
                    <span className={`text-xs font-black uppercase block tracking-wider ${theme.textMuted}`}>Cobertura de Reserva</span>
                    {(() => {
                      const targetAmount = totals.totalExpenses * emergencyFund.targetMonths;
                      const pct = targetAmount > 0 ? Math.min(100, Math.round((emergencyFund.current / targetAmount) * 100)) : 0;
                      return (
                        <>
                          <h4 className="text-5xl font-black text-amber-500 dark:text-amber-400 font-mono">{pct}%</h4>
                          <div className="w-full bg-slate-200 dark:bg-slate-950 h-4 rounded-xl border border-slate-300 dark:border-slate-800 overflow-hidden p-0.5">
                            <div 
                              className="bg-gradient-to-r from-amber-500 to-indigo-600 h-full rounded-lg transition-all duration-700" 
                              style={{ width: `${pct}%` }} 
                            />
                          </div>
                          <p className={`text-xs font-medium ${theme.textMuted}`}>
                            {formatCOP(emergencyFund.current)} de {formatCOP(targetAmount)} necesarios
                          </p>
                        </>
                      );
                    })()}
                  </div>
                </div>

              </div>
            </div>
          )}

          {activeTab === 'config' && (
            <div className="space-y-6">
              <div className={`p-6 rounded-3xl border space-y-6 ${theme.cardBg}`}>
                <div>
                  <h3 className="text-lg font-black text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                    <span>☁️</span> Sincronización con Google Drive (Google Sheets)
                  </h3>
                  <p className={`text-xs mt-1 ${theme.textMuted}`}>
                    Conecta tu hoja de cálculo "Finanzas Marlin" ingresando tu enlace /exec.
                  </p>
                </div>

                <div className={`p-5 rounded-2xl border space-y-4 ${theme.subCardBg}`}>
                  <div>
                    <label className={`block text-xs font-black uppercase mb-1 ${theme.textMuted}`}>
                      Enlace de Aplicación Web de Google Apps Script (/exec)
                    </label>
                    <input
                      type="text"
                      placeholder="👉 PEGA AQUÍ TU ENLACE LARGO DE GOOGLE APPS SCRIPT (/exec) 👈"
                      value={sheetsUrl}
                      onChange={e => setSheetsUrl(e.target.value)}
                      className={`w-full rounded-xl px-4 py-3 text-xs font-mono ${theme.inputBg}`}
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <button
                      onClick={handleSaveSheetsUrl}
                      className="bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold text-xs py-3 px-4 rounded-xl flex-1 border border-slate-300 dark:border-slate-700 cursor-pointer"
                    >
                      💾 Guardar URL
                    </button>

                    <button
                      onClick={() => syncToGoogleDrive(incomes, expenses, debts, emergencyFund, false)}
                      disabled={syncing}
                      className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-black text-xs py-3 px-4 rounded-xl flex-1 shadow-lg disabled:opacity-50 cursor-pointer"
                    >
                      {syncing ? 'Subiendo...' : '☁️ Guardar Datos a Google Drive'}
                    </button>

                    <button
                      onClick={handleDownloadFromDrive}
                      disabled={syncing}
                      className="bg-emerald-600 text-white font-black text-xs py-3 px-4 rounded-xl flex-1 shadow-lg disabled:opacity-50 cursor-pointer"
                    >
                      {syncing ? 'Descargando...' : '🔄 Cargar Datos desde Google Drive'}
                    </button>
                  </div>
                </div>

                <div className={`p-5 rounded-2xl border space-y-3 bg-rose-500/5 border-rose-500/20`}>
                  <span className="font-black text-xs uppercase text-rose-500 block">🧹 Reiniciar Todo en Cero:</span>
                  <p className="text-xs text-slate-400">
                    Si quieres vaciar la memoria local para empezar tus registros completamente limpios desde cero, usa este botón:
                  </p>
                  <button
                    onClick={handleClearAllData}
                    className="bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 border border-rose-500/30 font-black text-xs py-2.5 px-4 rounded-xl cursor-pointer transition"
                  >
                    🗑️ Reiniciar todo en cero
                  </button>
                </div>

              </div>
            </div>
          )}

        </main>

        <footer className={`mt-auto border-t py-6 text-center text-xs font-medium ${theme.textMuted} border-slate-200 dark:border-slate-800/80`}>
          <p>© 2026 Finanzas Marlin • Cockpit Estratégico Personalizado</p>
        </footer>

      </div>

      {/* MODAL: AGREGAR DEUDA */}
      {showAddDebtModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className={`w-full max-w-md p-6 rounded-3xl border shadow-2xl ${theme.cardBg}`}>
            <div className="flex justify-between items-center border-b pb-3 mb-4 border-slate-200 dark:border-slate-800">
              <h3 className="text-xs font-black text-amber-500 dark:text-amber-400 uppercase tracking-wider">💳 Registrar Nuevo Pasivo</h3>
              <button onClick={() => setShowAddDebtModal(false)} className="text-slate-400 hover:text-rose-500 text-xs font-bold p-1">Cerrar ❌</button>
            </div>

            <form onSubmit={handleAddDebt} className="space-y-3">
              <div>
                <label className={`block text-[10px] font-black uppercase mb-1 ${theme.textMuted}`}>Nombre Deuda / Crédito</label>
                <input 
                  type="text" 
                  placeholder="Ej: Tarjeta Nu, Crédito Vehículo"
                  value={newDebt.name} 
                  onChange={e => setNewDebt(p => ({ ...p, name: e.target.value }))} 
                  className={`w-full rounded-xl px-3 py-2 text-xs ${theme.inputBg}`} 
                  required 
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-[10px] font-black uppercase mb-1 ${theme.textMuted}`}>Entidad</label>
                  <input 
                    type="text" 
                    placeholder="Ej: Nu Bank, Bancolombia"
                    value={newDebt.entity} 
                    onChange={e => setNewDebt(p => ({ ...p, entity: e.target.value }))} 
                    className={`w-full rounded-xl px-3 py-2 text-xs ${theme.inputBg}`} 
                  />
                </div>
                <div>
                  <label className={`block text-[10px] font-black uppercase mb-1 ${theme.textMuted}`}>Categoría</label>
                  <select 
                    value={newDebt.category} 
                    onChange={e => setNewDebt(p => ({ ...p, category: e.target.value }))} 
                    className={`w-full rounded-xl px-3 py-2 text-xs font-bold ${theme.inputBg}`}
                  >
                    <option value="Tarjeta (Variable)">Tarjeta de Crédito (Variable)</option>
                    <option value="Préstamo (Fijo)">Préstamo Bancario (Cuota Fija)</option>
                    <option value="Personal">Deuda Personal</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={`block text-[10px] font-black uppercase mb-1 ${theme.textMuted}`}>Saldo Actual ($ COP)</label>
                  <input 
                    type="number" 
                    placeholder="Ej: 1500000"
                    value={newDebt.balance} 
                    onChange={e => setNewDebt(p => ({ ...p, balance: e.target.value }))} 
                    className={`w-full rounded-xl px-3 py-2 text-xs font-black ${theme.inputBg}`} 
                    required 
                  />
                </div>
                <div>
                  <label className={`block text-[10px] font-black uppercase mb-1 ${theme.textMuted}`}>Cuota Mínima</label>
                  <input 
                    type="number" 
                    placeholder="Ej: 120000"
                    value={newDebt.minPayment} 
                    onChange={e => setNewDebt(p => ({ ...p, minPayment: e.target.value }))} 
                    className={`w-full rounded-xl px-3 py-2 text-xs font-black ${theme.inputBg}`} 
                  />
                </div>
                <div>
                  <label className={`block text-[10px] font-black uppercase mb-1 ${theme.textMuted}`}>Tasa % EA</label>
                  <input 
                    type="number" 
                    step="0.1"
                    placeholder="Ej: 28.5"
                    value={newDebt.rate} 
                    onChange={e => setNewDebt(p => ({ ...p, rate: e.target.value }))} 
                    className={`w-full rounded-xl px-3 py-2 text-xs ${theme.inputBg}`} 
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={`block text-[10px] font-black uppercase mb-1 ${theme.textMuted}`}>Día de Pago</label>
                  <input 
                    type="text" 
                    placeholder="Ej: 15"
                    value={newDebt.dueDate} 
                    onChange={e => setNewDebt(p => ({ ...p, dueDate: e.target.value }))} 
                    className={`w-full rounded-xl px-3 py-2 text-xs ${theme.inputBg}`} 
                  />
                </div>
                <div>
                  <label className={`block text-[10px] font-black uppercase mb-1 ${theme.textMuted}`}>Total Cuotas</label>
                  <input 
                    type="number" 
                    placeholder="Ej: 12"
                    value={newDebt.totalInstallments} 
                    onChange={e => setNewDebt(p => ({ ...p, totalInstallments: e.target.value }))} 
                    className={`w-full rounded-xl px-3 py-2 text-xs font-bold ${theme.inputBg}`} 
                  />
                </div>
                <div>
                  <label className={`block text-[10px] font-black uppercase mb-1 ${theme.textMuted}`}>Cuotas Pagadas</label>
                  <input 
                    type="number" 
                    placeholder="Ej: 0"
                    value={newDebt.paidInstallments} 
                    onChange={e => setNewDebt(p => ({ ...p, paidInstallments: e.target.value }))} 
                    className={`w-full rounded-xl px-3 py-2 text-xs font-bold ${theme.inputBg}`} 
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-3">
                <button 
                  type="button" 
                  onClick={() => setShowAddDebtModal(false)} 
                  className="w-1/3 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs py-2.5 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="flex-1 bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-black text-xs py-2.5 rounded-xl shadow-lg cursor-pointer"
                >
                  Guardar Pasivo 💳
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDITAR DEUDA */}
      {editingDebt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className={`w-full max-w-md p-6 rounded-3xl border shadow-2xl ${theme.cardBg}`}>
            <div className="flex justify-between items-center border-b pb-3 mb-4 border-slate-200 dark:border-slate-800">
              <h3 className="text-xs font-black text-amber-500 dark:text-amber-400 uppercase tracking-wider">✏️ Editar Pasivo / Préstamo</h3>
              <button onClick={() => setEditingDebt(null)} className="text-slate-400 hover:text-rose-500 text-xs font-bold p-1">Cerrar ❌</button>
            </div>

            <form onSubmit={handleSaveEditDebt} className="space-y-3">
              <div>
                <label className={`block text-[10px] font-black uppercase mb-1 ${theme.textMuted}`}>Nombre Deuda / Crédito</label>
                <input 
                  type="text" 
                  value={editingDebt.name} 
                  onChange={e => setEditingDebt(p => ({ ...p, name: e.target.value }))} 
                  className={`w-full rounded-xl px-3 py-2 text-xs ${theme.inputBg}`} 
                  required 
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-[10px] font-black uppercase mb-1 ${theme.textMuted}`}>Entidad</label>
                  <input 
                    type="text" 
                    value={editingDebt.entity} 
                    onChange={e => setEditingDebt(p => ({ ...p, entity: e.target.value }))} 
                    className={`w-full rounded-xl px-3 py-2 text-xs ${theme.inputBg}`} 
                  />
                </div>
                <div>
                  <label className={`block text-[10px] font-black uppercase mb-1 ${theme.textMuted}`}>Categoría</label>
                  <select 
                    value={editingDebt.category} 
                    onChange={e => setEditingDebt(p => ({ ...p, category: e.target.value }))} 
                    className={`w-full rounded-xl px-3 py-2 text-xs font-bold ${theme.inputBg}`}
                  >
                    <option value="Tarjeta (Variable)">Tarjeta de Crédito (Variable)</option>
                    <option value="Préstamo (Fijo)">Préstamo Bancario (Cuota Fija)</option>
                    <option value="Personal">Deuda Personal</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={`block text-[10px] font-black uppercase mb-1 ${theme.textMuted}`}>Saldo Actual ($)</label>
                  <input 
                    type="number" 
                    value={editingDebt.balance} 
                    onChange={e => setEditingDebt(p => ({ ...p, balance: e.target.value }))} 
                    className={`w-full rounded-xl px-3 py-2 text-xs font-black ${theme.inputBg}`} 
                    required 
                  />
                </div>
                <div>
                  <label className={`block text-[10px] font-black uppercase mb-1 ${theme.textMuted}`}>Cuota Mínima</label>
                  <input 
                    type="number" 
                    value={editingDebt.minPayment} 
                    onChange={e => setEditingDebt(p => ({ ...p, minPayment: e.target.value }))} 
                    className={`w-full rounded-xl px-3 py-2 text-xs font-black ${theme.inputBg}`} 
                  />
                </div>
                <div>
                  <label className={`block text-[10px] font-black uppercase mb-1 ${theme.textMuted}`}>Tasa % EA</label>
                  <input 
                    type="number" 
                    step="0.1"
                    value={editingDebt.rate} 
                    onChange={e => setEditingDebt(p => ({ ...p, rate: e.target.value }))} 
                    className={`w-full rounded-xl px-3 py-2 text-xs ${theme.inputBg}`} 
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={`block text-[10px] font-black uppercase mb-1 ${theme.textMuted}`}>Día de Pago</label>
                  <input 
                    type="text" 
                    value={editingDebt.dueDate || ''} 
                    onChange={e => setEditingDebt(p => ({ ...p, dueDate: e.target.value }))} 
                    className={`w-full rounded-xl px-3 py-2 text-xs ${theme.inputBg}`} 
                  />
                </div>
                <div>
                  <label className={`block text-[10px] font-black uppercase mb-1 ${theme.textMuted}`}>Total Cuotas</label>
                  <input 
                    type="number" 
                    value={editingDebt.totalInstallments || ''} 
                    onChange={e => setEditingDebt(p => ({ ...p, totalInstallments: e.target.value }))} 
                    className={`w-full rounded-xl px-3 py-2 text-xs font-bold ${theme.inputBg}`} 
                  />
                </div>
                <div>
                  <label className={`block text-[10px] font-black uppercase mb-1 ${theme.textMuted}`}>Cuotas Pagadas</label>
                  <input 
                    type="number" 
                    value={editingDebt.paidInstallments || ''} 
                    onChange={e => setEditingDebt(p => ({ ...p, paidInstallments: e.target.value }))} 
                    className={`w-full rounded-xl px-3 py-2 text-xs font-bold ${theme.inputBg}`} 
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-3">
                <button 
                  type="button" 
                  onClick={() => setEditingDebt(null)} 
                  className="w-1/3 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs py-2.5 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="flex-1 bg-gradient-to-r from-amber-500 to-indigo-600 text-white font-black text-xs py-2.5 rounded-xl shadow-lg cursor-pointer"
                >
                  Guardar Cambios ✏️
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: AGREGAR INGRESO */}
      {showAddIncomeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className={`w-full max-w-md p-6 rounded-3xl border shadow-2xl ${theme.cardBg}`}>
            <div className="flex justify-between items-center border-b pb-3 mb-4 border-slate-200 dark:border-slate-800">
              <h3 className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">💵 Registrar Fuente de Ingreso</h3>
              <button onClick={() => setShowAddIncomeModal(false)} className="text-slate-400 hover:text-rose-500 text-xs font-bold p-1">Cerrar ❌</button>
            </div>

            <form onSubmit={handleAddIncome} className="space-y-3">
              <div>
                <label className={`block text-[10px] font-black uppercase mb-1 ${theme.textMuted}`}>Concepto / Fuente</label>
                <input 
                  type="text" 
                  placeholder="Ej: Salario, Ventas, Trabajo Ocasional"
                  value={newIncome.concept} 
                  onChange={e => setNewIncome(p => ({ ...p, concept: e.target.value }))} 
                  className={`w-full rounded-xl px-3 py-2 text-xs ${theme.inputBg}`} 
                  required 
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-[10px] font-black uppercase mb-1 ${theme.textMuted}`}>Monto ($ COP)</label>
                  <input 
                    type="number" 
                    placeholder="Ej: 500000"
                    value={newIncome.amount} 
                    onChange={e => setNewIncome(p => ({ ...p, amount: e.target.value }))} 
                    className={`w-full rounded-xl px-3 py-2 text-xs font-black ${theme.inputBg}`} 
                    required 
                  />
                </div>

                <div>
                  <label className={`block text-[10px] font-black uppercase mb-1 ${theme.textMuted}`}>Frecuencia</label>
                  <select 
                    value={newIncome.frequency} 
                    onChange={e => setNewIncome(p => ({ ...p, frequency: e.target.value }))} 
                    className={`w-full rounded-xl px-3 py-2 text-xs font-bold ${theme.inputBg}`}
                  >
                    <option value="semanal">Semanal</option>
                    <option value="quincenal">Quincenal</option>
                    <option value="mensual">Mensual</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-3">
                <button 
                  type="button" 
                  onClick={() => setShowAddIncomeModal(false)} 
                  className="w-1/3 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs py-2.5 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="flex-1 bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-black text-xs py-2.5 rounded-xl shadow-lg cursor-pointer"
                >
                  Guardar Ingreso 💵
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDITAR INGRESO */}
      {editingIncome && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className={`w-full max-w-md p-6 rounded-3xl border shadow-2xl ${theme.cardBg}`}>
            <div className="flex justify-between items-center border-b pb-3 mb-4 border-slate-200 dark:border-slate-800">
              <h3 className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">✏️ Editar Fuente de Ingreso</h3>
              <button onClick={() => setEditingIncome(null)} className="text-slate-400 hover:text-rose-500 text-xs font-bold p-1">Cerrar ❌</button>
            </div>

            <form onSubmit={handleSaveEditIncome} className="space-y-3">
              <div>
                <label className={`block text-[10px] font-black uppercase mb-1 ${theme.textMuted}`}>Concepto / Fuente</label>
                <input 
                  type="text" 
                  value={editingIncome.concept} 
                  onChange={e => setEditingIncome(p => ({ ...p, concept: e.target.value }))} 
                  className={`w-full rounded-xl px-3 py-2 text-xs ${theme.inputBg}`} 
                  required 
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-[10px] font-black uppercase mb-1 ${theme.textMuted}`}>Monto ($ COP)</label>
                  <input 
                    type="number" 
                    value={editingIncome.amount} 
                    onChange={e => setEditingIncome(p => ({ ...p, amount: e.target.value }))} 
                    className={`w-full rounded-xl px-3 py-2 text-xs font-black ${theme.inputBg}`} 
                    required 
                  />
                </div>

                <div>
                  <label className={`block text-[10px] font-black uppercase mb-1 ${theme.textMuted}`}>Frecuencia</label>
                  <select 
                    value={editingIncome.frequency} 
                    onChange={e => setEditingIncome(p => ({ ...p, frequency: e.target.value }))} 
                    className={`w-full rounded-xl px-3 py-2 text-xs font-bold ${theme.inputBg}`}
                  >
                    <option value="semanal">Semanal</option>
                    <option value="quincenal">Quincenal</option>
                    <option value="mensual">Mensual</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-3">
                <button 
                  type="button" 
                  onClick={() => setEditingIncome(null)} 
                  className="w-1/3 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs py-2.5 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="flex-1 bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-black text-xs py-2.5 rounded-xl shadow-lg cursor-pointer"
                >
                  Guardar Cambios ✏️
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: AGREGAR GASTO */}
      {showAddExpenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className={`w-full max-w-md p-6 rounded-3xl border shadow-2xl ${theme.cardBg}`}>
            <div className="flex justify-between items-center border-b pb-3 mb-4 border-slate-200 dark:border-slate-800">
              <h3 className="text-xs font-black text-rose-500 uppercase tracking-wider">🛒 Registrar Gasto / Egreso</h3>
              <button onClick={() => setShowAddExpenseModal(false)} className="text-slate-400 hover:text-rose-500 text-xs font-bold p-1">Cerrar ❌</button>
            </div>

            <form onSubmit={handleAddExpense} className="space-y-3">
              <div>
                <label className={`block text-[10px] font-black uppercase mb-1 ${theme.textMuted}`}>Concepto del Gasto</label>
                <input 
                  type="text" 
                  placeholder="Ej: Mercado, Arriendo, Servicios"
                  value={newExpense.concept} 
                  onChange={e => setNewExpense(p => ({ ...p, concept: e.target.value }))} 
                  className={`w-full rounded-xl px-3 py-2 text-xs ${theme.inputBg}`} 
                  required 
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-[10px] font-black uppercase mb-1 ${theme.textMuted}`}>Monto ($ COP)</label>
                  <input 
                    type="number" 
                    placeholder="Ej: 200000"
                    value={newExpense.amount} 
                    onChange={e => setNewExpense(p => ({ ...p, amount: e.target.value }))} 
                    className={`w-full rounded-xl px-3 py-2 text-xs font-black ${theme.inputBg}`} 
                    required 
                  />
                </div>

                <div>
                  <label className={`block text-[10px] font-black uppercase mb-1 ${theme.textMuted}`}>Frecuencia</label>
                  <select 
                    value={newExpense.frequency} 
                    onChange={e => setNewExpense(p => ({ ...p, frequency: e.target.value }))} 
                    className={`w-full rounded-xl px-3 py-2 text-xs font-bold ${theme.inputBg}`}
                  >
                    <option value="semanal">Semanal</option>
                    <option value="quincenal">Quincenal</option>
                    <option value="mensual">Mensual</option>
                  </select>
                </div>
              </div>

              <div>
                <label className={`block text-[10px] font-black uppercase mb-1 ${theme.textMuted}`}>Categoría</label>
                <select 
                  value={newExpense.category} 
                  onChange={e => setNewExpense(p => ({ ...p, category: e.target.value }))} 
                  className={`w-full rounded-xl px-3 py-2 text-xs font-bold ${theme.inputBg}`}
                >
                  <option value="Fijo">Gasto Fijo / Obligación</option>
                  <option value="Subsistencia">Subsistencia / Alimentación</option>
                  <option value="Deseo">Estilo de Vida / Deseo</option>
                </select>
              </div>

              <div>
                <label className={`block text-[10px] font-black uppercase mb-1 ${theme.textMuted}`}>Día de Pago</label>
                <input 
                  type="text" 
                  placeholder="Ej: 5 o 15, 30"
                  value={newExpense.dueDate} 
                  onChange={e => setNewExpense(p => ({ ...p, dueDate: e.target.value }))} 
                  className={`w-full rounded-xl px-3 py-2 text-xs ${theme.inputBg}`} 
                />
              </div>

              <div className="flex gap-3 pt-3">
                <button 
                  type="button" 
                  onClick={() => setShowAddExpenseModal(false)} 
                  className="w-1/3 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs py-2.5 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="flex-1 bg-gradient-to-r from-rose-500 to-amber-500 text-white font-black text-xs py-2.5 rounded-xl shadow-lg cursor-pointer"
                >
                  Guardar Egreso 🛒
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDITAR GASTO */}
      {editingExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className={`w-full max-w-md p-6 rounded-3xl border shadow-2xl ${theme.cardBg}`}>
            <div className="flex justify-between items-center border-b pb-3 mb-4 border-slate-200 dark:border-slate-800">
              <h3 className="text-xs font-black text-rose-500 uppercase tracking-wider">✏️ Editar Gasto / Egreso</h3>
              <button onClick={() => setEditingExpense(null)} className="text-slate-400 hover:text-rose-500 text-xs font-bold p-1">Cerrar ❌</button>
            </div>

            <form onSubmit={handleSaveEditExpense} className="space-y-3">
              <div>
                <label className={`block text-[10px] font-black uppercase mb-1 ${theme.textMuted}`}>Concepto del Gasto</label>
                <input 
                  type="text" 
                  value={editingExpense.concept} 
                  onChange={e => setEditingExpense(p => ({ ...p, concept: e.target.value }))} 
                  className={`w-full rounded-xl px-3 py-2 text-xs ${theme.inputBg}`} 
                  required 
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-[10px] font-black uppercase mb-1 ${theme.textMuted}`}>Monto ($ COP)</label>
                  <input 
                    type="number" 
                    value={editingExpense.amount} 
                    onChange={e => setEditingExpense(p => ({ ...p, amount: e.target.value }))} 
                    className={`w-full rounded-xl px-3 py-2 text-xs font-black ${theme.inputBg}`} 
                    required 
                  />
                </div>

                <div>
                  <label className={`block text-[10px] font-black uppercase mb-1 ${theme.textMuted}`}>Frecuencia</label>
                  <select 
                    value={editingExpense.frequency} 
                    onChange={e => setEditingExpense(p => ({ ...p, frequency: e.target.value }))} 
                    className={`w-full rounded-xl px-3 py-2 text-xs font-bold ${theme.inputBg}`}
                  >
                    <option value="semanal">Semanal</option>
                    <option value="quincenal">Quincenal</option>
                    <option value="mensual">Mensual</option>
                  </select>
                </div>
              </div>

              <div>
                <label className={`block text-[10px] font-black uppercase mb-1 ${theme.textMuted}`}>Categoría</label>
                <select 
                  value={editingExpense.category} 
                  onChange={e => setEditingExpense(p => ({ ...p, category: e.target.value }))} 
                  className={`w-full rounded-xl px-3 py-2 text-xs font-bold ${theme.inputBg}`}
                >
                  <option value="Fijo">Gasto Fijo / Obligación</option>
                  <option value="Subsistencia">Subsistencia / Alimentación</option>
                  <option value="Deseo">Estilo de Vida / Deseo</option>
                </select>
              </div>

              <div>
                <label className={`block text-[10px] font-black uppercase mb-1 ${theme.textMuted}`}>Día de Pago</label>
                <input 
                  type="text" 
                  value={editingExpense.dueDate || ''} 
                  onChange={e => setEditingExpense(p => ({ ...p, dueDate: e.target.value }))} 
                  className={`w-full rounded-xl px-3 py-2 text-xs ${theme.inputBg}`} 
                />
              </div>

              <div className="flex gap-3 pt-3">
                <button 
                  type="button" 
                  onClick={() => setEditingExpense(null)} 
                  className="w-1/3 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs py-2.5 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="flex-1 bg-gradient-to-r from-rose-500 to-amber-500 text-white font-black text-xs py-2.5 rounded-xl shadow-lg cursor-pointer"
                >
                  Guardar Cambios ✏️
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
