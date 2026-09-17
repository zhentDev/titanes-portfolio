/**
 * Utilidad integral de Horarios de Mercado y Exchanges Mundiales
 * Permite conocer los horarios locales, la equivalencia en Hora Colombia (UTC-5),
 * el estado en tiempo real (Abierto/Cerrado/Almuerzo) y notas para brokers como XTB.
 */

export const MARKET_EXCHANGES = {
  US: {
    code: "US",
    name: "Wall Street (NYSE / NASDAQ)",
    country: "Estados Unidos 🇺🇸",
    flag: "🇺🇸",
    timezone: "America/New_York",
    localHours: "09:30 - 16:00 ET",
    colombiaHours: "08:30 - 15:00 Col (Verano EDT) / 09:30 - 16:00 (Invierno EST)",
    openHourET: 9.5,
    closeHourET: 16.0,
    hasLunchBreak: false,
    description: "Bolsas principales de Nueva York (NYSE, NASDAQ, AMEX y OTC/Pink Sheets).",
    brokerNotes: "En XTB y otros brokers, acciones como TCEHY (Tencent ADR) cotizan en este horario.",
  },
  HKG: {
    code: "HKG",
    name: "Bolsa de Hong Kong (HKEX)",
    country: "Hong Kong 🇭🇰",
    flag: "🇭🇰",
    timezone: "Asia/Hong_Kong",
    localHours: "09:30 - 12:00 y 13:00 - 16:00 HKT",
    colombiaHours: "20:30 - 23:00 (noche ant.) y 00:00 - 03:00 AM (madrugada) Col",
    hasLunchBreak: true,
    lunchStartHKT: 12.0,
    lunchEndHKT: 13.0,
    description: "Bolsa oficial de Hong Kong (tickers terminados en .HK como 0700.HK, 1810.HK).",
    brokerNotes: "XTB no suele dar acceso directo al parqué de HKEX. En XTB, Tencent se negocia en plazas europeas (NNND.DE) abiertas hasta las 10:30 AM Col.",
  },
  LSE: {
    code: "LSE",
    name: "Bolsa de Londres (London Stock Exchange)",
    country: "Reino Unido 🇬🇧",
    flag: "🇬🇧",
    timezone: "Europe/London",
    localHours: "08:00 - 16:30 BST/GMT",
    colombiaHours: "02:00 - 10:30 AM Col (BST) / 03:00 - 11:30 AM Col (GMT)",
    hasLunchBreak: false,
    description: "Mercado principal de Londres (tickers terminados en .L como CNYA.L, KWEB.L, CSPX.L).",
    brokerNotes: "Horario continuo matutino para Colombia; cierra a media mañana (10:30 AM).",
  },
  XETRA: {
    code: "XETRA",
    name: "Bolsa de Fráncfort / XETRA (Alemania)",
    country: "Alemania 🇩🇪",
    flag: "🇩🇪",
    timezone: "Europe/Berlin",
    localHours: "09:00 - 17:30 CEST/CET",
    colombiaHours: "02:00 - 10:30 AM Col (CEST) / 03:00 - 11:30 AM Col (CET)",
    hasLunchBreak: false,
    description: "Mercado europeo principal de acciones y ETFs (tickers .DE).",
    brokerNotes: "XTB utiliza este horario europeo (cierre a las 10:30 AM Col con pequeños breaks de mantenimiento a las 6h).",
  },
  BVC: {
    code: "BVC",
    name: "Bolsa de Valores de Colombia",
    country: "Colombia 🇨🇴",
    flag: "🇨🇴",
    timezone: "America/Bogota",
    localHours: "09:30 - 16:00 COT",
    colombiaHours: "09:30 - 16:00 Col",
    hasLunchBreak: false,
    description: "Mercado accionario local de Colombia (ECOPETROL, BANCOLOMBIA, etc.).",
    brokerNotes: "Opera en el mismo huso horario local de Colombia (UTC-5).",
  },
  CRYPTO: {
    code: "CRYPTO",
    name: "Criptomonedas / Derivados 24/7",
    country: "Global 🌐",
    flag: "🌐",
    timezone: "UTC",
    localHours: "24 horas / 7 días",
    colombiaHours: "24/7 Continuo",
    hasLunchBreak: false,
    description: "Mercado descentralizado de activos digitales y pares cripto.",
    brokerNotes: "Disponible permanentemente sin horario de cierre de bolsa.",
  },
};

/**
 * Detecta el exchange correspondiente a partir del ticker o código de exchange.
 */
export function detectExchangeKey(ticker = "", exchange = "") {
  const t = String(ticker).trim().toUpperCase();
  const e = String(exchange).trim().toUpperCase();

  if (t.includes("-USD") && (t.includes("BTC") || t.includes("ETH") || e === "CCC" || e === "CRYPTOCURRENCY")) {
    return "CRYPTO";
  }
  if (t.endsWith(".HK") || ["HKG", "HKEX", "HONG KONG"].includes(e)) {
    return "HKG";
  }
  if (t.endsWith(".L") || ["LSE", "LON", "LONDON", "FTSE"].includes(e)) {
    return "LSE";
  }
  if (
    t.endsWith(".DE") ||
    t.endsWith(".F") ||
    t.endsWith(".PA") ||
    t.endsWith(".AS") ||
    t.endsWith(".MC") ||
    ["XETRA", "EURONEXT", "GER", "FRA", "PARIS", "AMSTERDAM"].includes(e)
  ) {
    return "XETRA";
  }
  if (t.endsWith(".CL") || ["BVC", "COLOMBIA"].includes(e)) {
    return "BVC";
  }
  return "US";
}

/**
 * Retorna la información completa de horario y estado en vivo para un ticker o exchange.
 */
export function getMarketSchedule(ticker = "", exchange = "") {
  const key = detectExchangeKey(ticker, exchange);
  const info = MARKET_EXCHANGES[key] || MARKET_EXCHANGES.US;

  if (key === "CRYPTO") {
    return {
      ...info,
      isOpen: true,
      statusText: "Abierto 24/7",
      statusColor: "#22c55e",
      currentLocalTime: new Date().toLocaleTimeString("es-CO", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" }),
    };
  }

  const now = new Date();

  // Obtener fecha y hora en el huso horario de la bolsa
  const tzString = now.toLocaleString("en-US", { timeZone: info.timezone });
  const localDate = new Date(tzString);
  const dayOfWeek = localDate.getDay(); // 0 = Domingo, 6 = Sábado
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  const hours = localDate.getHours();
  const minutes = localDate.getMinutes();
  const timeDec = hours + minutes / 60.0;

  let isOpen = false;
  let isLunch = false;
  let statusText = "Cerrado";
  let statusColor = "#ef4444";

  if (!isWeekend) {
    if (key === "HKG") {
      // 09:30 - 12:00 y 13:00 - 16:00
      if ((timeDec >= 9.5 && timeDec < 12.0) || (timeDec >= 13.0 && timeDec < 16.0)) {
        isOpen = true;
        statusText = "Abierto";
        statusColor = "#22c55e";
      } else if (timeDec >= 12.0 && timeDec < 13.0) {
        isLunch = true;
        statusText = "Receso Almuerzo (HK)";
        statusColor = "#f59e0b";
      } else {
        statusText = "Cerrado";
        statusColor = "#ef4444";
      }
    } else if (key === "LSE") {
      // 08:00 - 16:30
      if (timeDec >= 8.0 && timeDec < 16.5) {
        isOpen = true;
        statusText = "Abierto";
        statusColor = "#22c55e";
      } else {
        statusText = "Cerrado";
        statusColor = "#ef4444";
      }
    } else if (key === "XETRA") {
      // 09:00 - 17:30
      if (timeDec >= 9.0 && timeDec < 17.5) {
        isOpen = true;
        statusText = "Abierto";
        statusColor = "#22c55e";
      } else {
        statusText = "Cerrado";
        statusColor = "#ef4444";
      }
    } else if (key === "BVC") {
      // 09:30 - 16:00
      if (timeDec >= 9.5 && timeDec < 16.0) {
        isOpen = true;
        statusText = "Abierto";
        statusColor = "#22c55e";
      } else {
        statusText = "Cerrado";
        statusColor = "#ef4444";
      }
    } else {
      // US: 09:30 - 16:00
      if (timeDec >= 9.5 && timeDec < 16.0) {
        isOpen = true;
        statusText = "Abierto";
        statusColor = "#22c55e";
      } else {
        statusText = "Cerrado";
        statusColor = "#ef4444";
      }
    }
  } else {
    statusText = "Cerrado (Fin de Semana)";
  }

  const localTimeStr = localDate.toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const colTimeStr = now.toLocaleTimeString("es-CO", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  return {
    ...info,
    isOpen,
    isLunch,
    statusText,
    statusColor,
    currentLocalTime: localTimeStr,
    currentColombiaTime: colTimeStr,
  };
}
