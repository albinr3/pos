"use client"

import { useId } from "react"

export function CashShiftIllustration() {
  const id = useId()
  return <svg viewBox="0 0 260 164" fill="none" className="h-24 w-40 sm:h-28 sm:w-48" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-body`} x1="88" y1="80" x2="176" y2="149" gradientUnits="userSpaceOnUse"><stop stopColor="#A78BFA" /><stop offset="1" stopColor="#7C3AED" /></linearGradient>
      <linearGradient id={`${id}-screen`} x1="101" y1="35" x2="159" y2="77" gradientUnits="userSpaceOnUse"><stop stopColor="#7C3AED" /><stop offset="1" stopColor="#4C1D95" /></linearGradient>
      <linearGradient id={`${id}-coin`} x1="185" y1="100" x2="207" y2="135" gradientUnits="userSpaceOnUse"><stop stopColor="#FDE68A" /><stop offset="1" stopColor="#F59E0B" /></linearGradient>
    </defs>
    <ellipse cx="132" cy="146" rx="94" ry="9" fill="#8B5CF6" opacity=".1" />
    <circle cx="130" cy="80" r="70" fill="#8B5CF6" opacity=".07" />
    <circle cx="51" cy="71" r="6" fill="#C4B5FD" opacity=".6" />
    <circle cx="211" cy="49" r="4" fill="#C4B5FD" opacity=".6" />
    <path d="M63 31v10m-5-5h10M216 80v8m-4-4h8" stroke="#A78BFA" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M159 59V25h30v56" fill="#FAF5FF" stroke="#C4B5FD" strokeWidth="2" strokeLinejoin="round" />
    <path d="M166 36h15m-15 8h15m-15 8h8" stroke="#C4B5FD" strokeWidth="3" strokeLinecap="round" />
    <path d="M86 86h91l16 32H72l14-32Z" fill={`url(#${id}-body)`} />
    <path d="M72 118h121v14a9 9 0 0 1-9 9H81a9 9 0 0 1-9-9v-14Z" fill="#6D28D9" />
    <path d="M83 120h98v22a7 7 0 0 1-7 7H90a7 7 0 0 1-7-7v-22Z" fill="#DDD6FE" stroke="#8B5CF6" strokeWidth="2" />
    <path d="M93 124v13m18-13v13m20-13v13m20-13v13m18-13v13" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round" />
    <rect x="114" y="137" width="36" height="5" rx="2.5" fill="#8B5CF6" />
    <path d="M122 76h20l4 13h-28l4-13Z" fill="#6D28D9" />
    <rect x="95" y="31" width="74" height="51" rx="8" fill="#EDE9FE" stroke="#A78BFA" strokeWidth="2" />
    <rect x="101" y="37" width="62" height="37" rx="4" fill={`url(#${id}-screen)`} />
    <path d="M112 49h19m-19 8h12" stroke="#DDD6FE" strokeWidth="3" strokeLinecap="round" />
    <path d="M140 60v-5m6 5V49m6 11V45" stroke="#C4B5FD" strokeWidth="3" strokeLinecap="round" />
    <path d="M94 98h10m7 0h10m7 0h10m-40 8h10m7 0h10m7 0h10" stroke="#EDE9FE" strokeWidth="4" strokeLinecap="round" />
    <rect x="154" y="96" width="18" height="13" rx="3" fill="#DDD6FE" />
    <rect x="42" y="107" width="45" height="25" rx="4" transform="rotate(-12 42 107)" fill="#D1FAE5" stroke="#6EE7B7" strokeWidth="2" />
    <circle cx="66" cy="114" r="6" stroke="#34D399" strokeWidth="2" />
    <ellipse cx="198" cy="133" rx="15" ry="5" fill="#D97706" />
    <path d="M183 123v10c0 3 7 5 15 5s15-2 15-5v-10" fill="#FBBF24" stroke="#D97706" strokeWidth="1.5" />
    <ellipse cx="198" cy="123" rx="15" ry="5" fill="#FDE68A" stroke="#F59E0B" strokeWidth="1.5" />
    <circle cx="194" cy="108" r="15" fill={`url(#${id}-coin)`} stroke="#F59E0B" strokeWidth="2" />
    <circle cx="194" cy="108" r="10" stroke="#FFFBEB" strokeWidth="1.5" />
    <path d="M194 103v10" stroke="#D97706" strokeWidth="3" strokeLinecap="round" />
  </svg>
}
