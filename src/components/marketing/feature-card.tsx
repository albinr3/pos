"use client"

import { LucideIcon } from "lucide-react"
import { useState } from "react"

interface FeatureCardProps {
  name: string
  description: string
  icon: LucideIcon
}

export function FeatureCard({ name, description, icon: Icon }: FeatureCardProps) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div
      className="flex flex-col rounded-lg bg-card p-8 shadow-sm border transition-all duration-300 hover:shadow-lg hover:scale-105 group cursor-pointer"
      style={{
        borderColor: isHovered ? 'rgb(130, 4, 255)' : 'hsl(var(--border))'
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="mb-4 transition-colors duration-300">
        <Icon 
          className="h-8 w-8 transition-all duration-300 group-hover:scale-110" 
          style={{
            color: 'rgb(130, 4, 255)'
          }}
        />
      </div>
      <h3 
        className="text-xl font-semibold mb-3 transition-colors duration-300"
        style={{
          color: isHovered ? 'rgb(130, 4, 255)' : 'inherit'
        }}
      >
        {name}
      </h3>
      <p className="text-base text-muted-foreground">{description}</p>
    </div>
  )
}

