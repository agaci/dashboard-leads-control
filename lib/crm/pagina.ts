/**
 * Páginas de confirmação para quem clica num link assinado.
 *
 * Quem chega aqui é um parceiro ou um cliente com o telemóvel na mão, não um operador
 * ao computador. Mesmo formato do app/api/contact-request/route.ts, para as duas
 * plataformas não parecerem duas empresas.
 */

export function paginaHtml(titulo: string, corpo: string, ok = true): Response {
  const marca = ok ? '&#10003;' : '&#33;';
  return new Response(
    `<!doctype html><html lang="pt"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;background:#f5f6fa;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:20px">
<div style="background:#fff;border-radius:16px;padding:40px 32px;max-width:440px;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.08)">
<div style="width:64px;height:64px;border-radius:50%;margin:0 auto 20px;background:${ok ? '#bed62f' : '#e5e7eb'};display:flex;align-items:center;justify-content:center;font-size:30px;color:#1a2332;font-weight:700">${marca}</div>
<h1 style="font-size:20px;color:#1a2332;margin:0 0 12px">${titulo}</h1>
<div style="color:#555;font-size:14px;line-height:1.6">${corpo}</div>
</div></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

/** Página com botões — usada quando falta um dado (motivo da recusa, avaliação). */
export function paginaEscolha(titulo: string, texto: string, opcoes: { label: string; url: string }[]): Response {
  const botoes = opcoes
    .map((o) => `<a href="${o.url}" style="display:inline-block;background:#1a2332;color:#fff;font-weight:600;padding:11px 18px;border-radius:8px;text-decoration:none;font-size:14px;margin:4px">${o.label}</a>`)
    .join('');

  return new Response(
    `<!doctype html><html lang="pt"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;background:#f5f6fa;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:20px">
<div style="background:#fff;border-radius:16px;padding:36px 28px;max-width:440px;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.08)">
<h1 style="font-size:19px;color:#1a2332;margin:0 0 10px">${titulo}</h1>
<p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 20px">${texto}</p>
<div>${botoes}</div>
</div></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}
