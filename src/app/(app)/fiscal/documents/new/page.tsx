import { getCurrentUser } from "@/lib/auth"
import { redirect } from "next/navigation"
import { FiscalEditor } from "../ui"
import { getFiscalCapabilities } from "@/lib/fiscal/core/policy"
export const dynamic="force-dynamic"
// Proteger también la URL directa: tener permisos no activa el módulo de la cuenta.
export default async function Page({searchParams}:{searchParams:Promise<{source?:string;sourceId?:string}>}){const user=await getCurrentUser();if(!user)redirect("/login");if(!user.isOwner&&!user.canPrepareFiscalDocuments)redirect("/dashboard");const capabilities=await getFiscalCapabilities(user);if(!capabilities?.policy.enabled)redirect("/dashboard");const source=await searchParams;return <FiscalEditor accountId={user.accountId} userId={user.id} initialSource={source} fiscalSaleEnabled={capabilities?.operations.prepare??false}/>}
