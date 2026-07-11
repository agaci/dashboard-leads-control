// Gate de apagar: exige um código de servidor (env DELETE_CODE) para permitir
// hard-deletes de inbox/leads. Protege as estatísticas do funil — em produção nunca
// se deve apagar registos reais; o código serve de travão para só apagar testes.
//
// Fail-closed: se DELETE_CODE não estiver configurado no servidor, nada é apagado.
export function checkDeleteCode(provided: unknown): { ok: boolean; error?: string } {
  const code = process.env.DELETE_CODE;
  if (!code) {
    return { ok: false, error: 'Apagar está desactivado: falta configurar DELETE_CODE no servidor.' };
  }
  if (typeof provided !== 'string' || provided !== code) {
    return { ok: false, error: 'Código de segurança inválido.' };
  }
  return { ok: true };
}
