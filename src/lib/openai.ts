import OpenAI from "openai"

// Cliente de OpenAI - requiere OPENAI_API_KEY en las variables de entorno
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})















