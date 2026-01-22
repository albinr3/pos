const { execSync } = require("node:child_process")

const isVercel = Boolean(process.env.VERCEL)
const vercelEnv = process.env.VERCEL_ENV
const isProd = isVercel && vercelEnv === "production"

if (isProd) {
  const env = { ...process.env }
  if (env.DIRECT_URL) {
    env.DATABASE_URL = env.DIRECT_URL
  } else {
    console.warn("DIRECT_URL no está configurado. Prisma Migrate usará DATABASE_URL.")
  }
  execSync("npx prisma migrate deploy", { stdio: "inherit", env })
}
