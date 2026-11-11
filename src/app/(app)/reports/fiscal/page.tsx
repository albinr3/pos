import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { hasPermission } from "@/lib/permissions"
import { FiscalReports } from "./reports-client"
export const dynamic="force-dynamic"
export default async function Page() { const user=await getCurrentUser();if(!user)redirect("/login");if(!hasPermission(user,"canViewFiscalDocuments")||!hasPermission(user,"canAccessReports"))redirect("/dashboard");return <FiscalReports/> }
