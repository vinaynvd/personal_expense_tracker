import Dexie, { type Table } from "dexie";

export type TransactionType = "expense" | "income" | "transfer";

export type AccountType =
  | "bank"
  | "cash"
  | "credit-card"
  | "loan"
  | "chit"
  | "savings";

export type LoanCategory =
  | "personal"
  | "credit-card"
  | "home"
  | "other";

export type SavingsCategory =
  | "general"
  | "fd"
  | "rd"
  | "ppf"
  | "goal"
  | "other";

export interface TransactionRecord {
  id: string;
  amount: number;
  category: string;
  description: string;
  account: string;
  date: string;
  type: TransactionType;
  toAccount?: string;
}

export interface AccountRecord {
  id: string;
  name: string;
  type: AccountType;
  openingBalance: number;

  // Loan details
  lender?: string;
  loanCategory?: LoanCategory;
  originalPrincipal?: number;
  interestRate?: number;
  emi?: number;
  remainingTenure?: number;
  loanStartDate?: string;

  // Chit details
  chitValue?: number;
  monthlyContribution?: number;
  chitDurationMonths?: number;
  chitPaidMonths?: number;
  expectedPayout?: number;
  chitStartDate?: string;
  chitMaturityDate?: string;

  // Savings details
  savingsCategory?: SavingsCategory;
  savingsTarget?: number;
  savingsMonthlyContribution?: number;
  savingsStartDate?: string;
  savingsTargetDate?: string;
}

class MyMoneyDB extends Dexie {
  transactions!: Table<TransactionRecord, string>;
  accounts!: Table<AccountRecord, string>;

  constructor() {
    super("MyMoneyDB");

    this.version(1).stores({
      transactions: "id, date, category, account, type",
    });

    this.version(2).stores({
      transactions: "id, date, category, account, type",
      accounts: "id, name, type",
    });

    this.version(3).stores({
      transactions: "id, date, category, account, type",
      accounts: "id, name, type",
    });

    this.version(4).stores({
      transactions: "id, date, category, account, type",
      accounts: "id, name, type",
    });

    this.version(5).stores({
      transactions: "id, date, category, account, type",
      accounts: "id, name, type",
    });

    // v6 adds loanCategory as an application-level field.
    // It is intentionally not indexed because we only use it for display
    // and grouping; there is no need to change the IndexedDB indexes.
    this.version(6).stores({
      transactions: "id, date, category, account, type",
      accounts: "id, name, type",
    });

    // v7 adds savings account fields at the application level.
    this.version(7).stores({
      transactions: "id, date, category, account, type",
      accounts: "id, name, type",
    });
  }
}

export const db = new MyMoneyDB();

export async function ensureDefaultAccounts() {
  const defaults: AccountRecord[] = [
    {
      id: "account-hdfc-bank",
      name: "HDFC Bank",
      type: "bank",
      openingBalance: 0,
    },
    {
      id: "account-icici-bank",
      name: "ICICI Bank",
      type: "bank",
      openingBalance: 0,
    },
    {
      id: "account-cash",
      name: "Cash",
      type: "cash",
      openingBalance: 0,
    },
    {
      id: "account-hdfc-credit-card",
      name: "HDFC Credit Card",
      type: "credit-card",
      openingBalance: 0,
    },
    {
      id: "account-icici-credit-card",
      name: "ICICI Credit Card",
      type: "credit-card",
      openingBalance: 0,
    },
  ];

  const existingAccounts = await db.accounts.toArray();
  const existingNames = new Set(
    existingAccounts.map((account) => account.name)
  );

  const missingAccounts = defaults.filter(
    (account) => !existingNames.has(account.name)
  );

  if (missingAccounts.length > 0) {
    await db.accounts.bulkAdd(missingAccounts);
  }
}
