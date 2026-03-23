import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Thresholds = {
  products: number;
  sales: number;
  quotes: number;
  payments: number;
};

function readThresholdsFromEnv(): Thresholds {
  return {
    products: Number(process.env.PHASE0_MIN_PRODUCTS || 1000),
    sales: Number(process.env.PHASE0_MIN_SALES || 300),
    quotes: Number(process.env.PHASE0_MIN_QUOTES || 300),
    payments: Number(process.env.PHASE0_MIN_PAYMENTS || 500),
  };
}

async function main() {
  const accountId = String(process.env.PHASE0_ACCOUNT_ID || "").trim() || undefined;
  const thresholds = readThresholdsFromEnv();

  const whereWithAccount = <T extends Record<string, unknown>>(base: T): T => {
    if (!accountId) return base;
    return { ...base, accountId } as T;
  };

  const [
    productsTotal,
    productsActive,
    customersTotal,
    customersActive,
    categoriesTotal,
    categoriesActive,
    suppliersTotal,
    suppliersActive,
    salesTotal,
    quotesTotal,
    purchasesTotal,
    paymentsTotal,
    returnsTotal,
    operatingExpensesTotal,
  ] = await Promise.all([
    prisma.product.count({ where: whereWithAccount({}) }),
    prisma.product.count({ where: whereWithAccount({ isActive: true }) }),
    prisma.customer.count({ where: whereWithAccount({}) }),
    prisma.customer.count({ where: whereWithAccount({ isActive: true }) }),
    prisma.category.count({ where: whereWithAccount({}) }),
    prisma.category.count({ where: whereWithAccount({ isActive: true }) }),
    prisma.supplier.count({ where: whereWithAccount({}) }),
    prisma.supplier.count({ where: whereWithAccount({ isActive: true }) }),
    prisma.sale.count({ where: whereWithAccount({}) }),
    prisma.quote.count({ where: whereWithAccount({}) }),
    prisma.purchase.count({ where: whereWithAccount({}) }),
    prisma.payment.count({
      where: accountId
        ? {
            ar: {
              sale: { accountId },
            },
          }
        : {},
    }),
    prisma.return.count({ where: whereWithAccount({}) }),
    prisma.operatingExpense.count({ where: whereWithAccount({}) }),
  ]);

  const snapshot = {
    capturedAt: new Date().toISOString(),
    accountScope: accountId || "ALL",
    entities: {
      products: { total: productsTotal, active: productsActive },
      customers: { total: customersTotal, active: customersActive },
      categories: { total: categoriesTotal, active: categoriesActive },
      suppliers: { total: suppliersTotal, active: suppliersActive },
      sales: { total: salesTotal },
      quotes: { total: quotesTotal },
      purchases: { total: purchasesTotal },
      payments: { total: paymentsTotal },
      returns: { total: returnsTotal },
      operatingExpenses: { total: operatingExpensesTotal },
    },
    largeDatasetCheck: {
      products: { value: productsTotal, min: thresholds.products, ok: productsTotal >= thresholds.products },
      sales: { value: salesTotal, min: thresholds.sales, ok: salesTotal >= thresholds.sales },
      quotes: { value: quotesTotal, min: thresholds.quotes, ok: quotesTotal >= thresholds.quotes },
      payments: { value: paymentsTotal, min: thresholds.payments, ok: paymentsTotal >= thresholds.payments },
    },
  };

  console.log(JSON.stringify(snapshot, null, 2));
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("[phase0-baseline] error:", error);
    await prisma.$disconnect();
    process.exit(1);
  });

