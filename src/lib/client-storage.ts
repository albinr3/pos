"use client"

// Todas las claves nuevas usan la marca actual. Las claves anteriores se leen una sola vez
// para que el cambio de marca no descarte sesión, progreso ni datos que el usuario ya tenía.
export const clientStorageKeys = {
  user: "movopos-user",
  cacheSync: "movopos-cache-sync",
  onboardingSkipPrefix: "movopos-onboarding-skip",
  onboardingProgressPrefix: "movopos-onboarding-progress",
  onboardingProductAddedPrefix: "movopos-onboarding-product-added",
  posForceReset: "movopos-force-reset-after-print",
} as const

const legacyStorageKeys = {
  user: "tejada-pos-user",
  cacheSync: "tejada-pos-cache-sync",
  onboardingSkipPrefix: "tejada-pos-onboarding-skip",
  onboardingProgressPrefix: "tejada-pos-onboarding-progress",
  onboardingProductAddedPrefix: "tejada-pos-onboarding-product-added",
  posForceReset: "tejada-pos-force-reset-after-print",
} as const

function readAndMigrate(storage: Storage, currentKey: string, legacyKey: string) {
  const currentValue = storage.getItem(currentKey)
  if (currentValue !== null) return currentValue

  const legacyValue = storage.getItem(legacyKey)
  if (legacyValue === null) return null

  storage.setItem(currentKey, legacyValue)
  storage.removeItem(legacyKey)
  return legacyValue
}

export function getMigratedLocalStorageItem(currentKey: string, legacyKey: string) {
  return readAndMigrate(localStorage, currentKey, legacyKey)
}

export function getMigratedSessionStorageItem(currentKey: string, legacyKey: string) {
  return readAndMigrate(sessionStorage, currentKey, legacyKey)
}

export function legacyStorageKey(name: keyof typeof legacyStorageKeys) {
  return legacyStorageKeys[name]
}
