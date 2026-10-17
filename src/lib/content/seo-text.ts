export function isPlainSeoText(value: string) {
  return !/[<>]/.test(value) && !Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}

export function normalizeSeoSeed(value: string) {
  return Array.from(value).map((character) => isPlainSeoText(character) ? character : " ").join("").replace(/\s+/g, " ").trim();
}
