const DEFAULT_TIMEZONE = "America/Bogota";

const WEEKDAY_INDEX: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  miércoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  sábado: 6
};

export type TemporalContext = {
  timestamp: number;
  isoDate: string;
  isoDateTime: string;
  timezone: string;
  localeDate: string;
};

export type SemanticMemory = {
  key: string;
  payload: Record<string, unknown>;
};

export function obtenerContextoTemporalSistema(timezone = DEFAULT_TIMEZONE): TemporalContext {
  const now = new Date();

  return {
    timestamp: now.getTime(),
    isoDate: toIsoDate(now),
    isoDateTime: now.toISOString(),
    timezone,
    localeDate: now.toLocaleDateString("es-CO", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: timezone
    })
  };
}

export function obtenerPromptTemporalSistema(timezone = DEFAULT_TIMEZONE): string {
  const context = obtenerContextoTemporalSistema(timezone);

  return [
    "[EJE TEMPORAL DE REFERENCIA T-BIT]",
    `Timestamp: ${context.timestamp}`,
    `Fecha ISO: ${context.isoDate}`,
    `Fecha local: ${context.localeDate}`,
    `Zona horaria: ${context.timezone}`,
    "Resuelve expresiones como hoy, mañana, ayer, proximo viernes y en N dias antes de guardar memoria."
  ].join("\n");
}

export function construirMemoriaSemantica(command: string, timezone = DEFAULT_TIMEZONE): SemanticMemory {
  const normalized = command.normalize("NFC").trim();
  const temporalContext = obtenerContextoTemporalSistema(timezone);
  const exactDate = resolverFechaRelativa(normalized, temporalContext);
  const semanticKey = inferirClaveSemantica(normalized);

  return {
    key: semanticKey,
    payload: {
      _tbit_meta: {
        timestamp: temporalContext.timestamp,
        timezone: temporalContext.timezone,
        fecha_sistema: temporalContext.isoDate,
        normalizedKey: semanticKey,
        fecha_exacta: exactDate
      },
      data: {
        texto_original: normalized,
        fecha_exacta: exactDate,
        contexto: describirContexto(normalized, exactDate)
      }
    }
  };
}

export function inferirClaveConsulta(command: string): string {
  return inferirClaveSemantica(command.normalize("NFC").trim());
}

export function resolverFechaRelativa(command: string, context = obtenerContextoTemporalSistema()): string | undefined {
  const text = command.toLowerCase().normalize("NFC");
  const baseDate = fromIsoDate(context.isoDate);

  if (/\bmañana\b/.test(text)) {
    return toIsoDate(addDays(baseDate, 1));
  }

  if (/\bhoy\b/.test(text)) {
    return toIsoDate(baseDate);
  }

  if (/\bayer\b/.test(text)) {
    return toIsoDate(addDays(baseDate, -1));
  }

  const inDays = text.match(/\ben\s+(\d+)\s+d[ií]as?\b/);

  if (inDays) {
    return toIsoDate(addDays(baseDate, Number(inDays[1])));
  }

  const nextWeekday = text.match(/\bpr[oó]ximo\s+(domingo|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado)\b/);

  if (nextWeekday) {
    return toIsoDate(nextWeekdayDate(baseDate, nextWeekday[1]));
  }

  return undefined;
}

function inferirClaveSemantica(command: string): string {
  const text = command.toLowerCase().normalize("NFC");

  if (text.includes("cumpleaños") || text.includes("cumpleanos")) {
    return "Usuario::FechasEspeciales::Cumpleaños";
  }

  if (text.includes("master key") || text.includes("clave maestra")) {
    return "Sistema::Seguridad::MasterKey";
  }

  if (text.includes("api key") || text.includes("llave api")) {
    return "Sistema::Seguridad::ApiKey";
  }

  if (text.includes("vence") || text.includes("vencimiento") || text.includes("expira") || text.includes("expiracion") || text.includes("expiración")) {
    return "Sistema::Vencimientos::General";
  }

  const fallback = text
    .replace(/^(recuerda|recordar|consulta|consultar|busca|buscar)\s+/i, "")
    .replace(/\s+/g, "_")
    .replace(/[^\p{L}\p{N}_-]/gu, "")
    .slice(0, 48) || "MemoriaGeneral";

  return `Usuario::Memoria::${fallback}`;
}

function describirContexto(command: string, exactDate?: string): string {
  if (!exactDate) {
    return "Memoria registrada sin fecha relativa detectada.";
  }

  if (command.toLowerCase().includes("cumple")) {
    return "Fecha especial del usuario calculada a partir de una declaracion temporal relativa.";
  }

  return "Fecha calculada a partir de una expresion temporal relativa.";
}

function nextWeekdayDate(baseDate: Date, weekdayName: string): Date {
  const normalizedName = weekdayName.normalize("NFC");
  const target = WEEKDAY_INDEX[normalizedName] ?? WEEKDAY_INDEX[removeAccent(normalizedName)];
  const current = baseDate.getUTCDay();
  let delta = target - current;

  if (delta <= 0) {
    delta += 7;
  }

  return addDays(baseDate, delta);
}

function removeAccent(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").normalize("NFC");
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function fromIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}
