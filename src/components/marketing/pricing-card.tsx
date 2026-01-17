import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

export interface PricingPlan {
  name: string
  price: string
  description: string
  features: string[]
  cta: string
  ctaHref: string
  popular?: boolean
}

interface PricingCardProps {
  plan: PricingPlan
}

export function PricingCard({ plan }: PricingCardProps) {
  return (
      <Card
        className={cn(
          "relative flex flex-col",
          plan.popular && "shadow-lg"
        )}
        style={plan.popular ? {
          borderColor: 'rgb(130, 4, 255)',
          borderWidth: '2px'
        } : {}}
      >
      {plan.popular && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
          <span 
            className="text-white px-3 py-1 rounded-full text-xs font-semibold"
            style={{
              background: 'linear-gradient(35deg, rgb(6, 0, 151) 0%, rgb(130, 4, 255) 73%, rgb(193, 15, 255) 100%)'
            }}
          >
            Más Popular
          </span>
        </div>
      )}
      <CardHeader>
        <CardTitle className="text-3xl">{plan.name}</CardTitle>
        <CardDescription className="text-base">{plan.description}</CardDescription>
        <div className="mt-4">
          <span className="text-5xl font-bold">{plan.price}</span>
          <span className="text-muted-foreground text-lg">/mes</span>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        <ul className="space-y-3">
          {plan.features.map((feature, index) => (
            <li key={index} className="flex items-start gap-2">
              <Check 
                className="h-5 w-5 shrink-0 mt-0.5" 
                style={{
                  color: 'rgb(130, 4, 255)'
                }}
              />
              <span className="text-base">{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter>
        <Button
          asChild
          className={cn(
            "w-full font-semibold",
            plan.popular 
              ? "text-white border-0" 
              : "border-2 text-[#6B46C1] hover:bg-purple-50"
          )}
          style={plan.popular ? {
            background: 'linear-gradient(35deg, rgb(6, 0, 151) 0%, rgb(130, 4, 255) 73%, rgb(193, 15, 255) 100%)'
          } : {}}
          variant={plan.popular ? "default" : "outline"}
        >
          <Link href={plan.ctaHref}>{plan.cta}</Link>
        </Button>
      </CardFooter>
    </Card>
  )
}


