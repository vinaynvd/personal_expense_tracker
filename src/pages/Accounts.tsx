import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import {
  db,
  type AccountRecord,
  type AccountType,
  type LoanCategory,
  type SavingsCategory,
  type TransactionRecord,
} from "../db";

type AccountsProps = {
  accounts: AccountRecord[];
  transactions: TransactionRecord[];
  onAccountsChanged: () => Promise<void>;
};

type LoanPaymentSummary = {
  balance: number;
  principalPaid: number;
  interestPaid: number;
  totalPaid: number;
  paymentCount: number;
};

/**
 * Calculates the effect of EMI payments on a loan.
 *
 * The transaction amount is the cash actually paid (the EMI).
 * Only the principal component reduces the loan outstanding.
 * Interest is an expense, not a reduction of principal.
 *
 * Historical payments should not be entered when the opening balance
 * is already the current outstanding principal; only payments made
 * after the account was created should be stored as transactions.
 */
function calculateLoanPayments(
  account: AccountRecord,
  transactions: TransactionRecord[]
): LoanPaymentSummary {
  const payments = transactions
    .filter(
      (transaction) =>
        transaction.type === "transfer" &&
        transaction.toAccount === account.name &&
        transaction.amount > 0
    )
    .sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      return dateCompare !== 0
        ? dateCompare
        : a.id.localeCompare(b.id);
    });

  let balance = Math.max(account.openingBalance || 0, 0);
  let principalPaid = 0;
  let interestPaid = 0;
  let totalPaid = 0;

  const monthlyRate =
    account.interestRate && account.interestRate > 0
      ? account.interestRate / 100 / 12
      : 0;

  for (const payment of payments) {
    if (balance <= 0) {
      break;
    }

    const interest = balance * monthlyRate;
    const amountPaid = Math.max(payment.amount, 0);
    const interestComponent = Math.min(
      amountPaid,
      interest
    );

    const principalComponent = Math.min(
      balance,
      Math.max(0, amountPaid - interestComponent)
    );

    interestPaid += interestComponent;
    principalPaid += principalComponent;
    totalPaid += amountPaid;
    balance = Math.max(
      0,
      balance - principalComponent
    );
  }

  // Payments after the loan is fully paid are still cash transactions,
  // so include them in the payment total even though they cannot reduce
  // the principal below zero.
  if (payments.length > 0 && totalPaid === 0) {
    totalPaid = payments.reduce(
      (total, payment) => total + payment.amount,
      0
    );
  }

  return {
    balance,
    principalPaid,
    interestPaid,
    totalPaid,
    paymentCount: payments.length,
  };
}

function Accounts({
  accounts,
  transactions,
  onAccountsChanged,
}: AccountsProps) {
  const [showAddModal, setShowAddModal] =
    useState(false);

  const [editingAccount, setEditingAccount] =
    useState<AccountRecord | null>(null);

  const [accountView, setAccountView] =
    useState<"full" | "easy">("easy");

  const [expandedAccounts, setExpandedAccounts] =
    useState<Set<string>>(() => new Set());

  function toggleAccount(accountId: string) {
    setExpandedAccounts((current) => {
      const next = new Set(current);
      if (next.has(accountId)) {
        next.delete(accountId);
      } else {
        next.add(accountId);
      }
      return next;
    });
  }

  // --------------------------------------------------
  // Basic account fields
  // --------------------------------------------------

  const [name, setName] = useState("");

  const [type, setType] =
    useState<AccountType>("bank");

  const [openingBalance, setOpeningBalance] =
    useState("");

  // --------------------------------------------------
  // Loan fields
  // --------------------------------------------------

  const [lender, setLender] = useState("");

  const [originalPrincipal, setOriginalPrincipal] =
    useState("");

  const [interestRate, setInterestRate] =
    useState("");

  const [emi, setEmi] = useState("");

  const [remainingTenure, setRemainingTenure] =
    useState("");

  const [loanStartDate, setLoanStartDate] =
    useState("");

  const [loanCategory, setLoanCategory] =
    useState<LoanCategory>("personal");

  // --------------------------------------------------
  // Chit fields
  // --------------------------------------------------

  const [chitValue, setChitValue] =
    useState("");

  const [monthlyContribution, setMonthlyContribution] =
    useState("");

  const [chitDurationMonths, setChitDurationMonths] =
    useState("");

  const [chitPaidMonths, setChitPaidMonths] =
    useState("");

  const [expectedPayout, setExpectedPayout] =
    useState("");

  const [chitStartDate, setChitStartDate] =
    useState("");

  const [chitMaturityDate, setChitMaturityDate] =
    useState("");

  // --------------------------------------------------
  // Savings fields
  // --------------------------------------------------

  const [savingsCategory, setSavingsCategory] =
    useState<SavingsCategory>("general");

  const [savingsTarget, setSavingsTarget] =
    useState("");

  const [savingsMonthlyContribution, setSavingsMonthlyContribution] =
    useState("");

  const [savingsStartDate, setSavingsStartDate] =
    useState("");

  const [savingsTargetDate, setSavingsTargetDate] =
    useState("");

  // ==================================================
  // ACCOUNT INTELLIGENCE ENGINE
  // ==================================================

  const accountStats = useMemo(() => {
    return accounts.map((account) => {
      const accountTransactions =
        transactions.filter(
          (transaction) =>
            transaction.account === account.name ||
            transaction.toAccount === account.name
        );

      // ----------------------------------------------
      // Normal income belonging to this account
      // ----------------------------------------------

      const income =
        accountTransactions
          .filter(
            (transaction) =>
              transaction.type === "income" &&
              transaction.account === account.name
          )
          .reduce(
            (total, transaction) =>
              total + transaction.amount,
            0
          );

      // ----------------------------------------------
      // Normal expenses belonging to this account
      // ----------------------------------------------

      const expenses =
        accountTransactions
          .filter(
            (transaction) =>
              transaction.type === "expense" &&
              transaction.account === account.name
          )
          .reduce(
            (total, transaction) =>
              total + transaction.amount,
            0
          );

      // ----------------------------------------------
      // Transfers OUT
      // ----------------------------------------------

      const transfersOut =
        accountTransactions
          .filter(
            (transaction) =>
              transaction.type === "transfer" &&
              transaction.account === account.name
          )
          .reduce(
            (total, transaction) =>
              total + transaction.amount,
            0
          );

      // ----------------------------------------------
      // Transfers IN
      // ----------------------------------------------

      const transfersIn =
        accountTransactions
          .filter(
            (transaction) =>
              transaction.type === "transfer" &&
              transaction.toAccount === account.name
          )
          .reduce(
            (total, transaction) =>
              total + transaction.amount,
            0
          );

      // ----------------------------------------------
      // Number of transactions
      // ----------------------------------------------

      const transactionCount =
        accountTransactions.length;

      // ----------------------------------------------
      // Calculate current balance
      // ----------------------------------------------

      const loanSummary =
        account.type === "loan"
          ? calculateLoanPayments(
              account,
              accountTransactions
            )
          : undefined;

      let balance =
        account.openingBalance;

      // Assets
      //
      // Bank / Cash:
      //
      // opening
      // + income
      // - expenses
      // - transfers out
      // + transfers in
      //
      if (
        account.type === "bank" ||
        account.type === "cash"
      ) {
        balance =
          account.openingBalance +
          income -
          expenses -
          transfersOut +
          transfersIn;
      }

      // Credit card:
      //
      // outstanding
      // + purchases
      // + money transferred OUT
      // - payments transferred IN
      //
      if (
        account.type === "credit-card"
      ) {
        balance =
          account.openingBalance +
          expenses +
          transfersOut -
          transfersIn -
          income;
      }

      // Loan:
      //
      // The transfer amount is the EMI/cash payment.
      // Only the principal component reduces outstanding.
      // Interest is paid out of the EMI but does not reduce
      // the principal balance.
      //
      // Transfers OUT represent additional borrowing and are
      // treated as principal additions.
      if (account.type === "loan") {
        balance =
          (loanSummary?.balance ??
            account.openingBalance) +
          transfersOut;
      }

      // Chit:
      //
      // contributed
      // + contributions
      // - payouts / money withdrawn
      //
      if (account.type === "chit") {
        balance =
          account.openingBalance +
          transfersIn -
          transfersOut;
      }

      // Savings behave like asset accounts. Transfers into savings
      // increase the saved balance; transfers out reduce it.
      if (account.type === "savings") {
        balance =
          account.openingBalance +
          income -
          expenses +
          transfersIn -
          transfersOut;
      }

      // ----------------------------------------------
      // Chit contribution count
      // ----------------------------------------------

      const chitContributions =
        account.type === "chit"
          ? accountTransactions.filter(
              (transaction) =>
                transaction.type === "transfer" &&
                transaction.toAccount ===
                  account.name
            ).length
          : 0;

      return {
        account,
        income,
        expenses,
        transfersIn,
        transfersOut,
        transactionCount,
        balance,
        chitContributions,
        principalPaid:
          loanSummary?.principalPaid ?? 0,
        interestPaid:
          loanSummary?.interestPaid ?? 0,
        loanPaymentCount:
          loanSummary?.paymentCount ?? 0,
      };
    });
  }, [accounts, transactions]);

  // ==================================================
  // OVERVIEW
  // ==================================================

  const totalAssets = accountStats
    .filter(
      ({ account }) =>
        account.type === "bank" ||
        account.type === "cash" ||
        account.type === "chit" ||
        account.type === "savings"
    )
    .reduce(
      (total, { balance }) =>
        total + balance,
      0
    );

  const totalCreditCardOutstanding =
    accountStats
      .filter(
        ({ account }) =>
          account.type === "credit-card"
      )
      .reduce(
        (total, { balance }) =>
          total + Math.max(0, balance),
        0
      );

  const totalLoanOutstanding =
    accountStats
      .filter(
        ({ account }) =>
          account.type === "loan"
      )
      .reduce(
        (total, { balance }) =>
          total + Math.max(0, balance),
        0
      );

  const totalLiabilities =
    totalCreditCardOutstanding +
    totalLoanOutstanding;

  const netPosition =
    totalAssets -
    totalLiabilities;

  // ==================================================
  // ADD ACCOUNT
  // ==================================================

  async function handleAddAccount() {
    const trimmedName = name.trim();

    if (!trimmedName) {
      alert("Please enter an account name.");
      return;
    }

    const duplicate = accounts.some(
      (account) =>
        account.name.toLowerCase() ===
        trimmedName.toLowerCase()
    );

    if (duplicate) {
      alert(
        "An account with this name already exists."
      );
      return;
    }

    const parsedOpeningBalance =
      Number(openingBalance) || 0;

    if (
      type === "loan" &&
      parsedOpeningBalance <= 0
    ) {
      alert(
        "Please enter the current loan outstanding."
      );
      return;
    }

    if (
      type === "chit" &&
      Number(chitValue) <= 0
    ) {
      alert(
        "Please enter the total chit value."
      );
      return;
    }

    const newAccount: AccountRecord = {
      id: crypto.randomUUID(),
      name: trimmedName,
      type,

      openingBalance:
        type === "chit"
          ? Number(monthlyContribution) *
            Number(chitPaidMonths)
          : parsedOpeningBalance,
    };

    // ----------------------------------------------
    // Loan
    // ----------------------------------------------

    if (type === "loan") {
      newAccount.loanCategory =
        loanCategory;

      newAccount.lender =
        lender.trim() || undefined;

      newAccount.originalPrincipal =
        Number(originalPrincipal) ||
        undefined;

      newAccount.interestRate =
        Number(interestRate) ||
        undefined;

      newAccount.emi =
        Number(emi) || undefined;

      newAccount.remainingTenure =
        Number(remainingTenure) ||
        undefined;

      newAccount.loanStartDate =
        loanStartDate || undefined;
    }

    // ----------------------------------------------
    // Chit
    // ----------------------------------------------

    if (type === "chit") {
      newAccount.chitValue =
        Number(chitValue) || undefined;

      newAccount.monthlyContribution =
        Number(monthlyContribution) ||
        undefined;

      newAccount.chitDurationMonths =
        Number(chitDurationMonths) ||
        undefined;

      newAccount.chitPaidMonths =
        Number(chitPaidMonths) || 0;

      newAccount.expectedPayout =
        Number(expectedPayout) ||
        undefined;

      newAccount.chitStartDate =
        chitStartDate || undefined;

      newAccount.chitMaturityDate =
        chitMaturityDate || undefined;
    }

    if (type === "savings") {
      newAccount.savingsCategory = savingsCategory;
      newAccount.savingsTarget = Number(savingsTarget) || undefined;
      newAccount.savingsMonthlyContribution = Number(savingsMonthlyContribution) || undefined;
      newAccount.savingsStartDate = savingsStartDate || undefined;
      newAccount.savingsTargetDate = savingsTargetDate || undefined;
    }

    await db.accounts.add(newAccount);

    await onAccountsChanged();

    resetForm();
    setShowAddModal(false);
  }

  // ==================================================
  // RESET FORM
  // ==================================================

  function resetForm() {
    setName("");
    setType("bank");
    setOpeningBalance("");

    setLender("");
    setOriginalPrincipal("");
    setInterestRate("");
    setEmi("");
    setRemainingTenure("");
    setLoanStartDate("");
    setLoanCategory("personal");

    setChitValue("");
    setMonthlyContribution("");
    setChitDurationMonths("");
    setChitPaidMonths("");
    setExpectedPayout("");
    setChitStartDate("");
    setChitMaturityDate("");

    setSavingsCategory("general");
    setSavingsTarget("");
    setSavingsMonthlyContribution("");
    setSavingsStartDate("");
    setSavingsTargetDate("");
  }

  // ==================================================
  // EDIT ACCOUNT
  // ==================================================

  function handleEditAccount(account: AccountRecord) {
    setEditingAccount(account);
    setName(account.name);
    setType(account.type);
    setOpeningBalance(String(account.openingBalance ?? 0));

    setLender(account.lender || "");
    setOriginalPrincipal(
      account.originalPrincipal !== undefined
        ? String(account.originalPrincipal)
        : ""
    );
    setInterestRate(
      account.interestRate !== undefined
        ? String(account.interestRate)
        : ""
    );
    setEmi(
      account.emi !== undefined
        ? String(account.emi)
        : ""
    );
    setRemainingTenure(
      account.remainingTenure !== undefined
        ? String(account.remainingTenure)
        : ""
    );
    setLoanStartDate(account.loanStartDate || "");
    setLoanCategory(account.loanCategory || "personal");

    setChitValue(
      account.chitValue !== undefined
        ? String(account.chitValue)
        : ""
    );
    setMonthlyContribution(
      account.monthlyContribution !== undefined
        ? String(account.monthlyContribution)
        : ""
    );
    setChitDurationMonths(
      account.chitDurationMonths !== undefined
        ? String(account.chitDurationMonths)
        : ""
    );
    setChitPaidMonths(
      account.chitPaidMonths !== undefined
        ? String(account.chitPaidMonths)
        : ""
    );
    setExpectedPayout(
      account.expectedPayout !== undefined
        ? String(account.expectedPayout)
        : ""
    );
    setChitStartDate(account.chitStartDate || "");
    setChitMaturityDate(account.chitMaturityDate || "");

    setSavingsCategory(account.savingsCategory || "general");
    setSavingsTarget(account.savingsTarget !== undefined ? String(account.savingsTarget) : "");
    setSavingsMonthlyContribution(account.savingsMonthlyContribution !== undefined ? String(account.savingsMonthlyContribution) : "");
    setSavingsStartDate(account.savingsStartDate || "");
    setSavingsTargetDate(account.savingsTargetDate || "");
  }

  function closeAccountForm() {
    resetForm();
    setEditingAccount(null);
    setShowAddModal(false);
  }

  async function handleSaveAccount() {
    if (!editingAccount) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      alert("Please enter an account name.");
      return;
    }

    const duplicate = accounts.some(
      (account) =>
        account.id !== editingAccount.id &&
        account.name.toLowerCase() === trimmedName.toLowerCase()
    );

    if (duplicate) {
      alert("An account with this name already exists.");
      return;
    }

    const hasTransactions = transactions.some(
      (transaction) =>
        transaction.account === editingAccount.name ||
        transaction.toAccount === editingAccount.name
    );

    const updatedAccount: AccountRecord = {
      ...editingAccount,
      name: trimmedName,
      type,
      openingBalance:
        type === "chit"
          ? Number(monthlyContribution) * Number(chitPaidMonths)
          : Number(openingBalance) || 0,
    };

    if (type === "loan") {
      updatedAccount.loanCategory = loanCategory;
      updatedAccount.lender = lender.trim() || undefined;
      updatedAccount.originalPrincipal = Number(originalPrincipal) || undefined;
      updatedAccount.interestRate = Number(interestRate) || undefined;
      updatedAccount.emi = Number(emi) || undefined;
      updatedAccount.remainingTenure = Number(remainingTenure) || undefined;
      updatedAccount.loanStartDate = loanStartDate || undefined;
    } else {
      delete updatedAccount.loanCategory;
      delete updatedAccount.lender;
      delete updatedAccount.originalPrincipal;
      delete updatedAccount.interestRate;
      delete updatedAccount.emi;
      delete updatedAccount.remainingTenure;
      delete updatedAccount.loanStartDate;
    }

    if (type === "chit") {
      updatedAccount.chitValue = Number(chitValue) || undefined;
      updatedAccount.monthlyContribution = Number(monthlyContribution) || undefined;
      updatedAccount.chitDurationMonths = Number(chitDurationMonths) || undefined;
      updatedAccount.chitPaidMonths = Number(chitPaidMonths) || 0;
      updatedAccount.expectedPayout = Number(expectedPayout) || undefined;
      updatedAccount.chitStartDate = chitStartDate || undefined;
      updatedAccount.chitMaturityDate = chitMaturityDate || undefined;
    } else {
      delete updatedAccount.chitValue;
      delete updatedAccount.monthlyContribution;
      delete updatedAccount.chitDurationMonths;
      delete updatedAccount.chitPaidMonths;
      delete updatedAccount.expectedPayout;
      delete updatedAccount.chitStartDate;
      delete updatedAccount.chitMaturityDate;
    }

    if (type === "savings") {
      updatedAccount.savingsCategory = savingsCategory;
      updatedAccount.savingsTarget = Number(savingsTarget) || undefined;
      updatedAccount.savingsMonthlyContribution = Number(savingsMonthlyContribution) || undefined;
      updatedAccount.savingsStartDate = savingsStartDate || undefined;
      updatedAccount.savingsTargetDate = savingsTargetDate || undefined;
    } else {
      delete updatedAccount.savingsCategory;
      delete updatedAccount.savingsTarget;
      delete updatedAccount.savingsMonthlyContribution;
      delete updatedAccount.savingsStartDate;
      delete updatedAccount.savingsTargetDate;
    }

    // Transactions currently reference accounts by name. If the account is
    // renamed, update those references too so historical data keeps working.
    if (hasTransactions && trimmedName !== editingAccount.name) {
      await db.transaction("rw", db.accounts, db.transactions, async () => {
        await db.accounts.put(updatedAccount);

        const relatedTransactions = await db.transactions
          .filter(
            (transaction) =>
              transaction.account === editingAccount.name ||
              transaction.toAccount === editingAccount.name
          )
          .toArray();

        for (const transaction of relatedTransactions) {
          await db.transactions.put({
            ...transaction,
            account:
              transaction.account === editingAccount.name
                ? trimmedName
                : transaction.account,
            toAccount:
              transaction.toAccount === editingAccount.name
                ? trimmedName
                : transaction.toAccount,
          });
        }
      });
    } else {
      await db.accounts.put(updatedAccount);
    }

    await onAccountsChanged();
    closeAccountForm();
  }

  // ==================================================
  // DELETE ACCOUNT
  // ==================================================

  async function handleDeleteAccount(
    account: AccountRecord
  ) {
    const hasTransactions =
      transactions.some(
        (transaction) =>
          transaction.account ===
            account.name ||
          transaction.toAccount ===
            account.name
      );

    if (hasTransactions) {
      alert(
        "This account has transactions and cannot be deleted yet."
      );
      return;
    }

    const confirmed =
      window.confirm(
        `Delete "${account.name}"?`
      );

    if (!confirmed) {
      return;
    }

    await db.accounts.delete(account.id);

    await onAccountsChanged();
  }

  // ==================================================
  // RENDER
  // ==================================================

  return (
    <main className="dashboard accounts-page">
      {/* ==============================================
          PAGE HEADER
          ============================================== */}

      <div className="page-title">
        <div>
          <h1>Accounts</h1>

          <p>
            Track your money, liabilities and
            chits in one place.
          </p>
        </div>

        <button
          className="primary-button add-account-button"
          onClick={() => {
            resetForm();
            setEditingAccount(null);
            setShowAddModal(true);
          }}
        >
          + Add Account
        </button>
      </div>

      <div className="account-view-tabs" role="tablist" aria-label="Account view">
        <button
          type="button"
          className={`account-view-tab ${accountView === "full" ? "active" : ""}`}
          onClick={() => setAccountView("full")}
          role="tab"
          aria-selected={accountView === "full"}
        >
          Full View
        </button>
        <button
          type="button"
          className={`account-view-tab ${accountView === "easy" ? "active" : ""}`}
          onClick={() => setAccountView("easy")}
          role="tab"
          aria-selected={accountView === "easy"}
        >
          Easy View
        </button>
      </div>

      <style>{COMPACT_VIEW_CSS}</style>

      {accountView === "full" ? (
        <>
      {/* ==============================================
          OVERVIEW
          ============================================== */}

      <section className="account-overview">
        <div className="account-overview-card">
          <span>Total Assets</span>

          <strong className="income">
            ₹
            {formatCurrency(totalAssets)}
          </strong>

          <small>
            Bank + cash + savings + chit value
          </small>
        </div>

        <div className="account-overview-card">
          <span>Total Liabilities</span>

          <strong className="negative-text">
            ₹
            {formatCurrency(
              totalLiabilities
            )}
          </strong>

          <small>
            Credit cards + loans
          </small>
        </div>

        <div className="account-overview-card">
          <span>Net Position</span>

          <strong
            className={
              netPosition < 0
                ? "negative-text"
                : "income"
            }
          >
            {netPosition < 0 ? "-" : ""}
            ₹
            {formatCurrency(
              Math.abs(netPosition)
            )}
          </strong>

          <small>
            Assets − liabilities
          </small>
        </div>
      </section>

      {/* ==============================================
          ASSETS
          ============================================== */}

      <AccountSectionTitle
        title="Assets"
        description="Money currently available to you."
      />

      <section className="accounts-grid">
        {accountStats
          .filter(
            ({ account }) =>
              account.type === "bank" ||
              account.type === "cash"
          )
          .map(
            ({
              account,
              income,
              expenses,
              transfersIn,
              transfersOut,
              transactionCount,
              balance,
            }) => (
              <AccountCard
                key={account.id}
                account={account}
                income={income}
                expenses={expenses}
                transfersIn={transfersIn}
                transfersOut={transfersOut}
                transactionCount={
                  transactionCount
                }
                balance={balance}
                transactions={transactions}
                expanded={expandedAccounts.has(account.id)}
                onToggle={() =>
                  toggleAccount(account.id)
                }
                onDelete={
                  handleDeleteAccount
                }
                onEdit={
                  handleEditAccount
                }
              />
            )
          )}
      </section>

      {/* ==============================================
          SAVINGS
          ============================================== */}

      <AccountSectionTitle
        title="Savings"
        description="Track money set aside for goals and long-term saving."
      />

      <section className="accounts-grid">
        {accountStats
          .filter(({ account }) => account.type === "savings")
          .map(({ account, income, expenses, transfersIn, transfersOut, transactionCount, balance }) => (
            <AccountCard
              key={account.id}
              account={account}
              income={income}
              expenses={expenses}
              transfersIn={transfersIn}
              transfersOut={transfersOut}
              transactionCount={transactionCount}
              balance={balance}
              transactions={transactions}
              expanded={expandedAccounts.has(account.id)}
              onToggle={() => toggleAccount(account.id)}
              onDelete={handleDeleteAccount}
              onEdit={handleEditAccount}
            />
          ))}
      </section>

      {/* ==============================================
          CREDIT CARDS
          ============================================== */}

      <AccountSectionTitle
        title="Credit Cards"
        description="Current tracked card liabilities."
      />

      <section className="accounts-grid">
        {accountStats
          .filter(
            ({ account }) =>
              account.type ===
              "credit-card"
          )
          .map(
            ({
              account,
              income,
              expenses,
              transfersIn,
              transfersOut,
              transactionCount,
              balance,
            }) => (
              <AccountCard
                key={account.id}
                account={account}
                income={income}
                expenses={expenses}
                transfersIn={transfersIn}
                transfersOut={transfersOut}
                transactionCount={
                  transactionCount
                }
                balance={balance}
                transactions={transactions}
                expanded={expandedAccounts.has(account.id)}
                onToggle={() =>
                  toggleAccount(account.id)
                }
                onDelete={
                  handleDeleteAccount
                }
                onEdit={
                  handleEditAccount
                }
              />
            )
          )}
      </section>

      {/* ==============================================
          LOANS
          ============================================== */}

      <AccountSectionTitle
        title="Loans"
        description="Track outstanding debt, EMI and interest."
      />

      <section className="accounts-grid">
        {accountStats.filter(
          ({ account }) =>
            account.type === "loan"
        ).length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              🏦
            </div>

            <strong>
              No loans added yet
            </strong>

            <span>
              Add your home loan, personal loan,
              vehicle loan, etc.
            </span>
          </div>
        ) : (
          accountStats
            .filter(
              ({ account }) =>
                account.type === "loan"
            )
            .map(
              ({
                account,
                income,
                expenses,
                transfersIn,
                transfersOut,
                transactionCount,
                balance,
                principalPaid,
                interestPaid,
                loanPaymentCount,
              }) => (
                <LoanCard
                  key={account.id}
                  account={account}
                  income={income}
                  expenses={expenses}
                  transfersIn={transfersIn}
                  transfersOut={transfersOut}
                  transactionCount={
                    transactionCount
                  }
                  balance={balance}
                  principalPaid={principalPaid}
                  interestPaid={interestPaid}
                  loanPaymentCount={loanPaymentCount}
                  transactions={transactions}
                  expanded={expandedAccounts.has(account.id)}
                  onToggle={() =>
                    toggleAccount(account.id)
                  }
                  onDelete={
                    handleDeleteAccount
                  }
                  onEdit={
                    handleEditAccount
                  }
                />
              )
            )
        )}
      </section>

      {/* ==============================================
          CHITS
          ============================================== */}

      <AccountSectionTitle
        title="Chits"
        description="Track your chit commitments and expected payouts."
      />

      <section className="accounts-grid">
        {accountStats.filter(
          ({ account }) =>
            account.type === "chit"
        ).length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              🪙
            </div>

            <strong>
              No chits added yet
            </strong>

            <span>
              Add your 5L, 10L or other chit
              commitments.
            </span>
          </div>
        ) : (
          accountStats
            .filter(
              ({ account }) =>
                account.type === "chit"
            )
            .map(
              ({
                account,
                transactionCount,
                transfersIn,
                transfersOut,
                chitContributions,
              }) => (
                <ChitCard
                  key={account.id}
                  account={account}
                  transactionCount={
                    transactionCount
                  }
                  transfersIn={transfersIn}
                  transfersOut={transfersOut}
                  chitContributions={
                    chitContributions
                  }
                  transactions={transactions}
                  expanded={expandedAccounts.has(account.id)}
                  onToggle={() =>
                    toggleAccount(account.id)
                  }
                  onDelete={
                    handleDeleteAccount
                  }
                  onEdit={
                    handleEditAccount
                  }
                />
              )
            )
        )}
      </section>

        </>
      ) : (
        <CompactAccountsView
          accountStats={accountStats}
          transactions={transactions}
          onDelete={handleDeleteAccount}
          onEdit={handleEditAccount}
        />
      )}

      {/* ==============================================
          ACCOUNT NOTE
          ============================================== */}

      <section className="account-note">
        <strong>
          💡 Transactions drive your balances
        </strong>

        <p>
          Expenses reduce asset balances,
          income increases them, and Transfers
          move money between accounts without
          being counted as income or expenses.
        </p>
      </section>

      {/* ==============================================
          ADD ACCOUNT MODAL
          ============================================== */}

      {(showAddModal || editingAccount) && (
        <div
          className="modal-overlay"
          onMouseDown={() =>
            setShowAddModal(false)
          }
        >
          <div
            className="modal"
            onMouseDown={(event) =>
              event.stopPropagation()
            }
          >
            <div className="modal-header">
              <div>
                <h2>{editingAccount ? "Edit Account" : "Add Account"}</h2>

                <p>
                  Add a bank, cash account, credit card, loan, chit or savings account.
                </p>
              </div>

              <button
                className="modal-close"
                onClick={() => {
                  closeAccountForm();
                }}
              >
                ×
              </button>
            </div>

            {/* NAME */}

            <div className="form-group">
              <label>
                Account name
              </label>

              <input
                type="text"
                placeholder={
                  type === "loan"
                    ? "Example: Bajaj Home Loan"
                    : type === "chit"
                    ? "Example: 5L Chit - 1"
                    : type === "savings"
                    ? "Example: House Fund"
                    : "Example: SBI Bank"
                }
                value={name}
                onChange={(event) =>
                  setName(
                    event.target.value
                  )
                }
              />
            </div>

            {/* TYPE */}

            <div className="form-group">
              <label>
                Account type
              </label>

              <select
                value={type}
                onChange={(event) =>
                  setType(
                    event.target
                      .value as AccountType
                  )
                }
              >
                <option value="bank">
                  🏦 Bank Account
                </option>

                <option value="cash">
                  💵 Cash
                </option>

                <option value="credit-card">
                  💳 Credit Card
                </option>

                <option value="loan">
                  🏦 Loan
                </option>

                <option value="chit">
                  🪙 Chit
                </option>

                <option value="savings">
                  💰 Savings
                </option>
              </select>
            </div>

            {/* NORMAL ACCOUNTS */}

            {type !== "loan" &&
              type !== "chit" && (
                <div className="form-group">
                  <label>
                    {type === "credit-card"
                      ? "Current outstanding"
                      : type === "savings"
                      ? "Current saved balance"
                      : "Opening balance"}
                  </label>

                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={
                      openingBalance
                    }
                    onChange={(event) =>
                      setOpeningBalance(
                        event.target.value
                      )
                    }
                  />
                </div>
              )}

            {/* LOAN */}

            {type === "loan" && (
              <>
                <div className="form-group">
                  <label>
                    Current outstanding
                  </label>

                  <input
                    type="number"
                    min="0"
                    placeholder="3000000"
                    value={
                      openingBalance
                    }
                    onChange={(event) =>
                      setOpeningBalance(
                        event.target.value
                      )
                    }
                  />
                </div>

                <div className="loan-form-divider">
                  Loan details
                </div>

                <div className="form-group">
                  <label>
                    Lender
                  </label>

                  <input
                    type="text"
                    placeholder="Example: Bajaj Finance"
                    value={lender}
                    onChange={(event) =>
                      setLender(
                        event.target.value
                      )
                    }
                  />
                </div>

                <div className="form-group">
                  <label>
                    Loan category
                  </label>

                  <select
                    value={loanCategory}
                    onChange={(event) =>
                      setLoanCategory(
                        event.target.value as LoanCategory
                      )
                    }
                  >
                    <option value="personal">
                      Personal Loan
                    </option>
                    <option value="credit-card">
                      Credit Card Loan
                    </option>
                    <option value="home">
                      Home Loan
                    </option>
                    <option value="other">
                      Other Loan
                    </option>
                  </select>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>
                      Original principal
                    </label>

                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={
                        originalPrincipal
                      }
                      onChange={(event) =>
                        setOriginalPrincipal(
                          event.target.value
                        )
                      }
                    />
                  </div>

                  <div className="form-group">
                    <label>
                      Interest rate %
                    </label>

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="8.5"
                      value={
                        interestRate
                      }
                      onChange={(event) =>
                        setInterestRate(
                          event.target.value
                        )
                      }
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>
                      Monthly EMI
                    </label>

                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={emi}
                      onChange={(event) =>
                        setEmi(
                          event.target.value
                        )
                      }
                    />
                  </div>

                  <div className="form-group">
                    <label>
                      Remaining months
                    </label>

                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={
                        remainingTenure
                      }
                      onChange={(event) =>
                        setRemainingTenure(
                          event.target.value
                        )
                      }
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>
                    Loan start date
                  </label>

                  <input
                    type="date"
                    value={
                      loanStartDate
                    }
                    onChange={(event) =>
                      setLoanStartDate(
                        event.target.value
                      )
                    }
                  />
                </div>
              </>
            )}

            {/* CHIT */}

            {type === "chit" && (
              <>
                <div className="loan-form-divider">
                  Chit details
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>
                      Total chit value
                    </label>

                    <input
                      type="number"
                      min="0"
                      placeholder="500000"
                      value={
                        chitValue
                      }
                      onChange={(event) =>
                        setChitValue(
                          event.target.value
                        )
                      }
                    />
                  </div>

                  <div className="form-group">
                    <label>
                      Monthly contribution
                    </label>

                    <input
                      type="number"
                      min="0"
                      placeholder="25000"
                      value={
                        monthlyContribution
                      }
                      onChange={(event) =>
                        setMonthlyContribution(
                          event.target.value
                        )
                      }
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>
                      Duration
                    </label>

                    <input
                      type="number"
                      min="1"
                      placeholder="20"
                      value={
                        chitDurationMonths
                      }
                      onChange={(event) =>
                        setChitDurationMonths(
                          event.target.value
                        )
                      }
                    />
                  </div>

                  <div className="form-group">
                    <label>
                      Already paid months
                    </label>

                    <input
                      type="number"
                      min="0"
                      placeholder="8"
                      value={
                        chitPaidMonths
                      }
                      onChange={(event) =>
                        setChitPaidMonths(
                          event.target.value
                        )
                      }
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>
                    Expected payout
                  </label>

                  <input
                    type="number"
                    min="0"
                    placeholder="480000"
                    value={
                      expectedPayout
                    }
                    onChange={(event) =>
                      setExpectedPayout(
                        event.target.value
                      )
                    }
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>
                      Start date
                    </label>

                    <input
                      type="date"
                      value={
                        chitStartDate
                      }
                      onChange={(event) =>
                        setChitStartDate(
                          event.target.value
                        )
                      }
                    />
                  </div>

                  <div className="form-group">
                    <label>
                      Maturity date
                    </label>

                    <input
                      type="date"
                      value={
                        chitMaturityDate
                      }
                      onChange={(event) =>
                        setChitMaturityDate(
                          event.target.value
                        )
                      }
                    />
                  </div>
                </div>
              </>
            )}

            {type === "savings" && (
              <>
                <div className="loan-form-divider">
                  Savings details
                </div>

                <div className="form-group">
                  <label>Savings type</label>
                  <select
                    value={savingsCategory}
                    onChange={(event) =>
                      setSavingsCategory(event.target.value as SavingsCategory)
                    }
                  >
                    <option value="general">General Savings</option>
                    <option value="fd">Fixed Deposit (FD)</option>
                    <option value="rd">Recurring Deposit (RD)</option>
                    <option value="ppf">PPF</option>
                    <option value="goal">Goal / House Fund</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Target amount</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="2500000"
                      value={savingsTarget}
                      onChange={(event) => setSavingsTarget(event.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label>Monthly contribution</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="50000"
                      value={savingsMonthlyContribution}
                      onChange={(event) => setSavingsMonthlyContribution(event.target.value)}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Start date</label>
                    <input
                      type="date"
                      value={savingsStartDate}
                      onChange={(event) => setSavingsStartDate(event.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label>Target date</label>
                    <input
                      type="date"
                      value={savingsTargetDate}
                      onChange={(event) => setSavingsTargetDate(event.target.value)}
                    />
                  </div>
                </div>
              </>
            )}

            <button
              className="primary-button modal-submit"
              onClick={
                editingAccount
                  ? handleSaveAccount
                  : handleAddAccount
              }
            >
              {editingAccount ? "Save Changes" : "Add Account"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

/* ======================================================
   EASY / COMPACT ACCOUNT VIEW
   ====================================================== */

const COMPACT_VIEW_CSS = `
  .account-view-tabs {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px;
    margin: 0 0 24px;
    border: 1px solid #dbe3ef;
    border-radius: 12px;
    background: #f8fafc;
  }

  .account-view-tab {
    border: 0;
    border-radius: 9px;
    padding: 9px 16px;
    background: transparent;
    color: #64748b;
    font: inherit;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
  }

  .account-view-tab.active {
    background: #0f172a;
    color: #fff;
  }

  .compact-accounts-view {
    display: flex;
    flex-direction: column;
    gap: 22px;
    margin-bottom: 28px;
  }

  .compact-view-header h2 {
    margin: 0;
    font-size: 20px;
  }

  .compact-view-header p {
    margin: 5px 0 0;
    color: #64748b;
    font-size: 13px;
  }

  .compact-section {
    overflow: hidden;
    border: 1px solid #dbe3ef;
    border-radius: 14px;
    background: #fff;
  }

  .compact-section-title {
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: space-between;
    padding: 13px 16px;
    border: 0;
    border-bottom: 1px solid #e8edf4;
    background: #f8fafc;
    color: #0f172a;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .compact-section.collapsed .compact-section-title {
    border-bottom: 0;
  }

  .compact-section-title:hover {
    background: #f1f5f9;
  }

  .compact-section-title:focus-visible {
    outline: 2px solid #2563eb;
    outline-offset: -2px;
  }

  .compact-section-controls {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-bottom: 1px solid #e8edf4;
    background: #fff;
  }

  .compact-search-wrap {
    position: relative;
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
  }

  .compact-search-wrap input,
  .compact-section-controls select {
    width: 100%;
    min-height: 38px;
    box-sizing: border-box;
    border: 1px solid #dbe3ef;
    border-radius: 9px;
    background: #f8fafc;
    color: #0f172a;
    font: inherit;
    font-size: 13px;
    outline: none;
  }

  .compact-search-wrap input {
    padding: 8px 34px 8px 34px;
  }

  .compact-section-controls select {
    width: 150px;
    padding: 8px 10px;
    cursor: pointer;
  }

  .compact-search-wrap input:focus,
  .compact-section-controls select:focus {
    border-color: #93c5fd;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.08);
    background: #fff;
  }

  .compact-search-icon {
    position: absolute;
    left: 11px;
    color: #64748b;
    font-size: 18px;
    pointer-events: none;
  }

  .compact-search-clear {
    position: absolute;
    right: 7px;
    width: 26px;
    height: 26px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: #64748b;
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
  }

  .compact-search-clear:hover {
    background: #e2e8f0;
    color: #0f172a;
  }

  .compact-obligation-sticky {
    position: sticky;
    top: 8px;
    z-index: 20;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin: 0 0 14px;
    padding: 10px 0;
    background: rgba(246, 248, 251, 0.96);
    backdrop-filter: blur(10px);
  }

  .compact-obligation-card {
    min-width: 0;
    padding: 14px 16px;
    border: 1px solid #dbe4ef;
    border-radius: 12px;
    background: #fff;
    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06);
  }

  .compact-obligation-card span {
    display: block;
    color: #64748b;
    font-size: 12px;
    font-weight: 600;
  }

  .compact-obligation-card strong {
    display: block;
    margin-top: 4px;
    color: #0f172a;
    font-size: 22px;
    line-height: 1.15;
  }

  .compact-obligation-card small {
    display: block;
    margin-top: 5px;
    color: #94a3b8;
    font-size: 11px;
  }

  .compact-section-title h3 {
    margin: 0;
    font-size: 15px;
  }

  .compact-section-title span {
    min-width: 24px;
    padding: 3px 7px;
    border-radius: 999px;
    background: #e8eef7;
    color: #475569;
    text-align: center;
    font-size: 12px;
    font-weight: 700;
  }

  .compact-section-body {
    display: flex;
    flex-direction: column;
  }

  .compact-row,
  .compact-loan-row,
  .compact-savings-row {
    grid-template-columns: minmax(0, 1fr) 60px;
  }

  .compact-savings-closed-stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(90px, 1fr));
    gap: 16px;
    margin-top: 10px;
  }

  .compact-savings-closed-stats > div {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .compact-savings-no-target {
    color: #94a3b8;
    font-size: 12px;
    margin-top: 8px;
  }

  .compact-chit-row {
    display: grid;
    align-items: center;
    gap: 16px;
    padding: 14px 16px;
    border-bottom: 1px solid #edf1f6;
  }

  .compact-row:last-child,
  .compact-loan-row:last-child,
  .compact-chit-row:last-child {
    border-bottom: 0;
  }

  .compact-row {
    grid-template-columns: minmax(180px, 1fr) auto 64px;
  }

  .compact-row > div,
  .compact-loan-stat,
  .compact-chit-stat,
  .compact-chit-name {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .compact-row strong,
  .compact-loan-stat strong,
  .compact-chit-stat strong,
  .compact-chit-name strong {
    color: #0f172a;
    font-size: 14px;
  }

  .compact-row span,
  .compact-loan-stat span,
  .compact-chit-stat span,
  .compact-chit-name span {
    color: #64748b;
    font-size: 12px;
  }

  .compact-row > strong {
    white-space: nowrap;
  }

  .compact-loan-row {
    grid-template-columns: minmax(220px, 1.5fr) repeat(3, minmax(105px, .7fr)) 64px;
  }

  .compact-loan-main {
    min-width: 0;
  }

  .compact-row-title-wrap {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 7px;
  }

  .compact-row-title-wrap span {
    color: #16a34a;
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
  }

  .compact-progress-track {
    position: relative;
    height: 14px;
    overflow: hidden;
    border-radius: 999px;
    background: #e2e8f0;
  }

  .compact-progress-fill {
    position: relative;
    height: 100%;
    min-width: 0;
    border-radius: inherit;
    transition: width 220ms ease, background-color 220ms ease;
  }

  .compact-progress-fill.progress-low {
    background: #ef4444;
  }

  .compact-progress-fill.progress-medium {
    background: #f59e0b;
  }

  .compact-progress-fill.progress-healthy {
    background: #22c55e;
  }

  .compact-progress-label {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2;
    color: #0f172a;
    font-size: 10px;
    font-weight: 800;
    line-height: 1;
    pointer-events: none;
  }

  .compact-progress-label.on-fill {
    color: #fff;
  }

  .compact-chit-row {
    grid-template-columns: minmax(190px, 1.3fr) repeat(4, minmax(100px, .7fr)) 64px;
  }

  .account-card-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .account-edit,
  .account-delete {
    border: 0;
    background: transparent;
    cursor: pointer;
    border-radius: 8px;
    padding: 6px;
    font-size: 16px;
  }

  .account-edit:hover,
  .account-delete:hover {
    background: #f1f5f9;
  }

  .compact-row-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
    width: 60px;
    justify-content: flex-end;
  }

  .compact-edit {
    border: 0;
    background: transparent;
    cursor: pointer;
    border-radius: 8px;
    padding: 7px;
    font-size: 15px;
  }

  .compact-edit:hover {
    background: #f1f5f9;
  }

  .compact-delete {
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    background: transparent;
    color: #94a3b8;
    cursor: pointer;
    opacity: .65;
  }

  .compact-delete:hover {
    opacity: 1;
  }

  .compact-empty {
    padding: 18px 16px;
    color: #64748b;
    font-size: 13px;
  }

  .compact-expandable-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 64px;
    align-items: start;
    gap: 10px;
    padding: 14px 16px;
    border-bottom: 1px solid #edf1f6;
    background: #fff;
  }

  .compact-expandable-row:last-child {
    border-bottom: 0;
  }

  .compact-row-main {
    min-width: 0;
    cursor: pointer;
    outline: none;
  }

  .compact-row-main:focus-visible {
    border-radius: 8px;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, .15);
  }

  .compact-row-summary {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 14px;
    min-height: 38px;
  }

  .compact-row-summary > div,
  .compact-loan-summary,
  .compact-chit-summary {
    min-width: 0;
  }

  .compact-row-summary > div,
  .compact-row-title-wrap,
  .compact-loan-closed-stats,
  .compact-chit-closed-stats {
    display: flex;
    flex-direction: column;
  }

  .compact-row-summary > div {
    gap: 3px;
  }

  .compact-row-summary > div span,
  .compact-loan-closed-stats span,
  .compact-chit-closed-stats span {
    color: #64748b;
    font-size: 12px;
  }

  .compact-row-summary > strong {
    white-space: nowrap;
    font-size: 14px;
  }

  .compact-loan-row,
  .compact-chit-row {
    grid-template-columns: minmax(0, 1fr) 64px;
  }

  .compact-loan-summary,
  .compact-chit-summary {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .compact-row-title-wrap {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .compact-row-title-wrap span {
    color: #16a34a;
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
  }

  .compact-loan-closed-stats,
  .compact-chit-closed-stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }

  .compact-loan-closed-stats > div,
  .compact-chit-closed-stats > div {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .compact-loan-closed-stats strong,
  .compact-chit-closed-stats strong {
    font-size: 14px;
    color: #0f172a;
  }

  .compact-expanded-details {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    margin-top: 14px;
    padding: 14px;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    background: #f8fafc;
  }

  .compact-detail {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    padding: 4px 0;
  }

  .compact-detail span {
    color: #64748b;
    font-size: 11px;
  }

  .compact-detail strong {
    color: #0f172a;
    font-size: 13px;
    overflow-wrap: anywhere;
  }

  .compact-delete {
    position: relative;
    z-index: 2;
    align-self: start;
  }

  @media (max-width: 900px) {
    .compact-expanded-details {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 560px) {
    .compact-section-controls {
      flex-direction: column;
      align-items: stretch;
    }

    .compact-section-controls select {
      width: 100%;
    }

    .compact-obligation-sticky {
      grid-template-columns: 1fr;
      top: 4px;
    }

    .compact-obligation-card {
      padding: 12px 14px;
    }

    .compact-obligation-card strong {
      font-size: 19px;
    }

    .account-view-tabs {
      width: 100%;
    }

    .account-view-tab {
      flex: 1;
    }

    .compact-row-summary {
      grid-template-columns: minmax(0, 1fr) auto 20px;
      gap: 8px;
    }

    .compact-loan-closed-stats,
    .compact-chit-closed-stats,
    .compact-savings-closed-stats,
    .compact-expanded-details {
      grid-template-columns: 1fr 1fr;
    }

    .compact-expanded-details {
      gap: 8px;
      padding: 11px;
    }
  }


.compact-section-meta {
  display: flex;
  align-items: center;
  gap: 10px;
}

.compact-section-meta strong {
  font-size: 0.82rem;
  font-weight: 700;
  white-space: nowrap;
}

`;

function getCompactProgressClass(progress: number) {
  if (progress < 10) {
    return "progress-low";
  }

  if (progress < 50) {
    return "progress-medium";
  }

  return "progress-healthy";
}

function CompactAccountsView({
  accountStats,
  transactions,
  onDelete,
  onEdit,
}: {
  accountStats: Array<{
    account: AccountRecord;
    income: number;
    expenses: number;
    transfersIn: number;
    transfersOut: number;
    transactionCount: number;
    balance: number;
    chitContributions: number;
    principalPaid: number;
    interestPaid: number;
    loanPaymentCount: number;
  }>;
  transactions: TransactionRecord[];
  onDelete: (account: AccountRecord) => void;
  onEdit: (account: AccountRecord) => void;
}) {
  // Easy View starts with all groups collapsed.
  // Clicking a group header reveals only that group's rows.
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    () => new Set()
  );

  const [sectionSearch, setSectionSearch] = useState<Record<string, string>>({});
  const [sectionFilter, setSectionFilter] = useState<Record<string, string>>({});

  function getSectionSearch(section: string) {
    return (sectionSearch[section] || "").trim().toLowerCase();
  }

  function getSectionFilter(section: string) {
    return sectionFilter[section] || "all";
  }

  function updateSectionSearch(section: string, value: string) {
    setSectionSearch((current) => ({ ...current, [section]: value }));
  }

  function updateSectionFilter(section: string, value: string) {
    setSectionFilter((current) => ({ ...current, [section]: value }));
  }

  function toggleSection(section: string) {
    setExpandedSections((current) => {
      const next = new Set(current);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  }

  const assets = accountStats.filter(
    ({ account }) => account.type === "bank" || account.type === "cash"
  );
  const creditCards = accountStats.filter(
    ({ account }) => account.type === "credit-card"
  );
  const loans = accountStats.filter(
    ({ account }) => account.type === "loan"
  );
  const chits = accountStats.filter(
    ({ account }) => account.type === "chit"
  );
  const savings = accountStats.filter(
    ({ account }) => account.type === "savings"
  );

  const moneySearch = getSectionSearch("money");
  const moneyFilter = getSectionFilter("money");
  const filteredAssets = assets.filter(({ account }) => {
    const matchesSearch = !moneySearch || account.name.toLowerCase().includes(moneySearch);
    const matchesFilter =
      moneyFilter === "all" ||
      (moneyFilter === "bank" && account.type === "bank") ||
      (moneyFilter === "cash" && account.type === "cash");
    return matchesSearch && matchesFilter;
  });

  const cardSearch = getSectionSearch("credit-cards");
  const cardFilter = getSectionFilter("credit-cards");
  const filteredCreditCards = creditCards.filter(({ account, balance }) => {
    const matchesSearch = !cardSearch || account.name.toLowerCase().includes(cardSearch);
    const matchesFilter =
      cardFilter === "all" ||
      (cardFilter === "outstanding" && balance > 0) ||
      (cardFilter === "paid" && balance <= 0);
    return matchesSearch && matchesFilter;
  });

  const loanSearch = getSectionSearch("loans");
  const loanFilter = getSectionFilter("loans");
  const filteredLoans = loans.filter(({ account }) => {
    const matchesSearch = !loanSearch || account.name.toLowerCase().includes(loanSearch);
    const matchesFilter =
      loanFilter === "all" ||
      getLoanCompactCategory(account) === loanFilter;
    return matchesSearch && matchesFilter;
  });

  const filteredPersonalLoans = filteredLoans.filter(
    ({ account }) => getLoanCompactCategory(account) === "personal"
  );
  const filteredCreditCardLoans = filteredLoans.filter(
    ({ account }) => getLoanCompactCategory(account) === "credit-card"
  );
  const filteredHomeLoans = filteredLoans.filter(
    ({ account }) => getLoanCompactCategory(account) === "home"
  );
  const filteredOtherLoans = filteredLoans.filter(
    ({ account }) => getLoanCompactCategory(account) === "other"
  );

  const savingsSearch = getSectionSearch("savings");
  const savingsFilter = getSectionFilter("savings");
  const filteredSavings = savings.filter(({ account }) => {
    const matchesSearch = !savingsSearch || account.name.toLowerCase().includes(savingsSearch);
    const matchesFilter =
      savingsFilter === "all" ||
      (account.savingsCategory || "general") === savingsFilter;
    return matchesSearch && matchesFilter;
  });

  const chitSearch = getSectionSearch("chits");
  const chitFilter = getSectionFilter("chits");
  const filteredChits = chits.filter(({ account, chitContributions }) => {
    const matchesSearch = !chitSearch || account.name.toLowerCase().includes(chitSearch);
    const duration = account.chitDurationMonths || 0;
    const paidMonths = Math.max(account.chitPaidMonths || 0, chitContributions);
    const isCompleted = duration > 0 && paidMonths >= duration;
    const matchesFilter =
      chitFilter === "all" ||
      (chitFilter === "active" && !isCompleted) ||
      (chitFilter === "completed" && isCompleted);
    return matchesSearch && matchesFilter;
  });

  // Loan obligations are split into two concepts:
  // 1. loanMonthlyPaid = what was ACTUALLY paid to loans this month
  // 2. totalLoanObligations = the configured EMI obligation for all loans
  //
  // Chit contributions are savings, not debt, so they are deliberately
  // excluded from both DTI and the loan obligation header.
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, "0")}`;

  const monthlyLoanPaymentTransactions = transactions.filter(
    (transaction) =>
      transaction.type === "transfer" &&
      transaction.toAccount &&
      transaction.date.slice(0, 7) === currentMonthKey &&
      accountStats.some(
        ({ account }) =>
          account.name === transaction.toAccount &&
          account.type === "loan"
      )
  );

  // Actual amount paid to loans this month.
  const monthlyLoanPaid = monthlyLoanPaymentTransactions.reduce(
    (total, transaction) => total + transaction.amount,
    0
  );

  // Expected monthly loan obligation = sum of configured EMIs for all loans.
  // This is intentionally independent of whether the EMI has been paid yet.
  const totalLoanObligations = loans.reduce(
    (total, { account }) => total + (account.emi || 0),
    0
  );

  const activeLoanPaymentCount = new Set(
    monthlyLoanPaymentTransactions.map(
      (transaction) => transaction.toAccount
    )
  ).size;

  // Section summaries for non-loan accounts.
  // Credit-card "paid" means actual payments transferred into the card this month.
  const monthlyCreditCardPaymentTransactions = transactions.filter(
    (transaction) =>
      transaction.type === "transfer" &&
      transaction.toAccount &&
      transaction.date.slice(0, 7) === currentMonthKey &&
      creditCards.some(
        ({ account }) => account.name === transaction.toAccount
      )
  );

  const monthlyCreditCardPaid = monthlyCreditCardPaymentTransactions.reduce(
    (total, transaction) => total + transaction.amount,
    0
  );

  const totalCreditCardOutstanding = creditCards.reduce(
    (total, { balance }) => total + Math.max(0, balance),
    0
  );

  const monthlySavingsPaymentTransactions = transactions.filter(
    (transaction) =>
      transaction.type === "transfer" &&
      transaction.toAccount &&
      transaction.date.slice(0, 7) === currentMonthKey &&
      savings.some(({ account }) => account.name === transaction.toAccount)
  );

  const monthlySavingsPaid = monthlySavingsPaymentTransactions.reduce(
    (total, transaction) => total + transaction.amount,
    0
  );

  const totalSavingsBalance = savings.reduce(
    (total, { balance }) => total + Math.max(0, balance),
    0
  );

  const totalSavingsTarget = savings.reduce(
    (total, { account }) => total + (account.savingsTarget || 0),
    0
  );

  const totalSavingsMonthlyContribution = savings.reduce(
    (total, { account }) => total + (account.savingsMonthlyContribution || 0),
    0
  );

  const monthlyChitPaymentTransactions = transactions.filter(
    (transaction) =>
      transaction.type === "transfer" &&
      transaction.toAccount &&
      transaction.date.slice(0, 7) === currentMonthKey &&
      chits.some(({ account }) => account.name === transaction.toAccount)
  );

  const monthlyChitPaid = monthlyChitPaymentTransactions.reduce(
    (total, transaction) => total + transaction.amount,
    0
  );

  const totalChitMonthlyContribution = chits.reduce(
    (total, { account }) => total + (account.monthlyContribution || 0),
    0
  );

  const monthlyMoneyReceived = transactions
    .filter(
      (transaction) =>
        transaction.type === "income" &&
        transaction.date.slice(0, 7) === currentMonthKey &&
        assets.some(({ account }) => account.name === transaction.account)
    )
    .reduce((total, transaction) => total + transaction.amount, 0);

  const totalMoneyBalance = assets.reduce(
    (total, { balance }) => total + balance,
    0
  );

  const personalLoans = loans.filter(
    ({ account }) => getLoanCompactCategory(account) === "personal"
  );
  const creditCardLoans = loans.filter(
    ({ account }) => getLoanCompactCategory(account) === "credit-card"
  );
  const homeLoans = loans.filter(
    ({ account }) => getLoanCompactCategory(account) === "home"
  );
  const otherLoans = loans.filter(
    ({ account }) => getLoanCompactCategory(account) === "other"
  );

  function getCategoryPaid(loanGroup: typeof loans) {
    const names = new Set(
      loanGroup.map(({ account }) => account.name)
    );

    return monthlyLoanPaymentTransactions
      .filter((transaction) => names.has(transaction.toAccount || ""))
      .reduce((total, transaction) => total + transaction.amount, 0);
  }

  function getCategoryObligation(loanGroup: typeof loans) {
    return loanGroup.reduce(
      (total, { account }) => total + (account.emi || 0),
      0
    );
  }

  const filteredPersonalLoanPaid = getCategoryPaid(filteredPersonalLoans);
  const filteredPersonalLoanObligation = getCategoryObligation(filteredPersonalLoans);
  const filteredCreditCardLoanPaid = getCategoryPaid(filteredCreditCardLoans);
  const filteredCreditCardLoanObligation = getCategoryObligation(filteredCreditCardLoans);
  const filteredHomeLoanPaid = getCategoryPaid(filteredHomeLoans);
  const filteredHomeLoanObligation = getCategoryObligation(filteredHomeLoans);
  const filteredOtherLoanPaid = getCategoryPaid(filteredOtherLoans);
  const filteredOtherLoanObligation = getCategoryObligation(filteredOtherLoans);

  const monthlyIncome = transactions
    .filter(
      (transaction) =>
        transaction.type === "income" &&
        transaction.date.slice(0, 7) === currentMonthKey
    )
    .reduce(
      (total, transaction) => total + transaction.amount,
      0
    );

  // DTI uses actual debt payments made this month. Chit contributions are
  // excluded because they are savings rather than debt obligations.
  const dti =
    monthlyIncome > 0
      ? (monthlyLoanPaid / monthlyIncome) * 100
      : null;

  return (
    <section className="compact-accounts-view">
      <div className="compact-view-header">
        <div>
          <h2>Easy View</h2>
          <p>Tap any row to see the full account details.</p>
        </div>
      </div>

      <div className="compact-obligation-sticky">
        <div className="compact-obligation-card">
          <span>Loans paid / monthly obligation</span>
          <strong>
            {formatCompactMoney(monthlyLoanPaid)} / {formatCompactMoney(
              totalLoanObligations
            )}
          </strong>
          <small>
            {activeLoanPaymentCount === 0
              ? "No loan EMI paid this month"
              : `${activeLoanPaymentCount} loan${activeLoanPaymentCount === 1 ? "" : "s"} paid this month`}
          </small>
        </div>

        <div className="compact-obligation-card">
          <span>DTI</span>
          <strong>{dti === null ? "—" : `${dti.toFixed(1)}%`}</strong>
          <small>
            {monthlyIncome > 0
              ? `Based on ${formatCompactMoney(monthlyIncome)} income this month`
              : "Add income for this month to calculate DTI"}
          </small>
        </div>
      </div>

      {assets.length > 0 && (
        <CompactSection
          title="Money"
          count={filteredAssets.length}
          summary={`Received ${formatCompactMoney(monthlyMoneyReceived)} / Balance ${formatCompactMoney(totalMoneyBalance)}`}
          expanded={expandedSections.has("money")}
          onToggle={() => toggleSection("money")}
          controls={
            <CompactSectionControls
              search={sectionSearch.money || ""}
              onSearchChange={(value) => updateSectionSearch("money", value)}
              filter={moneyFilter}
              onFilterChange={(value) => updateSectionFilter("money", value)}
              filterOptions={[
                ["all", "All"],
                ["bank", "Bank"],
                ["cash", "Cash"],
              ]}
              searchPlaceholder="Search money accounts..."
            />
          }
        >
          {filteredAssets.length === 0 ? (
            <div className="compact-empty">No money accounts match your search/filter.</div>
          ) : filteredAssets.map((stats) => (
            <CompactGenericRow
              key={stats.account.id}
              stats={stats}
              onDelete={onDelete}
              onEdit={onEdit}
            />
          ))}
        </CompactSection>
      )}

      {creditCards.length > 0 && (
        <CompactSection
          title="Credit Cards"
          count={filteredCreditCards.length}
          summary={`Paid ${formatCompactMoney(monthlyCreditCardPaid)} / Outstanding ${formatCompactMoney(totalCreditCardOutstanding)}`}
          expanded={expandedSections.has("credit-cards")}
          onToggle={() => toggleSection("credit-cards")}
          controls={
            <CompactSectionControls
              search={sectionSearch["credit-cards"] || ""}
              onSearchChange={(value) => updateSectionSearch("credit-cards", value)}
              filter={cardFilter}
              onFilterChange={(value) => updateSectionFilter("credit-cards", value)}
              filterOptions={[
                ["all", "All"],
                ["outstanding", "Outstanding"],
                ["paid", "Paid / Zero"],
              ]}
              searchPlaceholder="Search credit cards..."
            />
          }
        >
          {filteredCreditCards.length === 0 ? (
            <div className="compact-empty">No credit cards match your search/filter.</div>
          ) : filteredCreditCards.map((stats) => (
            <CompactGenericRow
              key={stats.account.id}
              stats={stats}
              onDelete={onDelete}
              onEdit={onEdit}
            />
          ))}
        </CompactSection>
      )}

      <CompactSection
        title="Loans"
        count={filteredLoans.length}
        summary={`${formatCompactMoney(monthlyLoanPaid)} / ${formatCompactMoney(
          totalLoanObligations
        )}`}
        expanded={expandedSections.has("loans")}
        onToggle={() => toggleSection("loans")}
        controls={
          <CompactSectionControls
            search={sectionSearch.loans || ""}
            onSearchChange={(value) => updateSectionSearch("loans", value)}
            filter={loanFilter}
            onFilterChange={(value) => updateSectionFilter("loans", value)}
            filterOptions={[
              ["all", "All loans"],
              ["personal", "Personal"],
              ["credit-card", "Credit Card"],
              ["home", "Home"],
              ["other", "Other"],
            ]}
            searchPlaceholder="Search loans..."
          />
        }
      >
        {loans.length === 0 ? (
          <div className="compact-empty">No loans added yet.</div>
        ) : filteredLoans.length === 0 ? (
          <div className="compact-empty">No loans match your search/filter.</div>
        ) : (
          <>
            {filteredPersonalLoans.length > 0 && (
              <CompactLoanSubsection
                title="Personal Loans (PLs)"
                count={filteredPersonalLoans.length}
                paid={filteredPersonalLoanPaid}
                obligation={filteredPersonalLoanObligation}
                sectionKey="personal-loans"
                expandedSections={expandedSections}
                toggleSection={toggleSection}
                loans={filteredPersonalLoans}
                onDelete={onDelete}
                onEdit={onEdit}
              />
            )}

            {filteredCreditCardLoans.length > 0 && (
              <CompactLoanSubsection
                title="Credit Card Loans"
                count={filteredCreditCardLoans.length}
                paid={filteredCreditCardLoanPaid}
                obligation={filteredCreditCardLoanObligation}
                sectionKey="credit-card-loans"
                expandedSections={expandedSections}
                toggleSection={toggleSection}
                loans={filteredCreditCardLoans}
                onDelete={onDelete}
                onEdit={onEdit}
              />
            )}

            {filteredHomeLoans.length > 0 && (
              <CompactLoanSubsection
                title="Home Loans"
                count={filteredHomeLoans.length}
                paid={filteredHomeLoanPaid}
                obligation={filteredHomeLoanObligation}
                sectionKey="home-loans"
                expandedSections={expandedSections}
                toggleSection={toggleSection}
                loans={filteredHomeLoans}
                onDelete={onDelete}
                onEdit={onEdit}
              />
            )}

            {filteredOtherLoans.length > 0 && (
              <CompactLoanSubsection
                title="Other Loans"
                count={filteredOtherLoans.length}
                paid={filteredOtherLoanPaid}
                obligation={filteredOtherLoanObligation}
                sectionKey="other-loans"
                expandedSections={expandedSections}
                toggleSection={toggleSection}
                loans={filteredOtherLoans}
                onDelete={onDelete}
                onEdit={onEdit}
              />
            )}
          </>
        )}
      </CompactSection>

      <CompactSection
        title="Savings"
        count={filteredSavings.length}
        summary={
          totalSavingsTarget > 0
            ? `Saved ${formatCompactMoney(totalSavingsBalance)} / Target ${formatCompactMoney(totalSavingsTarget)}`
            : `Saved ${formatCompactMoney(totalSavingsBalance)} / Monthly ${formatCompactMoney(totalSavingsMonthlyContribution)}`
        }
        expanded={expandedSections.has("savings")}
        onToggle={() => toggleSection("savings")}
        controls={
          <CompactSectionControls
            search={sectionSearch.savings || ""}
            onSearchChange={(value) => updateSectionSearch("savings", value)}
            filter={savingsFilter}
            onFilterChange={(value) => updateSectionFilter("savings", value)}
            filterOptions={[
              ["all", "All savings"],
              ["general", "General"],
              ["fd", "FD"],
              ["rd", "RD"],
              ["ppf", "PPF"],
              ["goal", "Goals"],
              ["other", "Other"],
            ]}
            searchPlaceholder="Search savings..."
          />
        }
      >
        {savings.length === 0 ? (
          <div className="compact-empty">No savings accounts added yet.</div>
        ) : filteredSavings.length === 0 ? (
          <div className="compact-empty">No savings accounts match your search/filter.</div>
        ) : (
          filteredSavings.map((stats) => (
            <CompactSavingsRow
              key={stats.account.id}
              stats={stats}
              onDelete={onDelete}
              onEdit={onEdit}
            />
          ))
        )}
      </CompactSection>

      <CompactSection
        title="Chits"
        count={filteredChits.length}
        summary={`Paid ${formatCompactMoney(monthlyChitPaid)} / Monthly ${formatCompactMoney(totalChitMonthlyContribution)}`}
        expanded={expandedSections.has("chits")}
        onToggle={() => toggleSection("chits")}
        controls={
          <CompactSectionControls
            search={sectionSearch.chits || ""}
            onSearchChange={(value) => updateSectionSearch("chits", value)}
            filter={chitFilter}
            onFilterChange={(value) => updateSectionFilter("chits", value)}
            filterOptions={[
              ["all", "All chits"],
              ["active", "Active"],
              ["completed", "Completed"],
            ]}
            searchPlaceholder="Search chits..."
          />
        }
      >
        {chits.length === 0 ? (
          <div className="compact-empty">No chits added yet.</div>
        ) : filteredChits.length === 0 ? (
          <div className="compact-empty">No chits match your search/filter.</div>
        ) : (
          filteredChits.map((stats) => (
            <CompactChitRow
              key={stats.account.id}
              stats={stats}
              onDelete={onDelete}
              onEdit={onEdit}
            />
          ))
        )}
      </CompactSection>
    </section>
  );
}

function getLoanCompactCategory(
  account: AccountRecord
): LoanCategory {
  // New loans use the explicit category selected in Add Account.
  if (account.loanCategory) {
    return account.loanCategory;
  }

  // Backward compatibility for older loan records created before
  // loanCategory existed. Existing accounts are not changed in the DB.
  const text = `${account.name} ${account.lender || ""}`.toLowerCase();

  if (
    text.includes("credit card") ||
    text.includes("credit-card") ||
    text.includes("cc emi") ||
    text.includes("cc loan") ||
    /\bcc\b/.test(text)
  ) {
    return "credit-card";
  }

  if (
    text.includes("personal") ||
    /\bpl\b/.test(text)
  ) {
    return "personal";
  }

  if (
    text.includes("home") ||
    text.includes("housing") ||
    text.includes("mortgage")
  ) {
    return "home";
  }

  return "other";
}

function CompactLoanSubsection({
  title,
  count,
  paid,
  obligation,
  sectionKey,
  expandedSections,
  toggleSection,
  loans,
  onDelete,
  onEdit,
}: {
  title: string;
  count: number;
  paid: number;
  obligation: number;
  sectionKey: string;
  expandedSections: Set<string>;
  toggleSection: (section: string) => void;
  loans: Array<{
    account: AccountRecord;
    balance: number;
    principalPaid: number;
    interestPaid: number;
    loanPaymentCount: number;
    transactionCount: number;
  }>;
  onDelete: (account: AccountRecord) => void;
  onEdit: (account: AccountRecord) => void;
}) {
  return (
    <CompactSection
      title={title}
      count={count}
      summary={`${formatCompactMoney(paid)} / ${formatCompactMoney(obligation)}`}
      expanded={expandedSections.has(sectionKey)}
      onToggle={() => toggleSection(sectionKey)}
    >
      {loans.map((stats) => (
        <CompactLoanRow
          key={stats.account.id}
          stats={stats}
          onDelete={onDelete}
          onEdit={onEdit}
        />
      ))}
    </CompactSection>
  );
}

function CompactGenericRow({
  stats,
  onDelete,
  onEdit,
}: {
  stats: {
    account: AccountRecord;
    income: number;
    expenses: number;
    transfersIn: number;
    transfersOut: number;
    transactionCount: number;
    balance: number;
  };
  onDelete: (account: AccountRecord) => void;
  onEdit: (account: AccountRecord) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { account, balance, income, expenses, transfersIn, transfersOut, transactionCount } = stats;
  const isCard = account.type === "credit-card";
  const label = isCard ? "Outstanding" : "Balance";

  return (
    <div className={`compact-expandable-row ${expanded ? "expanded" : ""}`}>
      <div
        className="compact-row-main"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setExpanded((value) => !value);
          }
        }}
        aria-expanded={expanded}
      >
        <div className="compact-row-summary">
          <div>
            <strong>{account.name}</strong>
            <span>{label}</span>
          </div>
          <strong>{formatCompactMoney(Math.max(0, balance))}</strong>
        </div>

        {expanded && (
          <div className="compact-expanded-details">
            <CompactDetail label="Balance" value={formatCompactMoney(Math.max(0, balance))} />
            <CompactDetail label="Income" value={formatCompactMoney(income)} />
            <CompactDetail label="Expenses" value={formatCompactMoney(expenses)} />
            <CompactDetail label="Transfers in" value={formatCompactMoney(transfersIn)} />
            <CompactDetail label="Transfers out" value={formatCompactMoney(transfersOut)} />
            <CompactDetail label="Transactions" value={String(transactionCount)} />
          </div>
        )}
      </div>

      <div className="compact-row-actions">
        <button
          type="button"
          className="compact-edit"
          onClick={(event) => {
            event.stopPropagation();
            onEdit(account);
          }}
          aria-label={`Edit ${account.name}`}
        >
          ✏️
        </button>
        <button
          type="button"
          className="compact-delete"
          onClick={(event) => {
            event.stopPropagation();
            onDelete(account);
          }}
          aria-label={`Delete ${account.name}`}
        >
          🗑️
        </button>
      </div>
    </div>
  );
}

function CompactLoanRow({
  stats,
  onDelete,
  onEdit,
}: {
  stats: {
    account: AccountRecord;
    balance: number;
    principalPaid: number;
    interestPaid: number;
    loanPaymentCount: number;
    transactionCount: number;
  };
  onDelete: (account: AccountRecord) => void;
  onEdit: (account: AccountRecord) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { account, balance, principalPaid, interestPaid, loanPaymentCount, transactionCount } = stats;
  const original = account.originalPrincipal || 0;
  const paidPrincipal = Math.max(0, original - Math.max(0, balance));
  const paidPercent = original > 0
    ? Math.min(100, Math.max(0, (paidPrincipal / original) * 100))
    : 0;
  const remainingTenure = Math.max(
    0,
    (account.remainingTenure || 0) - loanPaymentCount
  );

  return (
    <div className={`compact-expandable-row compact-loan-row ${expanded ? "expanded" : ""}`}>
      <div
        className="compact-row-main"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setExpanded((value) => !value);
          }
        }}
        aria-expanded={expanded}
      >
        <div className="compact-loan-summary">
          <div className="compact-row-title-wrap">
            <strong>{account.name}</strong>
          </div>

          <div className="compact-progress-track">
            <div
              className={`compact-progress-fill ${getCompactProgressClass(paidPercent)}`}
              style={{ width: `${paidPercent}%` }}
            />
            <span
              className={`compact-progress-label ${paidPercent >= 50 ? "on-fill" : ""}`}
            >
              {Math.round(paidPercent)}%
            </span>
          </div>

          <div className="compact-loan-closed-stats">
            <div>
              <span>EMI / month</span>
              <strong>{formatCompactMoney(account.emi || 0)}</strong>
            </div>
            <div>
              <span>Remaining tenure</span>
              <strong>{remainingTenure} months</strong>
            </div>
          </div>
        </div>

        {expanded && (
          <div className="compact-expanded-details compact-loan-details">
            <CompactDetail label="Outstanding" value={formatCompactMoney(Math.max(0, balance))} />
            <CompactDetail label="Original principal" value={formatCompactMoney(original)} />
            <CompactDetail label="EMI / month" value={formatCompactMoney(account.emi || 0)} />
            <CompactDetail label="Interest rate" value={account.interestRate ? `${account.interestRate}%` : "—"} />
            <CompactDetail label="Remaining tenure" value={`${remainingTenure} months`} />
            <CompactDetail label="EMIs tracked" value={String(loanPaymentCount)} />
            <CompactDetail label="Principal paid" value={formatCompactMoney(principalPaid)} />
            <CompactDetail label="Interest paid" value={formatCompactMoney(interestPaid)} />
            <CompactDetail label="Transactions" value={String(transactionCount)} />
            <CompactDetail label="Lender" value={account.lender || "—"} />
            <CompactDetail label="Loan start" value={account.loanStartDate ? formatDate(account.loanStartDate) : "—"} />
          </div>
        )}
      </div>

      <div className="compact-row-actions">
        <button
          type="button"
          className="compact-edit"
          onClick={(event) => {
            event.stopPropagation();
            onEdit(account);
          }}
          aria-label={`Edit ${account.name}`}
        >
          ✏️
        </button>
        <button
          type="button"
          className="compact-delete"
          onClick={(event) => {
            event.stopPropagation();
            onDelete(account);
          }}
          aria-label={`Delete ${account.name}`}
        >
          🗑️
        </button>
      </div>
    </div>
  );
}

function CompactSavingsRow({
  stats,
  onDelete,
  onEdit,
}: {
  stats: {
    account: AccountRecord;
    balance: number;
    transfersIn: number;
    transfersOut: number;
    transactionCount: number;
  };
  onDelete: (account: AccountRecord) => void;
  onEdit: (account: AccountRecord) => void;
}) {
  const target = stats.account.savingsTarget || 0;
  const progress = target > 0
    ? Math.min(100, Math.max(0, (stats.balance / target) * 100))
    : 0;
  const categoryLabel = {
    general: "General Savings",
    fd: "Fixed Deposit",
    rd: "Recurring Deposit",
    ppf: "PPF",
    goal: "Goal",
    other: "Other",
  }[stats.account.savingsCategory || "general"];

  return (
    <div className="compact-expandable-row compact-savings-row">
      <div className="compact-row-main">
        <div className="compact-row-title-wrap">
          <strong>{stats.account.name}</strong>
          <span>{categoryLabel}</span>
        </div>

        {target > 0 ? (
          <div className="compact-progress-track">
            <div
              className={`compact-progress-fill ${getCompactProgressClass(progress)}`}
              style={{ width: `${progress}%` }}
            />
            <span className={`compact-progress-label ${progress >= 20 ? "on-fill" : ""}`}>
              {Math.round(progress)}%
            </span>
          </div>
        ) : (
          <div className="compact-savings-no-target">No target set</div>
        )}

        <div className="compact-loan-closed-stats compact-savings-closed-stats">
          <div>
            <span>Saved</span>
            <strong>₹{formatCurrency(stats.balance)}</strong>
          </div>
          <div>
            <span>Monthly</span>
            <strong>₹{formatCurrency(stats.account.savingsMonthlyContribution || 0)}</strong>
          </div>
          <div>
            <span>Target</span>
            <strong>{target > 0 ? `₹${formatCurrency(target)}` : "—"}</strong>
          </div>
        </div>
      </div>

      <div className="compact-row-actions">
        <button
          type="button"
          className="compact-edit"
          onClick={(event) => {
            event.stopPropagation();
            onEdit(stats.account);
          }}
          aria-label={`Edit ${stats.account.name}`}
          title="Edit account"
        >
          ✏️
        </button>
        <button
          type="button"
          className="compact-delete"
          onClick={(event) => {
            event.stopPropagation();
            onDelete(stats.account);
          }}
          aria-label={`Delete ${stats.account.name}`}
          title="Delete account"
        >
          🗑️
        </button>
      </div>
    </div>
  );
}

function CompactChitRow({
  stats,
  onDelete,
  onEdit,
}: {
  stats: {
    account: AccountRecord;
    balance: number;
    chitContributions: number;
    transactionCount: number;
  };
  onDelete: (account: AccountRecord) => void;
  onEdit: (account: AccountRecord) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { account, balance, chitContributions, transactionCount } = stats;
  const chitValue = account.chitValue || 0;
  const monthly = account.monthlyContribution || 0;
  const duration = account.chitDurationMonths || 0;
  const paidMonths = Math.max(account.chitPaidMonths || 0, chitContributions);
  const remainingMonths = Math.max(0, duration - paidMonths);
  const contributed = Math.max(0, balance);
  const progress = chitValue > 0
    ? Math.min(100, (contributed / chitValue) * 100)
    : 0;

  return (
    <div className={`compact-expandable-row compact-chit-row ${expanded ? "expanded" : ""}`}>
      <div
        className="compact-row-main"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setExpanded((value) => !value);
          }
        }}
        aria-expanded={expanded}
      >
        <div className="compact-chit-summary">
          <div className="compact-row-title-wrap">
            <strong>{account.name}</strong>
            <span>{formatCompactMoney(chitValue)}</span>
          </div>

          <div className="compact-progress-track">
            <div
              className={`compact-progress-fill compact-chit-progress-fill ${getCompactProgressClass(progress)}`}
              style={{ width: `${progress}%` }}
            />
            <span
              className={`compact-progress-label ${progress >= 50 ? "on-fill" : ""}`}
            >
              {Math.round(progress)}%
            </span>
          </div>

          <div className="compact-chit-closed-stats">
            <div>
              <span>Monthly</span>
              <strong>{formatCompactMoney(monthly)}</strong>
            </div>
            <div>
              <span>Remaining</span>
              <strong>{remainingMonths} months</strong>
            </div>
          </div>
        </div>

        {expanded && (
          <div className="compact-expanded-details compact-chit-details">
            <CompactDetail label="Chit value" value={formatCompactMoney(chitValue)} />
            <CompactDetail label="Contributed" value={formatCompactMoney(contributed)} />
            <CompactDetail label="Monthly contribution" value={formatCompactMoney(monthly)} />
            <CompactDetail label="Duration" value={`${duration} months`} />
            <CompactDetail label="Paid months" value={String(paidMonths)} />
            <CompactDetail label="Remaining" value={`${remainingMonths} months`} />
            <CompactDetail label="Expected payout" value={formatCompactMoney(account.expectedPayout || 0)} />
            <CompactDetail label="Start date" value={account.chitStartDate ? formatDate(account.chitStartDate) : "—"} />
            <CompactDetail label="Maturity date" value={account.chitMaturityDate ? formatDate(account.chitMaturityDate) : "—"} />
            <CompactDetail label="Transactions" value={String(transactionCount)} />
          </div>
        )}
      </div>

      <div className="compact-row-actions">
        <button
          type="button"
          className="compact-edit"
          onClick={(event) => {
            event.stopPropagation();
            onEdit(account);
          }}
          aria-label={`Edit ${account.name}`}
        >
          ✏️
        </button>
        <button
          type="button"
          className="compact-delete"
          onClick={(event) => {
            event.stopPropagation();
            onDelete(account);
          }}
          aria-label={`Delete ${account.name}`}
        >
          🗑️
        </button>
      </div>
    </div>
  );
}

function CompactDetail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="compact-detail">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CompactSection({
  title,
  count,
  summary,
  expanded,
  onToggle,
  controls,
  children,
}: {
  title: string;
  count: number;
  summary?: string;
  expanded: boolean;
  onToggle: () => void;
  controls?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={`compact-section ${expanded ? "expanded" : "collapsed"}`}>
      <button
        type="button"
        className="compact-section-title"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <h3>{title}</h3>
        <div className="compact-section-meta">
          {summary && <strong>{summary}</strong>}
          <span>{count}</span>
        </div>
      </button>

      {expanded && (
        <>
          {controls}
          <div className="compact-section-body">{children}</div>
        </>
      )}
    </section>
  );
}

function CompactSectionControls({
  search,
  onSearchChange,
  filter,
  onFilterChange,
  filterOptions,
  searchPlaceholder,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  filter: string;
  onFilterChange: (value: string) => void;
  filterOptions: Array<[string, string]>;
  searchPlaceholder: string;
}) {
  return (
    <div className="compact-section-controls" onClick={(event) => event.stopPropagation()}>
      <div className="compact-search-wrap">
        <span className="compact-search-icon">⌕</span>
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
        />
        {search && (
          <button
            type="button"
            className="compact-search-clear"
            onClick={() => onSearchChange("")}
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      <select
        value={filter}
        onChange={(event) => onFilterChange(event.target.value)}
        aria-label="Filter accounts"
      >
        {filterOptions.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}

function CompactRow({
  title,
  right,
  detail,
  onDelete,
}: {
  title: string;
  right: string;
  detail: string;
  onDelete: () => void;
}) {
  return (
    <div className="compact-row">
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      <strong>{right}</strong>
      <button
        type="button"
        className="compact-delete"
        onClick={onDelete}
        aria-label={`Delete ${title}`}
      >
        🗑️
      </button>
    </div>
  );
}

function formatCompactMoney(amount: number) {
  return `₹${formatCurrency(Math.abs(amount))}`;
}

// ======================================================
// SECTION TITLE
// ======================================================

function AccountSectionTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="account-section-title">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}

// ======================================================
// ACCOUNT CARD
// ======================================================

function AccountCard({
  account,
  income,
  expenses,
  transfersIn,
  transfersOut,
  transactionCount,
  balance,
  transactions,
  expanded,
  onToggle,
  onDelete,
}: {
  account: AccountRecord;
  income: number;
  expenses: number;
  transfersIn: number;
  transfersOut: number;
  transactionCount: number;
  balance: number;
  transactions: TransactionRecord[];
  expanded: boolean;
  onToggle: () => void;
  onDelete: (
    account: AccountRecord
  ) => void;
  onEdit: (account: AccountRecord) => void;
}) {
  return (
    <article className="account-card">
      <div className="account-card-top">
        <div className="account-icon">
          {getAccountIcon(
            account.type
          )}
        </div>

        <div className="account-card-actions">
          <button
            type="button"
            className="account-edit"
            onClick={() => onEdit(account)}
            aria-label={`Edit ${account.name}`}
          >
            ✏️
          </button>
          <button
            className="account-delete"
            onClick={() =>
              onDelete(account)
            }
          >
            🗑️
          </button>
        </div>
      </div>

      <div className="account-name">
        <strong>
          {account.name}
        </strong>

        <span>
          {getAccountTypeLabel(
            account.type
          )}
        </span>
      </div>

      <div className="account-balance">
        <span>
          {account.type === "credit-card"
            ? balance < 0
              ? "Credit balance"
              : "Outstanding"
            : "Balance"}
        </span>

        <strong
          className={
            account.type === "credit-card" &&
            balance < 0
              ? "income"
              : undefined
          }
        >
          ₹
          {formatCurrency(
            account.type === "credit-card"
              ? Math.max(0, balance)
              : Math.abs(balance)
          )}
        </strong>
      </div>

      {account.type === "credit-card" &&
        balance < 0 && (
          <div className="account-credit-balance-note">
            You have ₹{formatCurrency(Math.abs(balance))} credit available on this card.
          </div>
        )}

      <div className="account-stat-row">
        <div>
          <span>Income</span>

          <strong className="income">
            +₹
            {formatCurrency(income)}
          </strong>
        </div>

        <div>
          <span>Expenses</span>

          <strong>
            ₹
            {formatCurrency(expenses)}
          </strong>
        </div>

        <div>
          <span>Transfers</span>

          <strong>
            {transfersIn +
              transfersOut}
          </strong>
        </div>
      </div>

      <button
        className="account-expand-button"
        onClick={onToggle}
        type="button"
      >
        <span>
          {expanded ? "Hide transactions" : "View transactions"}
        </span>
        <span className="account-expand-chevron">
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <AccountTransactionHistory
          account={account}
          transactions={transactions}
        />
      )}
    </article>
  );
}

// ======================================================
// LOAN CARD
// ======================================================

function LoanCard({
  account,
  income,
  expenses,
  transfersIn,
  transfersOut,
  transactionCount,
  balance,
  principalPaid,
  interestPaid,
  loanPaymentCount,
  transactions,
  expanded,
  onToggle,
  onDelete,
}: {
  account: AccountRecord;
  income: number;
  expenses: number;
  transfersIn: number;
  transfersOut: number;
  transactionCount: number;
  balance: number;
  principalPaid: number;
  interestPaid: number;
  loanPaymentCount: number;
  transactions: TransactionRecord[];
  expanded: boolean;
  onToggle: () => void;
  onDelete: (
    account: AccountRecord
  ) => void;
  onEdit: (account: AccountRecord) => void;
}) {
  const original =
    account.originalPrincipal || 0;

  const paidAmount =
    Math.max(
      0,
      original - Math.max(balance, 0)
    );

  const progress =
    original > 0
      ? Math.min(
          100,
          (paidAmount / original) *
            100
        )
      : 0;

  const emi = account.emi || 0;
  const completedEmis =
    loanPaymentCount;

  const remainingTenure =
    Math.max(
      0,
      (account.remainingTenure || 0) -
        completedEmis
    );

  return (
    <article className="account-card loan-card">
      <div className="account-card-top">
        <div className="account-icon loan-icon">
          🏦
        </div>

        <div className="account-card-actions">
          <button
            type="button"
            className="account-edit"
            onClick={() => onEdit(account)}
            aria-label={`Edit ${account.name}`}
          >
            ✏️
          </button>
          <button
            className="account-delete"
            onClick={() =>
              onDelete(account)
            }
          >
            🗑️
          </button>
        </div>
      </div>

      <div className="account-name">
        <strong>
          {account.name}
        </strong>

        <span>
          {account.lender || "Loan"}
        </span>
      </div>

      <div className="account-balance">
        <span>
          Outstanding
        </span>

        <strong className="negative-text">
          ₹
          {formatCurrency(
            Math.max(balance, 0)
          )}
        </strong>
      </div>

      <div className="loan-progress">
        <div className="loan-progress-header">
          <span>
            Principal paid
          </span>

          <strong>
            {Math.round(progress)}%
          </strong>
        </div>

        <div className="progress-track">
          <div
            className="progress-fill"
            style={{
              width: `${progress}%`,
            }}
          />
        </div>
      </div>

      <div className="loan-details-grid">
        <div>
          <span>Original</span>

          <strong>
            ₹
            {formatCurrency(
              original
            )}
          </strong>
        </div>

        <div>
          <span>EMI</span>

          <strong>
            ₹
            {formatCurrency(
              account.emi || 0
            )}
          </strong>
        </div>

        <div>
          <span>Rate</span>

          <strong>
            {account.interestRate
              ? `${account.interestRate}%`
              : "—"}
          </strong>
        </div>

        <div>
          <span>Remaining</span>

          <strong>
            {account.remainingTenure !== undefined
              ? `${remainingTenure} mo`
              : "—"}
          </strong>
        </div>
      </div>

      <div className="account-stat-row">
        <div>
          <span>EMI paid</span>

          <strong className="income">
            ₹
            {formatCurrency(
              transfersIn
            )}
          </strong>
        </div>

        <div>
          <span>Principal paid</span>

          <strong>
            ₹
            {formatCurrency(
              principalPaid
            )}
          </strong>
        </div>

        <div>
          <span>Interest paid</span>

          <strong>
            ₹
            {formatCurrency(
              interestPaid
            )}
          </strong>
        </div>
      </div>

      <div className="account-transaction-count">
        {expenses > 0 || income > 0
          ? "Includes other account activity"
          : "Transfer-driven loan tracking"}
      </div>

      <button
        className="account-expand-button"
        onClick={onToggle}
        type="button"
      >
        <span>
          {expanded ? "Hide transactions" : "View payment history"}
        </span>
        <span className="account-expand-chevron">
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <AccountTransactionHistory
          account={account}
          transactions={transactions}
        />
      )}
    </article>
  );
}

// ======================================================
// CHIT CARD
// ======================================================

function ChitCard({
  account,
  transactionCount,
  transfersIn,
  transfersOut,
  chitContributions,
  transactions,
  expanded,
  onToggle,
  onDelete,
}: {
  account: AccountRecord;
  transactionCount: number;
  transfersIn: number;
  transfersOut: number;
  chitContributions: number;
  transactions: TransactionRecord[];
  expanded: boolean;
  onToggle: () => void;
  onDelete: (
    account: AccountRecord
  ) => void;
  onEdit: (account: AccountRecord) => void;
}) {
  const baselinePaidMonths =
    account.chitPaidMonths || 0;

  const duration =
    account.chitDurationMonths || 0;

  const monthly =
    account.monthlyContribution || 0;

  const contributed =
    (account.openingBalance || 0) +
    transfersIn -
    transfersOut;

  const totalValue =
    account.chitValue || 0;

  const expectedPayout =
    account.expectedPayout || 0;

  const paidMonths =
    baselinePaidMonths +
    chitContributions;

  const progress =
    duration > 0
      ? Math.min(
          100,
          (paidMonths / duration) *
            100
        )
      : 0;

  return (
    <article className="account-card chit-card">
      <div className="account-card-top">
        <div className="account-icon chit-icon">
          🪙
        </div>

        <div className="account-card-actions">
          <button
            type="button"
            className="account-edit"
            onClick={() => onEdit(account)}
            aria-label={`Edit ${account.name}`}
          >
            ✏️
          </button>
          <button
            className="account-delete"
            onClick={() =>
              onDelete(account)
            }
          >
            🗑️
          </button>
        </div>
      </div>

      <div className="account-name">
        <strong>
          {account.name}
        </strong>

        <span>
          Chit · ₹
          {formatCurrency(
            totalValue
          )}
        </span>
      </div>

      <div className="account-balance">
        <span>
          Contributed
        </span>

        <strong className="income">
          ₹
          {formatCurrency(
            contributed
          )}
        </strong>
      </div>

      <div className="chit-progress">
        <div className="chit-progress-top">
          <span>
            {paidMonths} / {duration} months
          </span>

          <strong>
            {Math.round(progress)}%
          </strong>
        </div>

        <div className="progress-track">
          <div
            className="progress-fill chit-fill"
            style={{
              width: `${progress}%`,
            }}
          />
        </div>
      </div>

      <div className="loan-details-grid">
        <div>
          <span>Monthly</span>

          <strong>
            ₹
            {formatCurrency(
              monthly
            )}
          </strong>
        </div>

        <div>
          <span>Expected payout</span>

          <strong>
            ₹
            {formatCurrency(
              expectedPayout
            )}
          </strong>
        </div>

        <div>
          <span>Remaining</span>

          <strong>
            {Math.max(
              0,
              duration - paidMonths
            )}{" "}
            mo
          </strong>
        </div>

        <div>
          <span>Contributions</span>

          <strong>
            {chitContributions}
          </strong>
        </div>
      </div>

      {account.chitMaturityDate && (
        <div className="account-opening">
          Maturity:{" "}
          {formatDate(
            account.chitMaturityDate
          )}
        </div>
      )}

      <div className="account-transaction-count">
        {transactionCount} transaction
        {transactionCount === 1
          ? ""
          : "s"}
      </div>

      <button
        className="account-expand-button"
        onClick={onToggle}
        type="button"
      >
        <span>
          {expanded ? "Hide transactions" : "View contribution history"}
        </span>
        <span className="account-expand-chevron">
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <AccountTransactionHistory
          account={account}
          transactions={transactions}
        />
      )}
    </article>
  );
}

// ======================================================
// ACCOUNT TRANSACTION HISTORY
// ======================================================

function AccountTransactionHistory({
  account,
  transactions,
}: {
  account: AccountRecord;
  transactions: TransactionRecord[];
}) {
  const accountTransactions = transactions
    .filter(
      (transaction) =>
        transaction.account === account.name ||
        transaction.toAccount === account.name
    )
    .sort((a, b) => {
      const dateCompare =
        b.date.localeCompare(a.date);

      if (dateCompare !== 0) {
        return dateCompare;
      }

      return b.id.localeCompare(a.id);
    });

  if (accountTransactions.length === 0) {
    return (
      <div className="account-history-empty">
        No transactions for this account yet.
      </div>
    );
  }

  return (
    <div className="account-history">
      <div className="account-history-header">
        <span>Transaction history</span>
        <strong>
          {accountTransactions.length}
        </strong>
      </div>

      <div className="account-history-list">
        {accountTransactions.map((transaction) => {
          const isTransfer =
            transaction.type === "transfer";
          const isIncome =
            transaction.type === "income";
          const isIncoming =
            transaction.toAccount === account.name;
          const isOutgoing =
            transaction.account === account.name;

          let amountClass = "account-history-neutral";
          let prefix = "";

          if (isTransfer) {
            if (isIncoming) {
              amountClass = "income";
              prefix = "+";
            } else if (isOutgoing) {
              amountClass = "expense";
              prefix = "−";
            }
          } else if (isIncome) {
            amountClass = "income";
            prefix = "+";
          } else {
            amountClass = "expense";
            prefix = "−";
          }

          const title =
            transaction.description ||
            transaction.category ||
            (isTransfer ? "Transfer" : "Transaction");

          let subtitle = transaction.category;

          if (isTransfer) {
            subtitle = `${transaction.account} → ${
              transaction.toAccount || "Unknown"
            }`;
          }

          return (
            <div
              className="account-history-item"
              key={transaction.id}
            >
              <div className="account-history-icon">
                {isTransfer
                  ? "↔"
                  : isIncome
                    ? "💰"
                    : "💸"}
              </div>

              <div className="account-history-details">
                <strong>{title}</strong>
                <span>{subtitle}</span>
                <small>
                  {formatDate(transaction.date)}
                </small>
              </div>

              <strong
                className={`account-history-amount ${amountClass}`}
              >
                {prefix}
                ₹
                {formatCurrency(
                  transaction.amount
                )}
              </strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ======================================================

function getAccountIcon(
  type: AccountType
) {
  if (type === "bank") {
    return "🏦";
  }

  if (type === "cash") {
    return "💵";
  }

  if (type === "credit-card") {
    return "💳";
  }

  if (type === "loan") {
    return "🏦";
  }

  return "🪙";
}

function getAccountTypeLabel(
  type: AccountType
) {
  if (type === "bank") {
    return "Bank Account";
  }

  if (type === "cash") {
    return "Cash";
  }

  if (type === "credit-card") {
    return "Credit Card";
  }

  if (type === "loan") {
    return "Loan";
  }

  return "Chit";
}

function formatCurrency(
  amount: number
) {
  return new Intl.NumberFormat(
    "en-IN",
    {
      maximumFractionDigits: 0,
    }
  ).format(Math.round(amount));
}

function formatDate(
  date: string
) {
  return new Date(
    `${date}T00:00:00`
  ).toLocaleDateString(
    "en-IN",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    }
  );
}

export default Accounts;