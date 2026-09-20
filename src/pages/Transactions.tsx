import { useMemo, useState } from "react";
import type { TransactionRecord } from "../db";
import TransactionItem from "../components/TransactionItem";

type TransactionsProps = {
  transactions: TransactionRecord[];
  onEdit: (transaction: TransactionRecord) => void;
  onDelete: (transaction: TransactionRecord) => void;
};

type FilterType =
  | "all"
  | "expense"
  | "income"
  | "transfer";

function Transactions({
  transactions,
  onEdit,
  onDelete,
}: TransactionsProps) {
  const [search, setSearch] =
    useState("");

  const [filter, setFilter] =
    useState<FilterType>("all");

  const filteredTransactions =
    useMemo(() => {
      const query =
        search.toLowerCase().trim();

      return transactions.filter(
        (transaction) => {
          const matchesFilter =
            filter === "all" ||
            transaction.type ===
              filter;

          const matchesSearch =
            !query ||
            transaction.description
              .toLowerCase()
              .includes(query) ||
            transaction.category
              .toLowerCase()
              .includes(query) ||
            transaction.account
              .toLowerCase()
              .includes(query) ||
            (
              transaction.toAccount ||
              ""
            )
              .toLowerCase()
              .includes(query);

          return (
            matchesFilter &&
            matchesSearch
          );
        }
      );
    }, [
      transactions,
      search,
      filter,
    ]);

  /*
   * Transfers are deliberately excluded
   * from income/expense totals.
   *
   * Moving ₹5,000 from HDFC Bank to a
   * Chit is not ₹5,000 of spending.
   */

  const totalIncome =
    filteredTransactions
      .filter(
        (transaction) =>
          transaction.type ===
          "income"
      )
      .reduce(
        (total, transaction) =>
          total + transaction.amount,
        0
      );

  const totalExpenses =
    filteredTransactions
      .filter(
        (transaction) =>
          transaction.type ===
          "expense"
      )
      .reduce(
        (total, transaction) =>
          total + transaction.amount,
        0
      );

  const net =
    totalIncome - totalExpenses;

  return (
    <main className="transactions-page">
      {/* =========================================
          HEADER
          ========================================= */}

      <div className="page-title">
        <div>
          <h1>
            Transactions
          </h1>

          <p>
            All your money activity
            in one place.
          </p>
        </div>

        <span className="transaction-count">
          {filteredTransactions.length}{" "}
          {filteredTransactions.length ===
          1
            ? "transaction"
            : "transactions"}
        </span>
      </div>

      {/* =========================================
          SUMMARY
          ========================================= */}

      <div className="transactions-summary">
        <div>
          <span>
            Income
          </span>

          <strong className="income">
            +₹
            {formatCurrency(
              totalIncome
            )}
          </strong>
        </div>

        <div>
          <span>
            Expenses
          </span>

          <strong className="expense">
            −₹
            {formatCurrency(
              totalExpenses
            )}
          </strong>
        </div>

        <div>
          <span>
            Net
          </span>

          <strong
            className={
              net < 0
                ? "expense"
                : "income"
            }
          >
            {net < 0
              ? "−"
              : "+"}
            ₹
            {formatCurrency(
              Math.abs(net)
            )}
          </strong>
        </div>
      </div>

      {/* =========================================
          TOOLBAR
          ========================================= */}

      <div className="transactions-toolbar">
        <input
          className="transaction-search"
          type="text"
          placeholder="Search transactions..."
          value={search}
          onChange={(event) =>
            setSearch(
              event.target.value
            )
          }
        />

        <div className="filter-buttons">
          <button
            className={`filter-button ${
              filter === "all"
                ? "active"
                : ""
            }`}
            onClick={() =>
              setFilter("all")
            }
          >
            All
          </button>

          <button
            className={`filter-button ${
              filter ===
              "expense"
                ? "active"
                : ""
            }`}
            onClick={() =>
              setFilter("expense")
            }
          >
            Expenses
          </button>

          <button
            className={`filter-button ${
              filter ===
              "income"
                ? "active"
                : ""
            }`}
            onClick={() =>
              setFilter("income")
            }
          >
            Income
          </button>

          <button
            className={`filter-button ${
              filter ===
              "transfer"
                ? "active"
                : ""
            }`}
            onClick={() =>
              setFilter("transfer")
            }
          >
            Transfers
          </button>
        </div>
      </div>

      {/* =========================================
          TRANSACTION LIST
          ========================================= */}

      <section className="transaction-list">
        {filteredTransactions.length ===
        0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              🔎
            </div>

            <strong>
              No transactions found
            </strong>

            <span>
              Try changing your
              search or filter.
            </span>
          </div>
        ) : (
          filteredTransactions.map(
            (transaction) => (
              <TransactionItem
                key={
                  transaction.id
                }
                transaction={
                  transaction
                }
                onEdit={
                  onEdit
                }
                onDelete={
                  onDelete
                }
              />
            )
          )
        )}
      </section>
    </main>
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

export default Transactions;