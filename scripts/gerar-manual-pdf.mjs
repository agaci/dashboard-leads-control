/**
 * Gera o public/manual.pdf a partir do public/manual.html.
 *
 *   node scripts/gerar-manual-pdf.mjs
 *
 * O PDF é um ficheiro estático servido de `/manual.pdf`. Podia ser gerado no servidor a
 * cada pedido, mas isso obrigaria a meter um Chromium dentro da imagem de produção — uns
 * 300 MB para um ficheiro que muda meia dúzia de vezes por ano. Gera-se aqui e vai no
 * repositório.
 *
 * **Ao mexer no manual, correr isto e commitar os dois ficheiros.** Um PDF desactualizado
 * é pior do que não haver PDF: quem o descarrega não tem como saber que está velho.
 *
 * Usa o Chrome ou o Edge que já estão na máquina — sem dependências novas no projecto.
 * O aspecto do PDF sai do bloco `@media print` do próprio manual: capa, quebras de página
 * por capítulo, e as cores das etiquetas forçadas.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const CANDIDATOS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

const browser = process.env.CHROME_PATH || CANDIDATOS.find((c) => existsSync(c));
if (!browser) {
  console.error('Nao encontrei o Chrome nem o Edge. Indique-o em CHROME_PATH.');
  process.exit(1);
}

const entrada = resolve('public/manual.html');
const saida = resolve('public/manual.pdf');
if (!existsSync(entrada)) {
  console.error('Falta o public/manual.html.');
  process.exit(1);
}

// Perfil descartavel: sem ele o Chrome recusa-se a correr headless quando ja ha uma
// janela aberta com o perfil normal.
const perfil = mkdtempSync(join(tmpdir(), 'yb-pdf-'));

const args = [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  `--user-data-dir=${perfil}`,
  '--no-pdf-header-footer',
  `--print-to-pdf=${saida}`,
  // Dar tempo aos tipos de letra e ao CSS antes de imprimir; sem isto sai uma pagina
  // com o texto por estilar de vez em quando.
  '--virtual-time-budget=6000',
  pathToFileURL(entrada).href,
];

console.log(`browser: ${browser}`);
const proc = spawn(browser, args, { stdio: ['ignore', 'pipe', 'pipe'] });
let erro = '';
proc.stderr.on('data', (d) => { erro += d.toString(); });

proc.on('close', (code) => {
  // O Chrome ainda pode ter ficheiros abertos no perfil quando o processo fecha, e no
  // Windows isso da EPERM. E lixo num directorio temporario: nao vale a pena perder o PDF
  // por causa dele.
  try { rmSync(perfil, { recursive: true, force: true }); } catch { /* o SO limpa */ }

  if (!existsSync(saida)) {
    console.error(`Falhou (codigo ${code}).`);
    console.error(erro.split('\n').filter((l) => l.trim()).slice(-6).join('\n'));
    process.exit(1);
  }

  const kb = statSync(saida).size / 1024;
  console.log(`gravado public/manual.pdf — ${kb.toFixed(0)} KB`);
  if (kb < 40) {
    console.warn('Suspeitosamente pequeno. Abra o ficheiro e confirme que tem o manual todo.');
  }
});
