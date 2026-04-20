import Anthropic from '@anthropic-ai/sdk';
import type { EnderecoCompleto, ContactoLocal } from '@/types/agent';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function parseEndereco(texto: string): Promise<EnderecoCompleto> {
  try {
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: 'Extrai componentes de um endereço português. Responde APENAS com JSON válido, sem markdown nem texto extra.',
      messages: [{
        role: 'user',
        content: `Texto: "${texto}"\n\nJSON: { "rua": string, "numero": string|null, "andar": string|null, "codigoPostal": string|null, "localidade": string }`,
      }],
    });
    const raw = ((res.content[0] as Anthropic.TextBlock).text ?? '').trim();
    const parsed = JSON.parse(raw);
    return {
      rua: parsed.rua ?? texto,
      numero: parsed.numero ?? undefined,
      andar: parsed.andar ?? undefined,
      codigoPostal: parsed.codigoPostal ?? undefined,
      localidade: parsed.localidade ?? '',
      raw: texto,
    };
  } catch {
    return { rua: texto, localidade: '', raw: texto };
  }
}

export async function parseContacto(texto: string): Promise<ContactoLocal> {
  try {
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      system: 'Extrai nome, telefone e janela horária de um texto em português. Responde APENAS com JSON válido.',
      messages: [{
        role: 'user',
        content: `Texto: "${texto}"\n\nJSON: { "nome": string|null, "telefone": string|null, "janela": string|null }`,
      }],
    });
    const raw = ((res.content[0] as Anthropic.TextBlock).text ?? '').trim();
    const parsed = JSON.parse(raw);
    return {
      nome: parsed.nome ?? undefined,
      telefone: parsed.telefone ?? undefined,
      janela: parsed.janela ?? undefined,
      raw: texto,
    };
  } catch {
    return { raw: texto };
  }
}

export function formatEndereco(e: EnderecoCompleto): string {
  const linha1 = [e.rua, e.numero, e.andar].filter(Boolean).join(', ');
  const linha2 = [e.codigoPostal, e.localidade].filter(Boolean).join(' ');
  return [linha1, linha2].filter(Boolean).join('\n');
}

export function formatContacto(c: ContactoLocal): string {
  return [c.nome, c.telefone, c.janela].filter(Boolean).join(' · ');
}
