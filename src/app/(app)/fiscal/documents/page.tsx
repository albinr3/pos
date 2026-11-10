import { getCurrentUser } from "@/lib/auth"
import { redirect } from "next/navigation"
import { FiscalInbox } from "./ui"
export const dynamic="force-dynamic"
export default async function Page({searchParams}:{searchParams:Promise<{source?:string;sourceId?:string}>}){const user=await getCurrentUser();if(!user)redirect("/login");if(!user.isOwner&&!user.canViewFiscalDocuments)redirect("/dashboard");return <FiscalInbox canPrepare={user.isOwner||user.canPrepareFiscalDocuments} initialSource={await searchParams}/>}
