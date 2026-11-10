import { getCurrentUser } from "@/lib/auth"
import { redirect } from "next/navigation"
import { FiscalDetail } from "../ui"
import { getFiscalCapabilities } from "@/lib/fiscal/core/policy"
export const dynamic="force-dynamic"
// Una capacidad ausente debe mantener ocultas las acciones nuevas.
export default async function Page({params}:{params:Promise<{id:string}>}){const user=await getCurrentUser();if(!user)redirect("/login");if(!user.isOwner&&!user.canViewFiscalDocuments)redirect("/dashboard");const capabilities=await getFiscalCapabilities(user);return <FiscalDetail id={(await params).id} accountId={user.accountId} userId={user.id} canPrepare={user.isOwner||user.canPrepareFiscalDocuments} fiscalSaleEnabled={capabilities?.operations.prepare??false}/>}
