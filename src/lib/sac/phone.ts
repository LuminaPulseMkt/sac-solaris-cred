// Assume o formato usado em lead_phone neste app: DDI (55) + DDD (2 dígitos) + número.
// Sem o "55" na frente (poucos casos legados), assume que já começa no DDD.
export function extractDDD(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits.slice(2, 4);
  if (digits.length >= 10) return digits.slice(0, 2);
  return null;
}
