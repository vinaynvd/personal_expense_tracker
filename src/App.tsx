import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  db,
  ensureDefaultAccounts,
  type AccountRecord,
  type TransactionRecord,
} from "./db";

import Transactions from "./pages/Transactions";
import Accounts from "./pages/Accounts";

type Page =
  | "home"
  | "transactions"
  | "accounts"
  | "monthly";

type ExpenseForm = {
  amount: string;
  category: string;
  description: string;
  account: string;
  date: string;
};

type IncomeForm = {
  amount: string;
  category: string;
  description: string;
  account: string;
  date: string;
};

type TransferForm = {
  amount: string;
  description: string;
  fromAccount: string;
  toAccount: string;
  date: string;
};

const expenseCategories = [
  "Food",
  "Travel",
  "Shopping",
  "Bills",
  "Rent",
  "EMI",
  "Health",
  "Entertainment",
  "Groceries",
  "Fuel",
  "Other",
];

const incomeCategories = [
  "Salary",
  "Business",
  "Freelance",
  "Interest",
  "Bonus",
  "Other",
];

function App() {
  const [page, setPage] =
    useState<Page>("home");

  const [transactions, setTransactions] =
    useState<TransactionRecord[]>([]);

  const [accounts, setAccounts] =
    useState<AccountRecord[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [showExpenseModal, setShowExpenseModal] =
    useState(false);

  const [showIncomeModal, setShowIncomeModal] =
    useState(false);

  const [showTransferModal, setShowTransferModal] =
    useState(false);

  const [editingTransaction, setEditingTransaction] =
    useState<TransactionRecord | null>(null);

  const [expenseForm, setExpenseForm] =
    useState<ExpenseForm>(() =>
      getDefaultExpenseForm()
    );

  const [incomeForm, setIncomeForm] =
    useState<IncomeForm>(() =>
      getDefaultIncomeForm()
    );

  const [transferForm, setTransferForm] =
    useState<TransferForm>(() =>
      getDefaultTransferForm()
    );

  // ======================================================
  // DATA
  // ======================================================

  async function loadData() {
    const [transactionRows, accountRows] =
      await Promise.all([
        db.transactions.toArray(),
        db.accounts.toArray(),
      ]);

    transactionRows.sort(
      (a, b) =>
        b.date.localeCompare(a.date)
    );

    setTransactions(transactionRows);
    setAccounts(accountRows);
  }

  useEffect(() => {
    async function initialize() {
      try {
        await ensureDefaultAccounts();
        await loadData();
      } finally {
        setLoading(false);
      }
    }

    initialize();
  }, []);

  // ======================================================
  // DEFAULT ACCOUNT HELPERS
  // ======================================================

  const bankAndCashAccounts =
    useMemo(
      () =>
        accounts.filter(
          (account) =>
            account.type === "bank" ||
            account.type === "cash"
        ),
      [accounts]
    );

  const expenseAccounts =
    useMemo(
      () =>
        accounts.filter(
          (account) =>
            account.type === "bank" ||
            account.type === "cash" ||
            account.type === "credit-card"
        ),
      [accounts]
    );

  // Transfer Money:
  // From = bank accounts and physical credit cards.
  // To = loans, chit funds and savings.
  const transferSourceAccounts =
    useMemo(
      () =>
        accounts.filter(
          (account) =>
            account.type === "bank" ||
            account.type === "credit-card"
        ),
      [accounts]
    );

  const transferDestinationAccounts =
    useMemo(
      () =>
        accounts.filter(
          (account) =>
            account.type === "loan" ||
            account.type === "chit" ||
            account.type === "savings"
        ),
      [accounts]
    );

  // ======================================================
  // DASHBOARD CALCULATIONS
  // ======================================================

  const currentMonth =
    new Date().toISOString().slice(0, 7);

  const monthlyTransactions =
    useMemo(
      () =>
        transactions.filter(
          (transaction) =>
            transaction.date.startsWith(
              currentMonth
            )
        ),
      [transactions, currentMonth]
    );

  const monthlyIncome =
    useMemo(
      () =>
        monthlyTransactions
          .filter(
            (transaction) =>
              transaction.type === "income"
          )
          .reduce(
            (total, transaction) =>
              total + transaction.amount,
            0
          ),
      [monthlyTransactions]
    );

  const monthlyExpenses =
    useMemo(
      () =>
        monthlyTransactions
          .filter(
            (transaction) =>
              transaction.type === "expense"
          )
          .reduce(
            (total, transaction) =>
              total + transaction.amount,
            0
          ),
      [monthlyTransactions]
    );

  const recentTransactions =
    transactions.slice(0, 5);

  // ======================================================
  // ACCOUNT BALANCES FOR HOME
  // ======================================================

  const accountBalances =
    useMemo(() => {
      return accounts.map((account) => {
        const related =
          transactions.filter(
            (transaction) =>
              transaction.account ===
                account.name ||
              transaction.toAccount ===
                account.name
          );

        let balance =
          account.openingBalance;

        for (const transaction of related) {
          if (
            transaction.type === "income" &&
            transaction.account ===
              account.name
          ) {
            balance += transaction.amount;
          }

          if (
            transaction.type === "expense" &&
            transaction.account ===
              account.name
          ) {
            balance -= transaction.amount;
          }

          if (
            transaction.type === "transfer"
          ) {
            if (
              transaction.account ===
              account.name
            ) {
              balance -= transaction.amount;
            }

            if (
              transaction.toAccount ===
              account.name
            ) {
              balance += transaction.amount;
            }
          }
        }

        if (
          account.type === "loan"
        ) {
          balance = Math.max(0, balance);
        }

        return {
          account,
          balance,
        };
      });
    }, [accounts, transactions]);

  const totalLiquidAssets =
    accountBalances
      .filter(
        ({ account }) =>
          account.type === "bank" ||
          account.type === "cash"
      )
      .reduce(
        (total, item) =>
          total + item.balance,
        0
      );

  const totalSavings =
    accountBalances
      .filter(
        ({ account }) =>
          account.type === "savings"
      )
      .reduce(
        (total, item) =>
          total + Math.max(item.balance, 0),
        0
      );

  // Chit contributions are treated as part of the
  // "Savings Journey", but NOT as liquid/available assets.
  const totalChitContributions =
    useMemo(
      () =>
        transactions
          .filter(
            (transaction) =>
              transaction.type === "transfer" &&
              transaction.toAccount &&
              accounts.some(
                (account) =>
                  account.type === "chit" &&
                  account.name ===
                    transaction.toAccount
              )
          )
          .reduce(
            (total, transaction) =>
              total + transaction.amount,
            0
          ),
      [transactions, accounts]
    );

  // ======================================================
  // EXPENSE
  // ======================================================

  function openExpenseModal() {
    setEditingTransaction(null);

    setExpenseForm(
      getDefaultExpenseForm(
        expenseAccounts[0]?.name
      )
    );

    setShowExpenseModal(true);
  }

  function closeExpenseModal() {
    setShowExpenseModal(false);
    setEditingTransaction(null);
  }

  async function handleSaveExpense() {
    const amount =
      Number(expenseForm.amount);

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      alert("Please enter a valid amount.");
      return;
    }

    if (!expenseForm.account) {
      alert("Please select an account.");
      return;
    }

    if (
      editingTransaction &&
      editingTransaction.type === "expense"
    ) {
      await db.transactions.update(
        editingTransaction.id,
        {
          amount,
          category:
            expenseForm.category,
          description:
            expenseForm.description.trim(),
          account:
            expenseForm.account,
          date: expenseForm.date,
          type: "expense",
        }
      );
    } else {
      await db.transactions.add({
        id: crypto.randomUUID(),
        amount,
        category:
          expenseForm.category,
        description:
          expenseForm.description.trim(),
        account:
          expenseForm.account,
        date: expenseForm.date,
        type: "expense",
      });
    }

    await loadData();
    closeExpenseModal();
  }

  // ======================================================
  // INCOME
  // ======================================================

  function openIncomeModal() {
    setEditingTransaction(null);

    setIncomeForm(
      getDefaultIncomeForm(
        bankAndCashAccounts[0]?.name
      )
    );

    setShowIncomeModal(true);
  }

  function closeIncomeModal() {
    setShowIncomeModal(false);
    setEditingTransaction(null);
  }

  async function handleSaveIncome() {
    const amount =
      Number(incomeForm.amount);

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      alert("Please enter a valid amount.");
      return;
    }

    if (!incomeForm.account) {
      alert("Please select an account.");
      return;
    }

    if (
      editingTransaction &&
      editingTransaction.type === "income"
    ) {
      await db.transactions.update(
        editingTransaction.id,
        {
          amount,
          category:
            incomeForm.category,
          description:
            incomeForm.description.trim(),
          account:
            incomeForm.account,
          date: incomeForm.date,
          type: "income",
        }
      );
    } else {
      await db.transactions.add({
        id: crypto.randomUUID(),
        amount,
        category:
          incomeForm.category,
        description:
          incomeForm.description.trim(),
        account:
          incomeForm.account,
        date: incomeForm.date,
        type: "income",
      });
    }

    await loadData();
    closeIncomeModal();
  }

  // ======================================================
  // TRANSFER
  // ======================================================

  function openTransferModal() {
    setTransferForm(
      getDefaultTransferForm(
        transferSourceAccounts[0]?.name,
        transferDestinationAccounts[0]?.name
      )
    );

    setShowTransferModal(true);
  }

  function closeTransferModal() {
    setShowTransferModal(false);
  }

  async function handleSaveTransfer() {
    const amount =
      Number(transferForm.amount);

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      alert("Please enter a valid amount.");
      return;
    }

    if (!transferForm.fromAccount) {
      alert("Please select the source account.");
      return;
    }

    if (!transferForm.toAccount) {
      alert("Please select the destination account.");
      return;
    }

    if (
      transferForm.fromAccount ===
      transferForm.toAccount
    ) {
      alert(
        "Source and destination accounts must be different."
      );
      return;
    }

    await db.transactions.add({
      id: crypto.randomUUID(),
      amount,
      category: "Transfer",
      description:
        transferForm.description.trim() ||
        "Transfer",
      account:
        transferForm.fromAccount,
      toAccount:
        transferForm.toAccount,
      date: transferForm.date,
      type: "transfer",
    });

    await loadData();
    closeTransferModal();
  }

  // ======================================================
  // EDIT TRANSACTION
  // ======================================================

  function handleEditTransaction(
    transaction: TransactionRecord
  ) {
    if (
      transaction.type === "expense"
    ) {
      setEditingTransaction(transaction);

      setExpenseForm({
        amount:
          String(transaction.amount),
        category:
          transaction.category,
        description:
          transaction.description,
        account:
          transaction.account,
        date:
          transaction.date,
      });

      setShowExpenseModal(true);
      return;
    }

    if (
      transaction.type === "income"
    ) {
      setEditingTransaction(transaction);

      setIncomeForm({
        amount:
          String(transaction.amount),
        category:
          transaction.category,
        description:
          transaction.description,
        account:
          transaction.account,
        date:
          transaction.date,
      });

      setShowIncomeModal(true);
    }
  }

  // ======================================================
  // DELETE TRANSACTION
  // ======================================================

  async function handleDeleteTransaction(
    transaction: TransactionRecord
  ) {
    const confirmed =
      window.confirm(
        "Delete this transaction?"
      );

    if (!confirmed) {
      return;
    }

    await db.transactions.delete(
      transaction.id
    );

    await loadData();
  }

  // ======================================================
  // NAVIGATION
  // ======================================================

  function navigate(nextPage: Page) {
    setPage(nextPage);
  }

  if (loading) {
    return (
      <div className="app-loading">
        <div className="loading-card">
          <div className="loading-icon">
            ₹
          </div>
          <strong>
            Loading My Money...
          </strong>
          <span>
            Preparing your local data
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {page === "home" && (
        <HomePage
          monthlyIncome={
            monthlyIncome
          }
          monthlyExpenses={
            monthlyExpenses
          }
          totalLiquidAssets={
            totalLiquidAssets
          }
          totalSavings={
            totalSavings
          }
          totalChitContributions={
            totalChitContributions
          }
          recentTransactions={
            recentTransactions
          }
          onAddExpense={
            openExpenseModal
          }
          onAddIncome={
            openIncomeModal
          }
          onTransfer={
            openTransferModal
          }
          onNavigate={navigate}
        />
      )}

      {page === "transactions" && (
        <Transactions
          transactions={transactions}
          onEdit={
            handleEditTransaction
          }
          onDelete={
            handleDeleteTransaction
          }
        />
      )}

      {page === "accounts" && (
        <Accounts
          accounts={accounts}
          transactions={transactions}
          onAccountsChanged={
            loadData
          }
        />
      )}

      {page === "monthly" && (
        <MonthlyPage
          transactions={transactions}
          accounts={accounts}
        />
      )}

      <BottomNav
        page={page}
        onNavigate={navigate}
      />

      {showExpenseModal && (
        <ExpenseModal
          form={expenseForm}
          accounts={expenseAccounts}
          editing={
            editingTransaction !== null
          }
          onChange={setExpenseForm}
          onClose={
            closeExpenseModal
          }
          onSave={
            handleSaveExpense
          }
        />
      )}

      {showIncomeModal && (
        <IncomeModal
          form={incomeForm}
          accounts={bankAndCashAccounts}
          editing={
            editingTransaction !== null
          }
          onChange={setIncomeForm}
          onClose={
            closeIncomeModal
          }
          onSave={
            handleSaveIncome
          }
        />
      )}

      {showTransferModal && (
        <TransferModal
          form={transferForm}
          sourceAccounts={transferSourceAccounts}
          destinationAccounts={transferDestinationAccounts}
          onChange={setTransferForm}
          onClose={
            closeTransferModal
          }
          onSave={
            handleSaveTransfer
          }
        />
      )}
    </div>
  );
}

// ========================================================
// HOME PAGE
// ========================================================

function HomePage({
  monthlyIncome,
  monthlyExpenses,
  totalLiquidAssets,
  totalSavings,
  totalChitContributions,
  recentTransactions,
  onAddExpense,
  onAddIncome,
  onTransfer,
  onNavigate,
}: {
  monthlyIncome: number;
  monthlyExpenses: number;
  totalLiquidAssets: number;
  totalSavings: number;
  totalChitContributions: number;
  recentTransactions: TransactionRecord[];
  onAddExpense: () => void;
  onAddIncome: () => void;
  onTransfer: () => void;
  onNavigate: (page: Page) => void;
}) {
  const totalSavingsJourney =
    totalSavings +
    totalChitContributions;

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <div>
          <span className="eyebrow">
            PERSONAL FINANCE
          </span>

          <h1>My Money</h1>

          <p>
            Your money, accounts and
            transactions in one place.
          </p>
        </div>

        <div className="header-badge">
          Local
        </div>
      </header>

      <section className="money-hero">
        <div>
          <span>
            Available assets
          </span>

          <strong>
            ₹
            {formatCurrency(
              totalLiquidAssets
            )}
          </strong>

          <small>
            Based on your account
            transactions
          </small>
        </div>
      </section>

      <section
        className="savings-motivation-card"
        style={{
          marginTop: "18px",
          padding: "22px 24px",
          borderRadius: "22px",
          background:
            "linear-gradient(135deg, #fff8e7 0%, #fffdf7 55%, #f3f8ff 100%)",
          border: "1px solid rgba(184, 134, 11, 0.18)",
          boxShadow:
            "0 10px 30px rgba(40, 30, 10, 0.07)",
          display: "flex",
          alignItems: "center",
          gap: "18px",
        }}
      >
        <div
          style={{
            width: "58px",
            height: "58px",
            minWidth: "58px",
            borderRadius: "18px",
            display: "grid",
            placeItems: "center",
            fontSize: "30px",
            background:
              "rgba(255, 193, 7, 0.16)",
          }}
          aria-hidden="true"
        >
          🏆
        </div>

        <div style={{ flex: 1 }}>
          <span
            style={{
              display: "block",
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              opacity: 0.62,
              marginBottom: "5px",
            }}
          >
            Your savings journey
          </span>

          <strong
            style={{
              display: "block",
              fontSize: "28px",
              lineHeight: 1.15,
              marginBottom: "6px",
            }}
          >
            ₹
            {formatCurrency(
              totalSavingsJourney
            )}
          </strong>

          <div
            style={{
              display: "grid",
              gap: "3px",
              marginBottom: "8px",
              fontSize: "13px",
              lineHeight: 1.35,
              opacity: 0.68,
            }}
          >
            <span>
              Savings accounts: ₹
              {formatCurrency(
                totalSavings
              )}
            </span>

            <span>
              Chit contributions: ₹
              {formatCurrency(
                totalChitContributions
              )}
            </span>
          </div>

          <p
            style={{
              margin: 0,
              fontSize: "14px",
              lineHeight: 1.5,
              opacity: 0.72,
            }}
          >
            Every rupee you deliberately set
            aside is a little more freedom for
            your future self.
          </p>
        </div>

        <div
          style={{
            alignSelf: "stretch",
            minWidth: "120px",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "flex-end",
            textAlign: "right",
            fontSize: "13px",
            fontWeight: 700,
            opacity: 0.62,
          }}
        >
          Keep going. 🚀
        </div>
      </section>

      <section className="quick-actions">
        <button
          className="quick-action expense-action"
          onClick={onAddExpense}
        >
          <span className="quick-action-icon">
            −
          </span>

          <span>
            <strong>
              Add Expense
            </strong>

            <small>
              Record spending
            </small>
          </span>
        </button>

        <button
          className="quick-action income-action"
          onClick={onAddIncome}
        >
          <span className="quick-action-icon">
            +
          </span>

          <span>
            <strong>
              Add Income
            </strong>

            <small>
              Record money in
            </small>
          </span>
        </button>

        <button
          className="quick-action transfer-action"
          onClick={onTransfer}
        >
          <span className="quick-action-icon">
            ↔
          </span>

          <span>
            <strong>
              Transfer
            </strong>

            <small>
              Move between accounts
            </small>
          </span>
        </button>
      </section>

      <section className="dashboard-section">
        <div className="section-heading">
          <div>
            <h2>
              This Month
            </h2>

            <p>
              Income and spending
            </p>
          </div>
        </div>

        <div className="monthly-summary">
          <div className="summary-card">
            <span>
              Income
            </span>

            <strong className="income">
              +₹
              {formatCurrency(
                monthlyIncome
              )}
            </strong>
          </div>

          <div className="summary-card">
            <span>
              Expenses
            </span>

            <strong className="expense">
              −₹
              {formatCurrency(
                monthlyExpenses
              )}
            </strong>
          </div>

          <div className="summary-card">
            <span>
              Savings
            </span>

            <strong
              className={
                monthlyIncome -
                  monthlyExpenses <
                0
                  ? "expense"
                  : "income"
              }
            >
              {monthlyIncome -
                monthlyExpenses <
              0
                ? "−"
                : "+"}
              ₹
              {formatCurrency(
                Math.abs(
                  monthlyIncome -
                    monthlyExpenses
                )
              )}
            </strong>
          </div>
        </div>
      </section>

      <section className="dashboard-section">
        <div className="section-heading">
          <div>
            <h2>
              Recent Transactions
            </h2>

            <p>
              Your latest money activity
            </p>
          </div>

          <button
            className="text-button"
            onClick={() =>
              onNavigate(
                "transactions"
              )
            }
          >
            View all
          </button>
        </div>

        {recentTransactions.length ===
        0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              ₹
            </div>

            <strong>
              No transactions yet
            </strong>

            <span>
              Add your first expense or
              income.
            </span>
          </div>
        ) : (
          <div className="transaction-list dashboard-transactions">
            {recentTransactions.map(
              (transaction) => (
                <TransactionPreview
                  key={transaction.id}
                  transaction={
                    transaction
                  }
                />
              )
            )}
          </div>
        )}
      </section>

      <section className="dashboard-section">
        <div className="section-heading">
          <div>
            <h2>
              House Fund
            </h2>

            <p>
              Keep your financial goals
              visible.
            </p>
          </div>
        </div>

        <div className="goal-card">
          <div className="goal-card-top">
            <div>
              <span>
                Current goal
              </span>

              <strong>
                Build your corpus
              </strong>
            </div>

            <span className="goal-icon">
              🏠
            </span>
          </div>

          <div className="goal-placeholder">
            Goals and progress tracking
            will live here.
          </div>
        </div>
      </section>
    </main>
  );
}

// ========================================================
// TRANSACTION PREVIEW
// ========================================================

function TransactionPreview({
  transaction,
}: {
  transaction: TransactionRecord;
}) {
  const isIncome =
    transaction.type === "income";

  const isTransfer =
    transaction.type === "transfer";

  const icon = isIncome
    ? "💰"
    : isTransfer
      ? "↔"
      : "💸";

  const title =
    isTransfer
      ? transaction.description ||
        "Transfer"
      : transaction.description ||
        transaction.category;

  const subtitle =
    isTransfer
      ? `${transaction.account} → ${
          transaction.toAccount ||
          "Unknown"
        }`
      : transaction.category;

  return (
    <div className="transaction">
      <div className="transaction-icon">
        {icon}
      </div>

      <div className="transaction-details">
        <strong>
          {title}
        </strong>

        <span>
          {subtitle}
        </span>

        <div className="transaction-date">
          {formatDate(
            transaction.date
          )}
        </div>
      </div>

      <strong
        className={`transaction-amount ${
          isIncome
            ? "income"
            : isTransfer
              ? "transfer-amount"
              : "expense"
        }`}
      >
        {isTransfer
          ? "↔ "
          : isIncome
            ? "+₹"
            : "−₹"}

        {formatCurrency(
          transaction.amount
        )}
      </strong>
    </div>
  );
}

// ========================================================
// EXPENSE MODAL
// ========================================================

function ExpenseModal({
  form,
  accounts,
  editing,
  onChange,
  onClose,
  onSave,
}: {
  form: ExpenseForm;
  accounts: AccountRecord[];
  editing: boolean;
  onChange: (
    form: ExpenseForm
  ) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <ModalShell
      title={
        editing
          ? "Edit Expense"
          : "Add Expense"
      }
      description="Record money spent from an account."
      onClose={onClose}
    >
      <div className="form-group">
        <label>
          Amount
        </label>

        <input
          autoFocus
          type="number"
          min="0"
          placeholder="1000"
          value={form.amount}
          onChange={(event) =>
            onChange({
              ...form,
              amount:
                event.target.value,
            })
          }
        />
      </div>

      <div className="form-group">
        <label>
          Category
        </label>

        <select
          value={form.category}
          onChange={(event) =>
            onChange({
              ...form,
              category:
                event.target.value,
            })
          }
        >
          {expenseCategories.map(
            (category) => (
              <option
                key={category}
                value={category}
              >
                {category}
              </option>
            )
          )}
        </select>
      </div>

      <div className="form-group">
        <label>
          Account
        </label>

        <select
          value={form.account}
          onChange={(event) =>
            onChange({
              ...form,
              account:
                event.target.value,
            })
          }
        >
          <option value="">
            Select account
          </option>

          {accounts.map(
            (account) => (
              <option
                key={account.id}
                value={account.name}
              >
                {account.name}
              </option>
            )
          )}
        </select>
      </div>

      <div className="form-group">
        <label>
          Description
        </label>

        <input
          type="text"
          placeholder="Lunch, groceries, fuel..."
          value={form.description}
          onChange={(event) =>
            onChange({
              ...form,
              description:
                event.target.value,
            })
          }
        />
      </div>

      <div className="form-group">
        <label>
          Date
        </label>

        <input
          type="date"
          value={form.date}
          onChange={(event) =>
            onChange({
              ...form,
              date:
                event.target.value,
            })
          }
        />
      </div>

      <button
        className="primary-button modal-submit"
        onClick={onSave}
      >
        {editing
          ? "Save Changes"
          : "Add Expense"}
      </button>
    </ModalShell>
  );
}

// ========================================================
// INCOME MODAL
// ========================================================

function IncomeModal({
  form,
  accounts,
  editing,
  onChange,
  onClose,
  onSave,
}: {
  form: IncomeForm;
  accounts: AccountRecord[];
  editing: boolean;
  onChange: (
    form: IncomeForm
  ) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <ModalShell
      title={
        editing
          ? "Edit Income"
          : "Add Income"
      }
      description="Record money entering an account."
      onClose={onClose}
    >
      <div className="form-group">
        <label>
          Amount
        </label>

        <input
          autoFocus
          type="number"
          min="0"
          placeholder="200000"
          value={form.amount}
          onChange={(event) =>
            onChange({
              ...form,
              amount:
                event.target.value,
            })
          }
        />
      </div>

      <div className="form-group">
        <label>
          Category
        </label>

        <select
          value={form.category}
          onChange={(event) =>
            onChange({
              ...form,
              category:
                event.target.value,
            })
          }
        >
          {incomeCategories.map(
            (category) => (
              <option
                key={category}
                value={category}
              >
                {category}
              </option>
            )
          )}
        </select>
      </div>

      <div className="form-group">
        <label>
          Account
        </label>

        <select
          value={form.account}
          onChange={(event) =>
            onChange({
              ...form,
              account:
                event.target.value,
            })
          }
        >
          <option value="">
            Select account
          </option>

          {accounts.map(
            (account) => (
              <option
                key={account.id}
                value={account.name}
              >
                {account.name}
              </option>
            )
          )}
        </select>
      </div>

      <div className="form-group">
        <label>
          Description
        </label>

        <input
          type="text"
          placeholder="Salary, bonus, freelance..."
          value={form.description}
          onChange={(event) =>
            onChange({
              ...form,
              description:
                event.target.value,
            })
          }
        />
      </div>

      <div className="form-group">
        <label>
          Date
        </label>

        <input
          type="date"
          value={form.date}
          onChange={(event) =>
            onChange({
              ...form,
              date:
                event.target.value,
            })
          }
        />
      </div>

      <button
        className="primary-button modal-submit"
        onClick={onSave}
      >
        {editing
          ? "Save Changes"
          : "Add Income"}
      </button>
    </ModalShell>
  );
}

// ========================================================
// TRANSFER MODAL
// ========================================================

function TransferModal({
  form,
  sourceAccounts,
  destinationAccounts,
  onChange,
  onClose,
  onSave,
}: {
  form: TransferForm;
  sourceAccounts: AccountRecord[];
  destinationAccounts: AccountRecord[];
  onChange: (
    form: TransferForm
  ) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <ModalShell
      title="Transfer Money"
      description="Move money between accounts."
      onClose={onClose}
    >
      <div className="form-group">
        <label>
          Amount
        </label>

        <input
          autoFocus
          type="number"
          min="0"
          placeholder="25000"
          value={form.amount}
          onChange={(event) =>
            onChange({
              ...form,
              amount:
                event.target.value,
            })
          }
        />
      </div>

      <div className="form-group">
        <label>
          From
        </label>

        <select
          value={form.fromAccount}
          onChange={(event) =>
            onChange({
              ...form,
              fromAccount:
                event.target.value,
            })
          }
        >
          <option value="">
            Select source
          </option>

          {sourceAccounts.map(
            (account) => (
              <option
                key={account.id}
                value={account.name}
              >
                {account.name}
              </option>
            )
          )}
        </select>
      </div>

      <div className="transfer-arrow">
        ↓
      </div>

      <div className="form-group">
        <label>
          To
        </label>

        <select
          value={form.toAccount}
          onChange={(event) =>
            onChange({
              ...form,
              toAccount:
                event.target.value,
            })
          }
        >
          <option value="">
            Select destination
          </option>

          {destinationAccounts.map(
            (account) => (
              <option
                key={account.id}
                value={account.name}
              >
                {account.name}
              </option>
            )
          )}
        </select>
      </div>

      <div className="form-group">
        <label>
          Description
        </label>

        <input
          type="text"
          placeholder="Credit card payment, savings, chit..."
          value={form.description}
          onChange={(event) =>
            onChange({
              ...form,
              description:
                event.target.value,
            })
          }
        />
      </div>

      <div className="form-group">
        <label>
          Date
        </label>

        <input
          type="date"
          value={form.date}
          onChange={(event) =>
            onChange({
              ...form,
              date:
                event.target.value,
            })
          }
        />
      </div>

      <button
        className="primary-button modal-submit"
        onClick={onSave}
      >
        Transfer Money
      </button>
    </ModalShell>
  );
}

// ========================================================
// MODAL SHELL
// ========================================================

function ModalShell({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="modal-overlay"
      onMouseDown={onClose}
    >
      <div
        className="modal"
        onMouseDown={(event) =>
          event.stopPropagation()
        }
      >
        <div className="modal-header">
          <div>
            <h2>
              {title}
            </h2>

            <p>
              {description}
            </p>
          </div>

          <button
            className="modal-close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

// ========================================================
// MONTHLY VIEW
// ========================================================

function MonthlyPage({
  transactions,
  accounts,
}: {
  transactions: TransactionRecord[];
  accounts: AccountRecord[];
}) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] =
    useState(currentMonth);

  const monthRows = useMemo(() => {
    const result: Array<{
      key: string;
      label: string;
      obligations: number;
      savings: number;
    }> = [];

    const cursor =
      new Date(`${selectedMonth}-01T12:00:00`);

    cursor.setMonth(
      cursor.getMonth() - 5
    );

    const loanNames = new Set(
      accounts
        .filter(
          (account) =>
            account.type === "loan"
        )
        .map(
          (account) =>
            account.name
        )
    );

    const savingsNames = new Set(
      accounts
        .filter(
          (account) =>
            account.type === "savings"
        )
        .map(
          (account) =>
            account.name
        )
    );

    for (let i = 0; i < 6; i += 1) {
      const year =
        cursor.getFullYear();

      const month =
        String(
          cursor.getMonth() + 1
        ).padStart(2, "0");

      const key =
        `${year}-${month}`;

      const monthTransactions =
        transactions.filter(
          (transaction) =>
            transaction.type ===
              "transfer" &&
            transaction.date.startsWith(
              key
            )
        );

      const obligations =
        monthTransactions
          .filter(
            (transaction) =>
              loanNames.has(
                transaction.toAccount ||
                  ""
              )
          )
          .reduce(
            (total, transaction) =>
              total +
              transaction.amount,
            0
          );

      const savings =
        monthTransactions
          .filter(
            (transaction) =>
              savingsNames.has(
                transaction.toAccount ||
                  ""
              )
          )
          .reduce(
            (total, transaction) =>
              total +
              transaction.amount,
            0
          );

      result.push({
        key,
        label:
          cursor.toLocaleDateString(
            "en-IN",
            {
              month: "short",
            }
          ),
        obligations,
        savings,
      });

      cursor.setMonth(
        cursor.getMonth() + 1
      );
    }

    return result;
  }, [
    accounts,
    selectedMonth,
    transactions,
  ]);

  const selected =
    monthRows.find(
      (row) =>
        row.key === selectedMonth
    ) ||
    monthRows[
      monthRows.length - 1
    ];

  const selectedDate =
    new Date(
      `${selectedMonth}-01T12:00:00`
    );

  const monthLabel =
    selectedDate.toLocaleDateString(
      "en-IN",
      {
        month: "long",
        year: "numeric",
      }
    );

  function changeMonth(
    offset: number
  ) {
    const date =
      new Date(
        `${selectedMonth}-01T12:00:00`
      );

    date.setMonth(
      date.getMonth() + offset
    );

    setSelectedMonth(
      `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, "0")}`
    );
  }

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <div>
          <span className="eyebrow">
            FINANCIAL PROGRESS
          </span>

          <h1>
            Monthly View
          </h1>

          <p>
            See where your money went —
            and what you built.
          </p>
        </div>

        <div className="header-badge">
          Overview
        </div>
      </header>

      <section
        style={{
          marginBottom: "20px",
          padding: "18px 18px 12px",
          borderRadius: "22px",
          background:
            "var(--card, #ffffff)",
          border:
            "1px solid rgba(0,0,0,0.07)",
          boxShadow:
            "0 10px 28px rgba(0,0,0,0.05)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent:
              "space-between",
            gap: "12px",
            marginBottom: "8px",
          }}
        >
          <div>
            <span
              style={{
                display: "block",
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing:
                  "0.08em",
                textTransform:
                  "uppercase",
                opacity: 0.55,
              }}
            >
              6-month progress
            </span>

            <strong
              style={{
                fontSize: "18px",
              }}
            >
              Savings vs obligations
            </strong>
          </div>

          <div
            style={{
              display: "flex",
              gap: "6px",
            }}
          >
            <button
              type="button"
              className="text-button"
              onClick={() =>
                changeMonth(-1)
              }
              aria-label="Previous month"
            >
              ←
            </button>

            <button
              type="button"
              className="text-button"
              onClick={() =>
                changeMonth(1)
              }
              aria-label="Next month"
            >
              →
            </button>
          </div>
        </div>

        <MonthlyLineChart
          rows={monthRows}
        />
      </section>

      <section
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent:
            "space-between",
          gap: "12px",
          marginBottom: "14px",
        }}
      >
        <div>
          <span className="eyebrow">
            SELECTED MONTH
          </span>

          <h2
            style={{
              margin: "4px 0 0",
            }}
          >
            {monthLabel}
          </h2>
        </div>

        {selectedMonth !==
          currentMonth && (
          <button
            className="text-button"
            type="button"
            onClick={() =>
              setSelectedMonth(
                currentMonth
              )
            }
          >
            This month
          </button>
        )}
      </section>

      <section className="monthly-summary">
        <div className="summary-card">
          <span>
            Total obligations
          </span>

          <strong className="expense">
            ₹
            {formatCurrency(
              selected?.obligations ||
                0
            )}
          </strong>

          <small>
            <b>
              Loan payments made
            </b>
          </small>
        </div>

        <div className="summary-card">
          <span>
            Total savings
          </span>

          <strong className="income">
            ₹
            {formatCurrency(
              selected?.savings ||
                0
            )}
          </strong>

          <small>
            <b>
              Moved into savings
            </b>
          </small>
        </div>
      </section>

      <section
        className="savings-motivation-card"
        style={{
          marginTop: "18px",
          padding: "20px 22px",
          borderRadius: "22px",
          background:
            "linear-gradient(135deg, #fff8e7 0%, #fffdf7 55%, #f3f8ff 100%)",
          border:
            "1px solid rgba(184, 134, 11, 0.18)",
          boxShadow:
            "0 10px 30px rgba(40, 30, 10, 0.06)",
          display: "flex",
          alignItems: "center",
          gap: "15px",
        }}
      >
        <div
          style={{
            width: "50px",
            height: "50px",
            minWidth: "50px",
            borderRadius: "16px",
            display: "grid",
            placeItems: "center",
            fontSize: "26px",
            background:
              "rgba(255, 193, 7, 0.16)",
          }}
        >
          🌱
        </div>

        <div>
          <strong
            style={{
              display: "block",
              marginBottom: "4px",
            }}
          >
            Small steps. Bigger future.
          </strong>

          <span
            style={{
              fontSize: "14px",
              opacity: 0.7,
            }}
          >
            You saved ₹
            {formatCurrency(
              selected?.savings ||
                0
            )}{" "}
            in {monthLabel}.
            Keep building. 🚀
          </span>
        </div>
      </section>
    </main>
  );
}

function MonthlyLineChart({
  rows,
}: {
  rows: Array<{
    key: string;
    label: string;
    obligations: number;
    savings: number;
  }>;
}) {
  const width = 720;
  const height = 250;
  const left = 48;
  const right = 20;
  const top = 18;
  const bottom = 42;

  const chartWidth =
    width - left - right;

  const chartHeight =
    height - top - bottom;

  const maxValue =
    Math.max(
      1,
      ...rows.flatMap(
        (row) => [
          row.obligations,
          row.savings,
        ]
      )
    );

  const pointsFor = (
    key:
      | "obligations"
      | "savings"
  ) =>
    rows
      .map(
        (
          row,
          index
        ) => {
          const x =
            left +
            (rows.length === 1
              ? chartWidth / 2
              : (index /
                  (rows.length - 1)) *
                chartWidth);

          const y =
            top +
            chartHeight -
            (row[key] /
              maxValue) *
              chartHeight;

          return `${x},${y}`;
        }
      )
      .join(" ");

  return (
    <div
      style={{
        width: "100%",
        overflowX: "auto",
      }}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{
          width: "100%",
          minWidth: "520px",
          height: "250px",
          display: "block",
        }}
        role="img"
        aria-label="Monthly savings and obligations line graph"
      >
        {[0, 0.5, 1].map(
          (fraction) => {
            const y =
              top +
              chartHeight -
              fraction *
                chartHeight;

            return (
              <line
                key={fraction}
                x1={left}
                x2={
                  width - right
                }
                y1={y}
                y2={y}
                stroke="currentColor"
                strokeOpacity="0.08"
              />
            );
          }
        )}

        <polyline
          points={pointsFor(
            "obligations"
          )}
          fill="none"
          stroke="#e76f51"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <polyline
          points={pointsFor(
            "savings"
          )}
          fill="none"
          stroke="#2a9d8f"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {rows.map(
          (
            row,
            index
          ) => {
            const x =
              left +
              (rows.length ===
              1
                ? chartWidth / 2
                : (index /
                    (rows.length -
                      1)) *
                  chartWidth);

            const obligationY =
              top +
              chartHeight -
              (row.obligations /
                maxValue) *
                chartHeight;

            const savingsY =
              top +
              chartHeight -
              (row.savings /
                maxValue) *
                chartHeight;

            return (
              <g
                key={row.key}
              >
                <circle
                  cx={x}
                  cy={
                    obligationY
                  }
                  r="5"
                  fill="#e76f51"
                />

                <circle
                  cx={x}
                  cy={
                    savingsY
                  }
                  r="5"
                  fill="#2a9d8f"
                />

                <text
                  x={x}
                  y={
                    height - 16
                  }
                  textAnchor="middle"
                  fontSize="12"
                  fill="currentColor"
                  opacity="0.6"
                >
                  {row.label}
                </text>
              </g>
            );
          }
        )}

        <text
          x="8"
          y={top + 5}
          fontSize="11"
          fill="currentColor"
          opacity="0.45"
        >
          ₹
          {formatCompactCurrency(
            maxValue
          )}
        </text>

        <text
          x="8"
          y={
            top +
            chartHeight +
            4
          }
          fontSize="11"
          fill="currentColor"
          opacity="0.45"
        >
          ₹0
        </text>
      </svg>

      <div
        style={{
          display: "flex",
          justifyContent:
            "center",
          gap: "20px",
          fontSize: "12px",
          fontWeight: 600,
          opacity: 0.65,
          marginTop: "-4px",
        }}
      >
        <span>
          🔴 Obligations
        </span>

        <span>
          🟢 Savings
        </span>
      </div>
    </div>
  );
}

// ========================================================
// BOTTOM NAV
// ========================================================

function BottomNav({
  page,
  onNavigate,
}: {
  page: Page;
  onNavigate: (
    page: Page
  ) => void;
}) {
  return (
    <nav className="bottom-nav">
      <button
        className={
          page === "home"
            ? "active"
            : ""
        }
        onClick={() =>
          onNavigate("home")
        }
      >
        <span className="nav-icon">
          <HomeIcon />
        </span>

        <span>
          Home
        </span>
      </button>

      <button
        className={
          page ===
          "transactions"
            ? "active"
            : ""
        }
        onClick={() =>
          onNavigate(
            "transactions"
          )
        }
      >
        <span className="nav-icon">
          <TransactionIcon />
        </span>

        <span>
          Transactions
        </span>
      </button>

      <button
        className={
          page === "accounts"
            ? "active"
            : ""
        }
        onClick={() =>
          onNavigate(
            "accounts"
          )
        }
      >
        <span className="nav-icon">
          <WalletIcon />
        </span>

        <span>
          Accounts
        </span>
      </button>

      <button
        className={
          page === "monthly"
            ? "active"
            : ""
        }
        onClick={() =>
          onNavigate(
            "monthly"
          )
        }
      >
        <span className="nav-icon">
          <CalendarIcon />
        </span>

        <span>
          Monthly
        </span>
      </button>
    </nav>
  );
}

// ========================================================
// ICONS
// ========================================================

function HomeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v10h14V10" />
      <path d="M9 20v-6h6v6" />
    </svg>
  );
}

function TransactionIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M6 3v18" />
      <path d="M6 7h10a3 3 0 0 0 0-6H9" />
      <path d="M18 21V3" />
      <path d="M18 17H8a3 3 0 0 0 0 6h7" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M4 6h16v14H4z" />
      <path d="M4 6V4h13" />
      <path d="M16 13h4" />
      <circle
        cx="16"
        cy="13"
        r="0.8"
        fill="currentColor"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect
        x="3"
        y="4"
        width="18"
        height="17"
        rx="2"
      />

      <line
        x1="16"
        y1="2.5"
        x2="16"
        y2="6"
      />

      <line
        x1="8"
        y1="2.5"
        x2="8"
        y2="6"
      />

      <line
        x1="3"
        y1="9"
        x2="21"
        y2="9"
      />

      <path d="M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01" />
    </svg>
  );
}

// ========================================================
// FORM DEFAULTS
// ========================================================

function getToday() {
  return new Date()
    .toISOString()
    .slice(0, 10);
}

function getDefaultExpenseForm(
  account = ""
): ExpenseForm {
  return {
    amount: "",
    category: "Other",
    description: "",
    account,
    date: getToday(),
  };
}

function getDefaultIncomeForm(
  account = ""
): IncomeForm {
  return {
    amount: "",
    category: "Salary",
    description: "",
    account,
    date: getToday(),
  };
}

function getDefaultTransferForm(
  fromAccount = "",
  toAccount = ""
): TransferForm {
  return {
    amount: "",
    description: "",
    fromAccount,
    toAccount,
    date: getToday(),
  };
}

// ========================================================
// HELPERS
// ========================================================

function formatCompactCurrency(
  amount: number
) {
  const absolute =
    Math.abs(amount);

  if (
    absolute >=
    10000000
  ) {
    return `${(
      amount / 10000000
    ).toFixed(1)}Cr`;
  }

  if (
    absolute >=
    100000
  ) {
    return `${(
      amount / 100000
    ).toFixed(1)}L`;
  }

  if (
    absolute >=
    1000
  ) {
    return `${(
      amount / 1000
    ).toFixed(1)}K`;
  }

  return formatCurrency(
    amount
  );
}

function formatCurrency(
  amount: number
) {
  return new Intl.NumberFormat(
    "en-IN",
    {
      maximumFractionDigits: 0,
    }
  ).format(
    Math.round(amount)
  );
}

function formatDate(
  date: string
) {
  return new Date(
    `${date}T00:00:00`
  ).toLocaleDateString(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  );
}

export default App;
