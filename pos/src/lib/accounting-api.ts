import { call } from './frappe-sdk';

const API = 'ury.ury_pos.accounting_api';

export type PeriodPreset = 'today' | 'this_week' | 'this_month' | 'this_quarter' | 'this_year' | 'all';

export interface PurchaseInvoiceRow {
  name: string;
  supplier: string;
  supplier_name: string;
  posting_date: string;
  grand_total: number;
  outstanding_amount: number;
  status: string;
  currency: string;
  /** Set when a Purchase Receipt was already created from this invoice */
  purchase_receipt?: string | null;
}

export interface PurchaseReceiptRow {
  name: string;
  supplier: string;
  supplier_name: string;
  posting_date: string;
  grand_total: number;
  status: string;
  currency: string;
}

export interface AccountOption {
  name: string;
  account_name: string;
  account_type?: string;
}

export interface CashBankBalance {
  account: string;
  account_name: string;
  account_type: string;
  balance: number;
}

export interface AccountsOverview {
  period: string;
  from_date: string;
  to_date: string;
  currency: string;
  cash_bank: CashBankBalance[];
  total_income: number;
  total_expense: number;
  net: number;
  error?: string;
}

export interface ProfitAndLoss {
  from_date: string;
  to_date: string;
  currency: string;
  income: Array<Record<string, unknown>>;
  expense: Array<Record<string, unknown>>;
  total_income: number;
  total_expense: number;
  net_profit: number;
  error?: string;
}

export interface ProfitabilityRow {
  item_code: string;
  item_name: string;
  qty: number;
  net_sales: number;
  avg_selling_rate: number;
  cost_per_unit: number;
  total_cost: number;
  margin: number;
  margin_percent: number;
}

const PAGE_SIZE = 20;

export const getPurchaseInvoices = (
  from_date?: string,
  to_date?: string,
  only_unpaid = false,
  page = 0
) =>
  call
    .get(API + '.get_purchase_invoices', {
      from_date,
      to_date,
      only_unpaid,
      limit: PAGE_SIZE,
      limit_start: page * PAGE_SIZE,
    })
    .then((r: { message?: PurchaseInvoiceRow[] }) => r.message ?? []);

export const getPurchaseReceipts = (from_date?: string, to_date?: string, page = 0) =>
  call
    .get(API + '.get_purchase_receipts', {
      from_date,
      to_date,
      limit: PAGE_SIZE,
      limit_start: page * PAGE_SIZE,
    })
    .then((r: { message?: PurchaseReceiptRow[] }) => r.message ?? []);

export const PURCHASE_PAGE_SIZE = PAGE_SIZE;

export const createPaymentForPurchaseInvoice = (params: {
  purchase_invoice_name: string;
  paid_amount?: number;
  mode_of_payment?: string;
  reference_no?: string;
  reference_date?: string;
  bank_account?: string;
}) => call.post(API + '.create_payment_for_purchase_invoice', params).then((r: { message?: { payment_entry: string; message: string } }) => r.message);

export const createPurchaseReceiptFromInvoice = (purchaseInvoiceName: string) =>
  call.post(API + '.create_purchase_receipt_from_invoice', { purchase_invoice_name: purchaseInvoiceName }).then(
    (r: { message?: { purchase_receipt: string; message: string } }) => r.message
  );

export const getExpenseAccounts = (company?: string) =>
  call.get(API + '.get_expense_accounts', { company }).then((r: { message?: AccountOption[] }) => r.message ?? []);

export const getCashBankAccounts = (company?: string) =>
  call.get(API + '.get_cash_bank_accounts', { company }).then((r: { message?: AccountOption[] }) => r.message ?? []);

export interface EmployeeOption {
  name: string;
  employee_name: string;
}

export const getEmployees = (company?: string) =>
  call.get(API + '.get_employees', { company }).then((r: { message?: EmployeeOption[] }) => r.message ?? []);

export const createExpenseEntry = (params: {
  expense_account: string;
  amount: number;
  paid_from_account: string;
  posting_date?: string;
  remark?: string;
  cost_center?: string;
  company?: string;
  employee?: string;
}) => call.post(API + '.create_expense_entry', params).then((r: { message?: { journal_entry: string; message: string } }) => r.message);

export const createTransferBetweenAccounts = (params: {
  from_account: string;
  to_account: string;
  amount: number;
  posting_date?: string;
  remark?: string;
  company?: string;
}) =>
  call
    .post(API + '.create_transfer_between_accounts', params)
    .then((r: { message?: { journal_entry: string; message: string } }) => r.message);

export interface SalaryPaymentsReport {
  payments: Array<{ journal_entry: string; posting_date: string; employee: string; employee_name: string; amount: number; user_remark?: string }>;
  by_employee: Array<{ employee: string; employee_name: string; total: number }>;
  total_amount: number;
  from_date: string;
  to_date: string;
}

export const getSalaryPaymentsReport = (from_date: string, to_date: string, company?: string) =>
  call.get(API + '.get_salary_payments_report', { from_date, to_date, company }).then((r: { message?: SalaryPaymentsReport }) => r.message);

export const EXPENSE_PAGE_SIZE = 20;

export interface ExpenseRow {
  name: string;
  posting_date: string;
  total_debit: number;
  user_remark: string;
}

export interface RecentExpensesResult {
  items: ExpenseRow[];
  /** Set when filtering by expense account (matches all pages). */
  total_count: number | null;
  total_amount: number | null;
}

export const getRecentExpenses = (
  page = 0,
  from_date?: string,
  to_date?: string,
  expense_account?: string
) =>
  call
    .get(API + '.get_recent_expenses', {
      limit: EXPENSE_PAGE_SIZE,
      limit_start: page * EXPENSE_PAGE_SIZE,
      from_date,
      to_date,
      expense_account: expense_account || undefined,
    })
    .then((r: { message?: RecentExpensesResult | ExpenseRow[] }) => {
      const msg = r.message;
      if (Array.isArray(msg)) {
        return { items: msg as ExpenseRow[], total_count: null, total_amount: null } satisfies RecentExpensesResult;
      }
      if (msg && typeof msg === 'object' && 'items' in msg) {
        return msg as RecentExpensesResult;
      }
      return { items: [], total_count: null, total_amount: null };
    });

export const getAccountsOverview = (period: PeriodPreset = 'this_month') =>
  call.get(API + '.get_accounts_overview', { period }).then((r: { message?: AccountsOverview }) => r.message);

export const getProfitAndLoss = (from_date: string, to_date: string, company?: string) =>
  call.get(API + '.get_profit_and_loss', { from_date, to_date, company }).then((r: { message?: ProfitAndLoss }) => r.message);

export const getProfitabilityByItem = (from_date?: string, to_date?: string, limit = 100) =>
  call.get(API + '.get_profitability_by_item', { from_date, to_date, limit }).then((r: { message?: ProfitabilityRow[] }) => r.message ?? []);

/** One row in profit/sales rankings (Items tab). */
export interface ItemProfitSalesRow {
  item_code: string;
  item_name: string;
  qty: number;
  net_sales: number;
  avg_selling_rate: number;
  cost_per_unit: number;
  margin: number;
  margin_percent: number;
}

export interface ItemsProfitAndSalesRankings {
  highest_profit: ItemProfitSalesRow[];
  lowest_profit: ItemProfitSalesRow[];
  highest_qty_sold: ItemProfitSalesRow[];
  lowest_qty_sold: ItemProfitSalesRow[];
}

export const getItemsProfitAndSalesRankings = (
  from_date?: string,
  to_date?: string,
  company?: string,
  branch?: string,
  top_n = 10
) =>
  call
    .get(API + '.get_items_profit_and_sales_rankings', {
      from_date,
      to_date,
      company,
      branch,
      top_n,
    })
    .then((r: { message?: ItemsProfitAndSalesRankings }) => r.message ?? { highest_profit: [], lowest_profit: [], highest_qty_sold: [], lowest_qty_sold: [] });

export const getModesOfPayment = () =>
  call.get(API + '.get_modes_of_payment').then((r: { message?: { name: string }[] }) => r.message ?? []);
