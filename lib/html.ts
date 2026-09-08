/**
 * Escape de HTML para texto que veio de fora.
 *
 * As leads guardam em `messages.message` um bloco de HTML já montado, e o dashboard
 * mostra-o com `dangerouslySetInnerHTML` (app/dashboard/page.tsx). Esse HTML é
 * construído por concatenação com dados que o visitante escreveu — nome, moradas,
 * observações. Sem escape, quem escrever `<img src=x onerror=...>` no nome do quiz
 * fica com esse código a correr no browser da operadora, com a sessão dela. O mesmo
 * HTML segue para o leadsBoard do Meteor.
 *
 * A defesa é escapar os VALORES na construção, não a marcação: o `<p>` e o `<b>` da
 * mensagem são nossos e têm de continuar a renderizar.
 *
 * Regra prática: dentro de uma template string que produz HTML, tudo o que venha de
 * fora passa por aqui. O que é nosso — etiquetas, estilos, texto fixo — não passa.
 */
export function esc(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
