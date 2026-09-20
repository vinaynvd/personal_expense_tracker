import type { TransactionRecord } from "../db";

type TransactionItemProps = {
  transaction: TransactionRecord;
  onEdit: (
    transaction: TransactionRecord
  ) => void;
  onDelete: (
    transaction: TransactionRecord
  ) => void;
};

function TransactionItem({
  transaction,
  onEdit,
  onDelete,
}: TransactionItemProps) {
  const isIncome =
    transaction.type ===
    "income";

  const isTransfer =
    transaction.type ===
    "transfer";

  let icon = "💸";

  if (isIncome) {
    icon = "💰";
  }

  if (isTransfer) {
    icon = "↔";
  }

  let amountClass =
    "expense";

  if (isIncome) {
    amountClass = "income";
  }

  if (isTransfer) {
    amountClass =
      "transfer-amount";
  }

  let amountPrefix = "−";

  if (isIncome) {
    amountPrefix = "+";
  }

  if (isTransfer) {
    amountPrefix = "↔";
  }

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
          "Unknown account"
        }`
      : `${capitalize(
          transaction.type
        )} · ${
          transaction.account
        }`;

  return (
    <div
      className={`transaction ${
        isTransfer
          ? "transfer-transaction"
          : ""
      }`}
    >
      {/* Icon */}

      <div className="transaction-icon">
        {icon}
      </div>

      {/* Details */}

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

      {/* Amount */}

      <strong
        className={`transaction-amount ${amountClass}`}
      >
        {amountPrefix}
        {isTransfer
          ? " "
          : "₹"}
        {formatCurrency(
          transaction.amount
        )}
      </strong>

      {/* Actions */}

      {!isTransfer && (
        <div className="transaction-actions">
          <button
            onClick={() =>
              onEdit(
                transaction
              )
            }
          >
            Edit
          </button>

          <button
            className="delete-button"
            onClick={() =>
              onDelete(
                transaction
              )
            }
          >
            Delete
          </button>
        </div>
      )}

      {isTransfer && (
        <div className="transaction-actions">
          <button
            className="delete-button"
            onClick={() =>
              onDelete(
                transaction
              )
            }
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}


/* ========================================================
   HELPERS
   ======================================================== */

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
  const parsed =
    new Date(
      `${date}T00:00:00`
    );

  return parsed.toLocaleDateString(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  );
}

function capitalize(
  value: string
) {
  return (
    value.charAt(0).toUpperCase() +
    value.slice(1)
  );
}

export default TransactionItem;