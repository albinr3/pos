export const TUTORIAL_LEVELS = ["Basico", "Intermedio", "Avanzado"] as const

export type TutorialLevel = (typeof TUTORIAL_LEVELS)[number]

export type PublicTutorialCategory = {
  value: string
  label: string
  description: string
}

export type PublicTutorialVideo = {
  slug: string
  title: string
  description: string
  category: string
  categoryLabel: string
  duration: string
  level: TutorialLevel
  videoUrl: string | null
  featured?: boolean
  outcomes: string[]
}

export function isTutorialLevel(value: string): value is TutorialLevel {
  return TUTORIAL_LEVELS.includes(value as TutorialLevel)
}

export function slugifyTutorial(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
}

export function parseOutcomes(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

export function joinOutcomes(outcomes: string[]): string {
  return outcomes.join("\n")
}
