export function isInvalidName(nameStr: string): boolean {
  if (!nameStr) return true;
  const normalizedLower = nameStr.toLowerCase().replace(/\s+/g, " ").trim();

  // 1. Length & basic validation
  if (normalizedLower.length <= 1) return true;
  
  // If it consists only of digits, punctuation, or times/durations (e.g. "12:30", "2026-06-12", "45", "100%", "30 min")
  if (/^[0-9:\-\/\s%apm\(\)]+$/i.test(normalizedLower)) {
    return true;
  }

  // 2. Filter out hosts (systematically ignore Gustavo Ramos Soria and others)
  const HOST_SUBSTRINGS = [
    "gustavo ramos soria",
    "gustavo ramos",
    "ramos soria",
    "nicolas rios lopez",
    "nicolas rios",
    "rios lopez",
    "nadine hinojosa ramos",
    "nadine hinojosa",
    "hinojosa ramos",
    "wara hermosa fernandez",
    "wara hermosa",
    "hermosa fernandez",
    "angela guzman rusinque",
    "angela guzman",
    "guzman rusinque",
    "alejandra barrientos garrido",
    "alejandra barrientos",
    "barrientos garrido",
    "gary ronald sanchez suarez",
    "gary ronald",
    "sanchez suarez",
    "gary sanchez",
    "rodrigo rivero rocha",
    "rodrigo rivero",
    "rivero rocha",
    "eric revollo ayala",
    "eric revollo",
    "revollo ayala",
    "alejandra rivero crespo",
    "alejandra rivero",
    "rivero crespo",
    "stephanie mariscal rodriguez",
    "stephanie mariscal",
    "mariscal rodriguez",
    "fabiola arias navia",
    "fabiola arias",
    "arias navia",
    "pablo rico schmidt",
    "pablo rico",
    "rico schmidt"
  ];

  for (const host of HOST_SUBSTRINGS) {
    if (normalizedLower === host || normalizedLower.includes(host)) {
      return true;
    }
  }

  // 3. Filter out metadata rows
  const METADATA_SUBSTRINGS = [
    "meeting title",
    "attended participants",
    "start time",
    "end time",
    "meeting duration",
    "average attendance time",
    "average attendance",
    "attendance rate",
    "duration",
    "participants",
    "attendance log",
    "attendance sheet",
    "log date",
    "activity name",
    "colleague name",
    "name (headers)",
    "name(headers)",
    "headers",
    "report",
    "details",
    "summary"
  ];

  for (const meta of METADATA_SUBSTRINGS) {
    if (normalizedLower === meta || normalizedLower.includes(meta)) {
      return true;
    }
  }

  // Headers containing "name" specifically
  if (
    normalizedLower === "name" || 
    normalizedLower === "name:" || 
    normalizedLower.startsWith("name ") || 
    normalizedLower.startsWith("name:") || 
    normalizedLower.includes("name (") || 
    normalizedLower.endsWith("(headers)") ||
    normalizedLower.includes("header")
  ) {
    return true;
  }

  return false;
}
