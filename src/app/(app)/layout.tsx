import { AppShell } from "@/components/app/app-shell"
import { ThemeProvider } from "@/components/app/theme-provider"
import { Toaster } from "@/components/ui/toaster"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <AppShell>{children}</AppShell>
      <Toaster />
    </ThemeProvider>
  )
}
