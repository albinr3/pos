import { getCurrentUser } from "@/lib/auth"
import { redirect } from "next/navigation"
import { FiscalEditor } from "../ui"
import { getFiscalCapabilities } from "@/lib/fiscal/core/policy"
export const dynamic="force-dynamic"
// Una capacidad ausente debe mantener ocultas las acciones nuevas.
export default async function Page({searchParams}:{searchParams:Promise<{source?:string;sourceId?:string}>}){const user=await getCurrentUser();if(!user)redirect("/login");if(!user.isOwner&&!user.canPrepareFiscalDocuments)redirect("/dashboard");const source=await searchParams;const capabilities=await getFiscalCapabilities(user);return <FiscalEditor accountId={user.accountId} userId={user.id} initialSource={source} fiscalSaleEnabled={capabilities?.operations.prepare??false}/>}
