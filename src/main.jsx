import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { supabase } from "./supabase";
import "./styles.css";

const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 2,
});

const CATEGORIES = [
  "Food", "Transportation", "School", "Bills", "Shopping",
  "Entertainment", "Health", "Family", "Other"
];

const ACCOUNT_LABELS = {
  allowance: "Allowance",
  savings: "Savings",
};

function monthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function monthLabel(key) {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric" })
    .format(new Date(year, month - 1, 1));
}

function money(value) {
  return peso.format(Number(value || 0));
}

function App() {
  const [session, setSession] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoadingAuth(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoadingAuth(false);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (loadingAuth) return <div className="screen-center"><div className="spinner" /></div>;
  if (!session) return <AuthScreen />;
  return <Dashboard session={session} />;
}

function AuthScreen() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage("");

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: name } },
      });
      if (error) setMessage(error.message);
      else setMessage("Account created. Check your email if confirmation is enabled, then log in.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(error.message);
    }
    setBusy(false);
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="logo-mark">₱</div>
        <h1>Budget Buddy</h1>
        <p className="muted">A private place to keep track of your money.</p>

        <div className="tabs">
          <button className={mode === "login" ? "active" : ""} onClick={() => {setMode("login"); setMessage("");}}>Log in</button>
          <button className={mode === "signup" ? "active" : ""} onClick={() => {setMode("signup"); setMessage("");}}>Create account</button>
        </div>

        <form onSubmit={submit}>
          {mode === "signup" && (
            <label>
              Name
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" required />
            </label>
          )}
          <label>
            Email
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" minLength="6" required />
          </label>
          <button className="primary wide" disabled={busy}>
            {busy ? "Please wait..." : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>

        {message && <div className="notice">{message}</div>}
        <p className="tiny">Each account has its own private transactions and budgets.</p>
      </section>
    </main>
  );
}

function Dashboard({ session }) {
  const [settings, setSettings] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [month, setMonth] = useState(monthKey());
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [error, setError] = useState("");

  const userName = session.user.user_metadata?.display_name || session.user.email?.split("@")[0] || "there";

  async function load() {
    setLoading(true);
    setError("");

    const [s, t, b] = await Promise.all([
      supabase.from("profiles").select("*").single(),
      supabase.from("transactions").select("*").order("transaction_date", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("monthly_budgets").select("*").eq("month", month).order("category"),
    ]);

    if (s.error && s.error.code !== "PGRST116") setError(s.error.message);
    if (t.error) setError(t.error.message);
    if (b.error) setError(b.error.message);

    setSettings(s.data);
    setTransactions(t.data || []);
    setBudgets(b.data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [month]);

  const monthTransactions = useMemo(
    () => transactions.filter(t => t.transaction_date?.slice(0, 7) === month),
    [transactions, month]
  );

  const balances = useMemo(() => {
    const allowanceIncome = 14000;
    const savingsStarting = Number(settings?.starting_savings ?? 25000);
    let allowance = allowanceIncome;
    let savings = savingsStarting;

    for (const t of transactions) {
      const amount = Number(t.amount);
      if (t.account === "allowance") {
        allowance += t.type === "income" ? amount : -amount;
      } else if (t.account === "savings") {
        savings += t.type === "income" ? amount : -amount;
      }
    }
    return { allowance, savings, total: allowance + savings };
  }, [transactions, settings]);

  const monthlyStats = useMemo(() => {
    let income = 14000;
    let expenses = 0;
    for (const t of monthTransactions) {
      if (t.type === "income") income += Number(t.amount);
      if (t.type === "expense") expenses += Number(t.amount);
    }
    return { income, expenses, remaining: income - expenses };
  }, [monthTransactions]);

  const categorySpend = useMemo(() => {
    const map = {};
    monthTransactions.filter(t => t.type === "expense").forEach(t => {
      map[t.category] = (map[t.category] || 0) + Number(t.amount);
    });
    return map;
  }, [monthTransactions]);

  async function saveProfile(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      display_name: form.get("display_name"),
      monthly_allowance: Number(form.get("monthly_allowance")),
      starting_savings: Number(form.get("starting_savings")),
    };
    const { error } = await supabase.from("profiles").upsert({ ...payload, id: session.user.id });
    if (error) setError(error.message);
    else { setSettings(payload); setModal(null); await load(); }
  }

  async function addTransaction(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const type = form.get("type");
    const amount = Number(form.get("amount"));
    if (!amount || amount <= 0) return;

    const payload = {
      user_id: session.user.id,
      type,
      amount,
      account: form.get("account"),
      category: type === "expense" ? form.get("category") : "Income",
      description: form.get("description") || null,
      transaction_date: form.get("transaction_date"),
    };

    const { error } = await supabase.from("transactions").insert(payload);
    if (error) setError(error.message);
    else { setModal(null); await load(); }
  }

  async function deleteTransaction(id) {
    if (!confirm("Delete this transaction?")) return;
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) setError(error.message);
    else await load();
  }

  async function saveBudget(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const category = form.get("category");
    const amount = Number(form.get("amount"));
    const { error } = await supabase.from("monthly_budgets").upsert({
      user_id: session.user.id,
      month,
      category,
      amount,
    }, { onConflict: "user_id,month,category" });
    if (error) setError(error.message);
    else { setModal(null); await load(); }
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  const greeting = settings?.display_name || userName;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand">₱ Budget Buddy</div>
          <div className="tiny">Personal finance dashboard</div>
        </div>
        <div className="top-actions">
          <span className="user-email">{session.user.email}</span>
          <button className="ghost" onClick={() => setModal("settings")}>Settings</button>
          <button className="ghost" onClick={signOut}>Log out</button>
        </div>
      </header>

      <main className="container">
        {error && <div className="error-banner">{error}<button onClick={() => setError("")}>×</button></div>}

        <section className="welcome">
          <div>
            <p className="eyebrow">WELCOME BACK</p>
            <h2>Hi, {greeting} 👋</h2>
            <p className="muted">Here's how your money is looking.</p>
          </div>
          <div className="month-picker">
            <button onClick={() => shiftMonth(-1)}>‹</button>
            <strong>{monthLabel(month)}</strong>
            <button onClick={() => shiftMonth(1)}>›</button>
          </div>
        </section>

        <section className="cards">
          <StatCard title="Total balance" value={money(balances.total)} sub="Allowance + savings" />
          <StatCard title="Allowance balance" value={money(balances.allowance)} sub="Your monthly spending pool" />
          <StatCard title="Savings" value={money(balances.savings)} sub="Kept separately" />
          <StatCard title="Spent this month" value={money(monthlyStats.expenses)} sub={`${money(monthlyStats.remaining)} left from monthly income`} />
        </section>

        <section className="quick-actions">
          <button className="primary" onClick={() => setModal("transaction-income")}>＋ Money received</button>
          <button className="danger" onClick={() => setModal("transaction-expense")}>− Add expense</button>
          <button className="secondary" onClick={() => setModal("budget")}>Set monthly budget</button>
        </section>

        <div className="grid">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h3>Monthly budget</h3>
                <p className="muted">{monthLabel(month)}</p>
              </div>
              <button className="link-btn" onClick={() => setModal("budget")}>＋ category</button>
            </div>

            <div className="budget-list">
              {budgets.length === 0 && <Empty text="No category budgets yet. Add one to start planning." />}
              {budgets.map(b => {
                const spent = categorySpend[b.category] || 0;
                const pct = b.amount ? Math.min(100, (spent / b.amount) * 100) : 0;
                return (
                  <div className="budget-row" key={b.id}>
                    <div className="budget-top">
                      <span>{b.category}</span>
                      <span>{money(spent)} / {money(b.amount)}</span>
                    </div>
                    <div className="progress"><span style={{ width: `${pct}%` }} /></div>
                    <div className="tiny">{money(Math.max(0, Number(b.amount) - spent))} remaining</div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <h3>Recent transactions</h3>
                <p className="muted">Everything you receive or spend</p>
              </div>
              <button className="link-btn" onClick={() => setModal("transaction-expense")}>＋ add</button>
            </div>
            <div className="transactions">
              {transactions.slice(0, 8).map(t => (
                <div className="transaction" key={t.id}>
                  <div className={`transaction-icon ${t.type}`}>{t.type === "income" ? "↗" : "↘"}</div>
                  <div className="transaction-main">
                    <strong>{t.description || t.category}</strong>
                    <span>{t.category} · {ACCOUNT_LABELS[t.account]} · {t.transaction_date}</span>
                  </div>
                  <div className={t.type === "income" ? "amount income" : "amount expense"}>
                    {t.type === "income" ? "+" : "−"}{money(t.amount)}
                    <button className="delete" onClick={() => deleteTransaction(t.id)} title="Delete">×</button>
                  </div>
                </div>
              ))}
              {!transactions.length && <Empty text="No transactions yet. Add your first one above." />}
            </div>
          </section>
        </div>

        <section className="panel account-summary">
          <div>
            <p className="eyebrow">ACCOUNT BREAKDOWN</p>
            <h3>Your money is separated on purpose.</h3>
            <p className="muted">The app treats your allowance and savings as separate balances, so everyday spending doesn't accidentally look like savings spending.</p>
          </div>
          <div className="account-box">
            <span>Allowance</span><strong>{money(balances.allowance)}</strong>
          </div>
          <div className="account-box">
            <span>Savings</span><strong>{money(balances.savings)}</strong>
          </div>
        </section>
      </main>

      {modal === "transaction-income" && <TransactionModal type="income" onClose={() => setModal(null)} onSubmit={addTransaction} />}
      {modal === "transaction-expense" && <TransactionModal type="expense" onClose={() => setModal(null)} onSubmit={addTransaction} />}
      {modal === "budget" && <BudgetModal onClose={() => setModal(null)} onSubmit={saveBudget} month={month} />}
      {modal === "settings" && <SettingsModal settings={settings} onClose={() => setModal(null)} onSubmit={saveProfile} />}
    </div>
  );

  function shiftMonth(delta) {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
}

function StatCard({ title, value, sub }) {
  return <div className="stat-card"><span>{title}</span><strong>{value}</strong><small>{sub}</small></div>;
}

function Empty({ text }) { return <div className="empty">{text}</div>; }

function Modal({ title, children, onClose }) {
  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <div className="modal">
      <div className="modal-heading"><h3>{title}</h3><button onClick={onClose}>×</button></div>
      {children}
    </div>
  </div>;
}

function TransactionModal({ type, onClose, onSubmit }) {
  return <Modal title={type === "income" ? "Add money received" : "Add expense"} onClose={onClose}>
    <form onSubmit={onSubmit} className="form">
      <input type="hidden" name="type" value={type} />
      <label>Amount (₱)<input name="amount" type="number" min="0.01" step="0.01" placeholder="0.00" required autoFocus /></label>
      <label>Account
        <select name="account" defaultValue="allowance">
          <option value="allowance">Allowance</option>
          <option value="savings">Savings</option>
        </select>
      </label>
      {type === "expense" && <label>Category
        <select name="category" defaultValue="Food">{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>
      </label>}
      <label>Description / note<input name="description" placeholder={type === "income" ? "e.g. October allowance" : "e.g. lunch at school"} /></label>
      <label>Date<input name="transaction_date" type="date" defaultValue={new Date().toISOString().slice(0,10)} required /></label>
      <button className="primary wide">{type === "income" ? "Add money" : "Record expense"}</button>
    </form>
  </Modal>;
}

function BudgetModal({ onClose, onSubmit, month }) {
  return <Modal title={`Set budget · ${monthLabel(month)}`} onClose={onClose}>
    <form onSubmit={onSubmit} className="form">
      <label>Category<select name="category" defaultValue="Food">{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label>
      <label>Monthly budget (₱)<input name="amount" type="number" min="0" step="0.01" placeholder="4000" required autoFocus /></label>
      <button className="primary wide">Save budget</button>
    </form>
  </Modal>;
}

function SettingsModal({ settings, onClose, onSubmit }) {
  return <Modal title="Your starting numbers" onClose={onClose}>
    <p className="muted">These values are used as your baseline. Your monthly allowance is added to each month automatically.</p>
    <form onSubmit={onSubmit} className="form">
      <label>Name<input name="display_name" defaultValue={settings?.display_name || ""} /></label>
      <label>Monthly allowance (₱)<input name="monthly_allowance" type="number" min="0" step="0.01" defaultValue={settings?.monthly_allowance ?? 14000} required /></label>
      <label>Starting savings (₱)<input name="starting_savings" type="number" min="0" step="0.01" defaultValue={settings?.starting_savings ?? 25000} required /></label>
      <button className="primary wide">Save settings</button>
    </form>
  </Modal>;
}

createRoot(document.getElementById("root")).render(<App />);