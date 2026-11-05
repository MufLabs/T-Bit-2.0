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

export function construirMemoriaSemantica(command: string) {
  const normalized = command.normalize("NFC").trim();
  const exactDate = resolverFechaRelativa(normalized);
  const key = inferirClaveConsulta(normalized);

  return {
    key,
    payload: {
      _tbit_meta: {
        timestamp: Date.now(),
        timezone: "America/Bogota",
        fecha_sistema: new Date().toISOString().slice(0, 10),
        normalizedKey: key,
        fecha_exacta: exactDate
      },
      data: {
        texto_original: normalized,
        fecha_exacta: exactDate,
        contexto: exactDate
          ? "Memoria temporal calculada a partir de una expresion relativa."
          : "Memoria registrada sin fecha relativa detectada."
      }
    }
  };
}

export function inferirClaveConsulta(command: string): string {
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

  if (text.includes("vence") || text.includes("vencimiento") || text.includes("expira") || text.includes("expiración")) {
    return "Sistema::Vencimientos::General";
  }

  const fallback = text
    .replace(/^(recuerda|recordar|consulta|consultar|busca|buscar)\s+/i, "")
    .replace(/\s+/g, "_")
    .replace(/[^\p{L}\p{N}_-]/gu, "")
    .slice(0, 48) || "MemoriaGeneral";

  return `Usuario::Memoria::${fallback}`;
}

function resolverFechaRelativa(command: string): string | undefined {
  const text = command.toLowerCase().normalize("NFC");
  const baseDate = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);

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
    const dayName = nextWeekday[1].normalize("NFC");
    const target = WEEKDAY_INDEX[dayName] ?? WEEKDAY_INDEX[dayName.normalize("NFD").replace(/\p{Diacritic}/gu, "").normalize("NFC")];
    const current = baseDate.getUTCDay();
    let delta = target - current;

    if (delta <= 0) {
      delta += 7;
    }

    return toIsoDate(addDays(baseDate, delta));
  }

  return undefined;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
