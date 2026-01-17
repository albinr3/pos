import { MarketingHeader } from "@/components/marketing/header"
import { MarketingFooter } from "@/components/marketing/footer"
import { ThemeProvider } from "@/components/app/theme-provider"

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <div className="flex min-h-screen flex-col">
        <div 
          className="relative"
          style={{
            background: 'linear-gradient(35deg, rgb(6, 0, 151) 0%, rgb(130, 4, 255) 73%, rgb(193, 15, 255) 100%)'
          }}
        >
          <MarketingHeader />
        </div>
        <main className="flex-1">{children}</main>
        <MarketingFooter />
      </div>
    </ThemeProvider>
  )
}


