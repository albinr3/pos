import { prisma } from "@/lib/db"
import { purchasePermit, PurchaseError, type PurchaseActor } from "@/lib/purchase-credit"

// La recuperación está limitada al autor y a comandos de estas etapas, incluso si cambia la política.
export async function getFiscalCommercialOperation(actor: PurchaseActor, operationId: string) {
 if(typeof operationId!=="string" || !operationId.trim() || operationId.length>128) throw new PurchaseError("INVALID_INPUT","Identificador de operación inválido")
 const operation=await prisma.purchaseOperation.findUnique({where:{accountId_operationId:{accountId:actor.accountId,operationId}}})
 if(!operation || operation.userId!==actor.id) throw new PurchaseError("NOT_FOUND","Operación no encontrada",404)
 if(["fiscalExpense","fiscalExpenseRevision","employeeExpenseSettlement"].includes(operation.kind)) purchasePermit(actor,"canManageExpenses")
 else if(operation.kind==="foreignObligation") {purchasePermit(actor,"canAccessAccountsPayable");purchasePermit(actor,"canManagePurchases")}
 else if(operation.kind==="foreignPayment") {purchasePermit(actor,"canAccessAccountsPayable");purchasePermit(actor,"canRegisterSupplierPayments")}
 else throw new PurchaseError("NOT_FOUND","Operación no encontrada",404)
 return {operationId:operation.operationId,kind:operation.kind,status:"COMPLETED",result:operation.response}
}
