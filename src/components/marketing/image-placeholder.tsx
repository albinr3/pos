import Image from "next/image"
import { cn } from "@/lib/utils"

interface ImagePlaceholderProps {
  width?: number
  height?: number
  alt?: string
  className?: string
  src?: string
}

export function ImagePlaceholder({
  width = 800,
  height = 600,
  alt = "Placeholder image",
  className,
  src,
}: ImagePlaceholderProps) {
  const placeholderUrl = src || `https://via.placeholder.com/${width}x${height}?text=${encodeURIComponent(alt)}`

  return (
    <div className={cn("relative overflow-hidden rounded-lg", className)}>
      <Image
        src={placeholderUrl}
        alt={alt}
        width={width}
        height={height}
        className="object-cover w-full h-full"
        unoptimized
      />
    </div>
  )
}


