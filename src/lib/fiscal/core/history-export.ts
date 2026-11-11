import { prisma } from "@/lib/db"

/** Una instantánea coherente de los datos fiscales de una sola empresa. */
export async function exportFiscalHistory(accountId: string) {
  return prisma.$transaction(async tx => {
    const [settings, policyChanges, concepts, sequences, allocations, sequenceEvents,
      documents, documentLines, documentEvents, references, revisions, preparations,
      receivedDocuments, receivedOperations, adjustments, adjustmentLines, adjustmentEvents,
      adjustmentOperations, adjustmentApplications, customerCredits, creditApplications,
      foreignOperations, foreignPayments] = await Promise.all([
      tx.fiscalSettings.findUnique({ where: { accountId } }),
      tx.fiscalPolicyChange.findMany({ where: { accountId } }),
      tx.fiscalConcept.findMany({ where: { accountId } }),
      tx.fiscalSequence.findMany({ where: { accountId } }),
      tx.fiscalNumberAllocation.findMany({ where: { accountId } }),
      tx.fiscalSequenceEvent.findMany({ where: { accountId } }),
      tx.fiscalDocument.findMany({ where: { accountId } }),
      tx.fiscalDocumentLine.findMany({ where: { accountId } }),
      tx.fiscalDocumentEvent.findMany({ where: { accountId } }),
      tx.fiscalDocumentReference.findMany({ where: { accountId } }),
      tx.fiscalDocumentRevision.findMany({ where: { accountId } }),
      tx.fiscalPreparationOperation.findMany({ where: { accountId } }),
      tx.fiscalReceivedDocument.findMany({ where: { accountId } }),
      tx.fiscalReceivedOperation.findMany({ where: { accountId } }),
      tx.fiscalAdjustment.findMany({ where: { accountId } }),
      tx.fiscalAdjustmentLine.findMany({ where: { accountId } }),
      tx.fiscalAdjustmentEvent.findMany({ where: { accountId } }),
      tx.fiscalAdjustmentOperation.findMany({ where: { accountId } }),
      tx.fiscalAdjustmentApplication.findMany({ where: { accountId } }),
      tx.fiscalCustomerCredit.findMany({ where: { accountId } }),
      tx.fiscalCustomerCreditApplication.findMany({ where: { accountId } }),
      tx.fiscalForeignOperation.findMany({ where: { accountId } }),
      tx.fiscalForeignPayment.findMany({ where: { accountId } }),
    ])
    const ids = (values: Array<string | null | undefined>) => [...new Set(values.filter((value): value is string => Boolean(value)))]
    const receivedIds = (kind: string) => receivedDocuments.filter(row => row.sourceKind === kind).map(row => row.sourceId)
    const saleIds = ids(documents.map(row => row.saleId))
    const purchaseIds = ids([...documents.map(row => row.purchaseId), ...receivedIds("PURCHASE")])
    const expenseIds = ids([...documents.map(row => row.expenseId), ...receivedIds("EXPENSE")])
    const payableIds = ids([...documents.map(row => row.payableId), ...receivedIds("PAYABLE"), ...foreignOperations.map(row => row.payableId)])
    const returnIds = ids(documents.map(row => row.returnId))
    const adjustmentIds = adjustments.map(row => row.id)
    const [sales, purchases, expenses, payables, returns, receivables, employeeSettlements] = await Promise.all([
      tx.sale.findMany({ where: { accountId, id: { in: saleIds } }, include: { items: true, payments: true } }),
      tx.purchase.findMany({ where: { accountId, id: { in: purchaseIds } }, include: { items: true } }),
      tx.operatingExpense.findMany({ where: { accountId, id: { in: expenseIds } } }),
      tx.accountPayable.findMany({ where: { accountId, OR: [{ id: { in: payableIds } }, { purchaseId: { in: purchaseIds } }] } }),
      tx.return.findMany({ where: { accountId, OR: [{ id: { in: returnIds } }, { fiscalAdjustmentId: { in: adjustmentIds } }] }, include: { items: true } }),
      tx.accountReceivable.findMany({ where: { accountId, OR: [{ saleId: { in: saleIds } }, { debitAdjustmentId: { in: adjustmentIds } }, { id: { in: ids([...adjustmentApplications.map(row => row.receivableId), ...creditApplications.map(row => row.receivableId)]) } }] }, include: { payments: true } }),
      tx.employeeExpenseSettlement.findMany({ where: { accountId, expenseId: { in: expenseIds } } }),
    ])
    const supplierPayments = await tx.supplierPayment.findMany({ where: { accountId, OR: [{ id: { in: ids([...documents.map(row => row.supplierPaymentId), ...foreignPayments.map(row => row.supplierPaymentId)]) } }, { apId: { in: payables.map(row => row.id) } }] } })
    return {
      format: "movopos-fiscal-history", version: 1, exportedAt: new Date().toISOString(), accountId,
      notice: "Datos de preparación; no constituyen comprobantes emitidos ni un archivo restaurable.",
      settings, policyChanges, concepts, sequences, allocations, sequenceEvents, documents, documentLines,
      documentEvents, references, revisions, preparations, receivedDocuments, receivedOperations,
      adjustments, adjustmentLines, adjustmentEvents, adjustmentOperations, adjustmentApplications,
      customerCredits, creditApplications, foreignOperations, foreignPayments,
      sources: { sales, purchases, expenses, payables, supplierPayments, returns, receivables, employeeSettlements },
    }
  }, { isolationLevel: "RepeatableRead", timeout: 30000 })
}
