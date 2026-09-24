import {isNumberLikeName} from "./iban";

// Match the registry's normalization, including Cyrillic Ө/Ү and РД prefixes.
export function normalizeRegister(raw: string | null): string | null {
  const value = (raw ?? "").trim().replace(/^РД\s*:?\s*/iu, "")
    .replace(/[\s.,;:_-]/g, "").toUpperCase();
  return /^[А-ЯЁӨҮ]{2}\d{8}$/.test(value) ? value : null;
}

export function namesByRegister(people: Array<{
  suspects: Array<{nationalId: string | null; fullName: string}>;
}>): Map<string, string[]> {
  const names = new Map<string, Set<string>>();
  for (const person of people) {
    // Use each source record's register, never infer identity from the group's
    // shared phone/account or attach its display name to a different register.
    for (const record of person.suspects) {
      const id = normalizeRegister(record.nationalId);
      if (!id || isNumberLikeName(record.fullName)) continue;
      const name = record.fullName.trim().replace(/\s+/g, " ").toUpperCase();
      if (normalizeRegister(name)) continue;
      if (!names.has(id)) names.set(id, new Set());
      names.get(id)!.add(name);
    }
  }
  return new Map([...names].map(([id, values]) => [id, [...values].sort()]));
}

export function namedFirst<T extends {nationalId: string}>(
  rows: T[], names: Map<string, string[]>, direction: "asc" | "desc" = "asc",
): T[] {
  return [...rows].sort((a, b) => {
    const an = names.get(normalizeRegister(a.nationalId) ?? "")?.join(" / ");
    const bn = names.get(normalizeRegister(b.nationalId) ?? "")?.join(" / ");
    if (Boolean(an) !== Boolean(bn)) return an ? -1 : 1;
    return (an && bn ? an.localeCompare(bn, "mn") * (direction === "desc" ? -1 : 1) : 0)
      || a.nationalId.localeCompare(b.nationalId, "mn");
  });
}
