const { execSync } = require("node:child_process")

const isVercel = Boolean(process.env.VERCEL)
const vercelEnv = process.env.VERCEL_ENV

if (isVercel && vercelEnv === "production") {
  execSync("npx prisma migrate deploy", { stdio: "inherit" })
}
