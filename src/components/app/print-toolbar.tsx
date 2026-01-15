"use client"

import Link from "next/link"

export function PrintToolbar({
  secondaryLink,
}: {
  secondaryLink?: { href: string; label: string }
}) {
  return (
    <div className="no-print mb-2 flex items-center justify-between">
      <button
        onClick={() => window.print()}
        className="rounded bg-black px-3 py-1 text-xs font-semibold text-white"
      >
        Imprimir
      </button>
      {secondaryLink ? (
        <Link className="text-xs text-neutral-600" href={secondaryLink.href} target="_blank">
          {secondaryLink.label}
        </Link>
      ) : (
        <div />
      )}
    </div>
  )
}
