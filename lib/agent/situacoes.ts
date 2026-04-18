import { readFileSync } from 'fs';
import { join } from 'path';
import type { Situacao } from '@/types/agent';

let situacoes: Situacao[] = [];

try {
  const raw = readFileSync(join(process.cwd(), 'data', 'yourbox_situacoes_100.json'), 'utf-8');
  situacoes = JSON.parse(raw).situacoes ?? [];
} catch (e) {
  console.error('[situacoes] Falha ao carregar base de conhecimento:', e);
}

export function getAllSituacoes(): Situacao[] {
  return situacoes;
}

export function getSituacaoById(id: string): Situacao | undefined {
  return situacoes.find((s) => s.id === id);
}

export function getSituacoesByCategoria(categoria: string): Situacao[] {
  return situacoes.filter((s) => s.categoria === categoria);
}

export function getSituacoesAlta(): Situacao[] {
  return situacoes.filter((s) =>
    s.frequencia === 'muito_alta' || s.frequencia === 'alta' || s.frequencia === 'constante'
  );
}
