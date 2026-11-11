import { getCurrentUser } from "@/lib/auth"
import { redirect } from "next/navigation"
import { FiscalInbox } from "./ui"
import { getFiscalCapabilities } from "@/lib/fiscal/core/policy"
export const dynamic="force-dynamic"
// El historial sigue consultable al apagar el módulo, pero no permite iniciar borradores.
export default async function Page({searchParams}:{searchParams:Promise<{source?:string;sourceId?:string}>}){const user=await getCurrentUser();if(!user)redirect("/login");if(!user.isOwner&&!user.canViewFiscalDocuments)redirect("/dashboard");const capabilities=await getFiscalCapabilities(user);return <FiscalInbox canPrepare={capabilities?.policy.enabled === true && (user.isOwner||user.canPrepareFiscalDocuments)} initialSource={await searchParams}/>}
