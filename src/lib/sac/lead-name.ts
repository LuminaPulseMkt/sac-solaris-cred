/**
 * Resolve lead_name for a webhook message.
 *
 * Regras:
 *  - pushName só é confiável quando a mensagem vem do lead (fromMe=false).
 *  - Para nova conversa, usa pushName ou cai no telefone.
 *  - Para conversa existente, mantém o nome atual; só sobrescreve quando o
 *    atual é vazio ou igual ao telefone e chegou um pushName real.
 */
export function resolvePushName(
  fromMe: boolean,
  rawPushName: string | null | undefined,
): string | null {
  if (fromMe) return null;
  const trimmed = rawPushName?.trim();
  return trimmed ? trimmed : null;
}

export function resolveLeadName(opts: {
  fromMe: boolean;
  pushName: string | null | undefined;
  leadPhone: string;
}): string {
  const push = resolvePushName(opts.fromMe, opts.pushName);
  return push ?? opts.leadPhone;
}

export function shouldUpdateLeadName(opts: {
  pushName: string | null;
  currentLeadName: string | null;
  leadPhone: string;
}): boolean {
  if (!opts.pushName) return false;
  if (!opts.currentLeadName) return true;
  return opts.currentLeadName === opts.leadPhone;
}
