import "dotenv/config";

type SendMode = "template" | "text";

type Args = {
  to?: string;
  mode?: SendMode;
  message?: string;
  template?: string;
  language?: string;
  version?: string;
  help?: boolean;
};

type WhatsAppError = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

const DEFAULT_GRAPH_API_VERSION = "v25.0";
const DEFAULT_TEST_MESSAGE = "Prueba de WhatsApp desde Tejada POS.";
const DEFAULT_TEMPLATE_NAME = "hello_world";
const DEFAULT_TEMPLATE_LANGUAGE = "en_US";

function parseArgs(argv: string[]): Args {
  const args: Args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];

    if (raw === "--help" || raw === "-h") {
      args.help = true;
      continue;
    }

    if (!raw.startsWith("--")) {
      continue;
    }

    const option = raw.slice(2);
    const equalsIndex = option.indexOf("=");
    const key = equalsIndex >= 0 ? option.slice(0, equalsIndex) : option;
    const inlineValue = equalsIndex >= 0 ? option.slice(equalsIndex + 1) : undefined;
    const value = inlineValue ?? argv[index + 1];

    if (inlineValue === undefined) {
      index += 1;
    }

    switch (key) {
      case "to":
        args.to = value;
        break;
      case "mode":
        if (value !== "template" && value !== "text") {
          throw new Error("--mode debe ser 'template' o 'text'.");
        }
        args.mode = value;
        break;
      case "message":
        args.message = value;
        break;
      case "template":
        args.template = value;
        break;
      case "language":
        args.language = value;
        break;
      case "version":
        args.version = value;
        break;
      default:
        throw new Error(`Argumento no reconocido: --${key}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`
Prueba de WhatsApp Cloud API

Uso:
  npm run whatsapp:test -- --to 584121234567
  npm run whatsapp:test -- --to 584121234567 --mode text --message "Hola desde Tejada POS"

Variables requeridas:
  WHATSAPP_ACCESS_TOKEN
  WHATSAPP_PHONE_NUMBER_ID

Variables opcionales:
  WHATSAPP_TEST_TO
  WHATSAPP_GRAPH_API_VERSION=${DEFAULT_GRAPH_API_VERSION}
  WHATSAPP_TEST_MODE=template
  WHATSAPP_TEMPLATE_NAME=${DEFAULT_TEMPLATE_NAME}
  WHATSAPP_TEMPLATE_LANGUAGE=${DEFAULT_TEMPLATE_LANGUAGE}
  WHATSAPP_TEST_MESSAGE="${DEFAULT_TEST_MESSAGE}"

Notas:
  - Para iniciar una conversación con un usuario, usa --mode template.
  - El template hello_world suele estar disponible en cuentas de prueba de Meta.
`);
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Falta la variable ${name} en .env o en el entorno.`);
  }

  return value;
}

function optionalValue(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value?.trim())?.trim();
}

function normalizeRecipient(value: string): string {
  return value.replace(/[\s().-]/g, "");
}

function validateRecipient(value: string): string {
  if (!value) {
    throw new Error("Falta el número destino. Usa --to 584121234567 o define WHATSAPP_TEST_TO.");
  }

  const normalized = normalizeRecipient(value);

  if (!/^\+?\d{8,15}$/.test(normalized)) {
    throw new Error("El número destino debe estar en formato internacional, por ejemplo 584121234567.");
  }

  return normalized;
}

function mask(value: string): string {
  if (value.length <= 4) {
    return "****";
  }

  return `${"*".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

function buildPayload(params: {
  mode: SendMode;
  to: string;
  message: string;
  template: string;
  language: string;
}) {
  if (params.mode === "text") {
    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: params.to,
      type: "text",
      text: {
        preview_url: false,
        body: params.message,
      },
    };
  }

  return {
    messaging_product: "whatsapp",
    to: params.to,
    type: "template",
    template: {
      name: params.template,
      language: {
        code: params.language,
      },
    },
  };
}

function parseResponseBody(responseText: string): WhatsAppError | { raw: string } {
  if (!responseText) {
    return {};
  }

  try {
    return JSON.parse(responseText) as WhatsAppError;
  } catch {
    return { raw: responseText };
  }
}

function hasMetaError(body: WhatsAppError | { raw: string }): body is WhatsAppError {
  return "error" in body;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  const accessToken = requireEnv("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = requireEnv("WHATSAPP_PHONE_NUMBER_ID");
  const to = validateRecipient(optionalValue(args.to, process.env.WHATSAPP_TEST_TO) ?? "");
  const mode = args.mode ?? (process.env.WHATSAPP_TEST_MODE as SendMode | undefined) ?? "template";
  const version = optionalValue(args.version, process.env.WHATSAPP_GRAPH_API_VERSION) ?? DEFAULT_GRAPH_API_VERSION;
  const message = optionalValue(args.message, process.env.WHATSAPP_TEST_MESSAGE) ?? DEFAULT_TEST_MESSAGE;
  const template = optionalValue(args.template, process.env.WHATSAPP_TEMPLATE_NAME) ?? DEFAULT_TEMPLATE_NAME;
  const language = optionalValue(args.language, process.env.WHATSAPP_TEMPLATE_LANGUAGE) ?? DEFAULT_TEMPLATE_LANGUAGE;

  if (mode !== "template" && mode !== "text") {
    throw new Error("WHATSAPP_TEST_MODE debe ser 'template' o 'text'.");
  }

  const endpoint = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
  const payload = buildPayload({ mode, to, message, template, language });

  console.log("[whatsapp:test] Enviando mensaje de prueba...");
  console.log(
    JSON.stringify(
      {
        version,
        phoneNumberId: mask(phoneNumberId),
        to: mask(to),
        mode,
        template: mode === "template" ? template : undefined,
        language: mode === "template" ? language : undefined,
      },
      null,
      2,
    ),
  );

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  const responseBody = parseResponseBody(responseText);

  console.log(`[whatsapp:test] HTTP ${response.status} ${response.statusText}`);
  console.log(JSON.stringify(responseBody, null, 2));

  if (!response.ok) {
    const metaError = hasMetaError(responseBody) ? responseBody.error : undefined;
    const details = metaError?.message ? ` ${metaError.message}` : "";
    throw new Error(`Meta rechazó la prueba.${details}`);
  }

  console.log("[whatsapp:test] Meta aceptó el mensaje. Revisa el WhatsApp destino y los webhooks de estado si ya los tienes configurados.");
}

main().catch((error) => {
  console.error("[whatsapp:test] error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
