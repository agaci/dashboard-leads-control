import { getDb } from '@/lib/mongodb';

// ── Reconciliação inbox/lead <-> cliente YourBox (Fase 1, read-only) ──────────
// Liga serviços reais da YourBox (colecção `services`) a conversas do inbox ainda
// não convertidas, pela CHAVE do contacto (telemóvel/email) + reforços (rota, timing).
// Escreve apenas uma sugestão `clientMatch` na conversa — NUNCA converte sozinho.
//
// Schema (do backend Meteor):
//   services: { companyProvider:'Yourbox', clientName:<email do cliente>, timestamp,
//               points:[{collectionOrDelivery, addressLocal, data:{lat,lng}}], parameters }
//   users:    { emails:[{address}], profile:{ phoneNumber } }   ← telemóvel do cliente

const norm = {
  phone: (v?: unknown): string | null => {
    const d = String(v ?? '').replace(/\D/g, '');
    const m = d.match(/(\d{9})$/);
    return m ? m[1] : null;
  },
  email: (v?: unknown): string | null => {
    const s = String(v ?? '').trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
  },
  token: (v?: unknown): string => String(v ?? '').split(',')[0].trim().toLowerCase(),
};

const SUGGEST_THRESHOLD = 55; // score mínimo para sugerir

export async function reconcileClients(opts?: { sinceDays?: number }) {
  const db = await getDb();
  const since = new Date(Date.now() - (opts?.sinceDays ?? 3) * 24 * 3600 * 1000);

  // 1) Serviços YourBox recentes
  const services = await db.collection('services').find(
    { companyProvider: 'Yourbox', timestamp: { $gte: since } },
    { projection: { clientName: 1, points: 1, parameters: 1, timestamp: 1, nr: 1 } } as any,
  ).limit(500).toArray();

  // 2) Resolver telemóvel dos clientes (via users, pelo email = clientName)
  const emails = Array.from(new Set(services.map((s: any) => norm.email(s.clientName)).filter(Boolean))) as string[];
  const users = emails.length
    ? await db.collection('users').find(
        { 'emails.0.address': { $in: emails } },
        { projection: { 'emails.address': 1, 'profile.phoneNumber': 1 } } as any,
      ).toArray()
    : [];
  const phoneByEmail: Record<string, string | null> = {};
  for (const u of users as any[]) {
    const em = norm.email(u.emails?.[0]?.address);
    if (em) phoneByEmail[em] = norm.phone(u.profile?.phoneNumber);
  }

  let suggestions = 0;

  for (const svc of services as any[]) {
    const email = norm.email(svc.clientName);
    const phone = email ? phoneByEmail[email] ?? null : null;
    if (!email && !phone) continue;

    const pts: any[] = svc.points ?? [];
    const svcOrig = norm.token(pts.find((p) => p.collectionOrDelivery === 'collection')?.addressLocal);
    const svcDest = norm.token(pts.filter((p) => p.collectionOrDelivery === 'delivery').at(-1)?.addressLocal);
    const svcAt: Date | null = svc.timestamp ? new Date(svc.timestamp)
      : (svc.parameters?.dataHour ? new Date(svc.parameters.dataHour) : null);

    // Conversas candidatas (sem cliente ligado, sem sugestão dispensada)
    const or: any[] = [];
    if (phone) or.push({ 'data.telefone': phone }, { telemovel: phone });
    if (email) or.push({ 'data.email': email });
    if (!or.length) continue;

    const convs = await db.collection('conversations').find(
      { $or: or, clientId: { $exists: false }, clientMatchDismissed: { $ne: true } },
      { projection: { data: 1, telemovel: 1, createdAt: 1, quizVariante: 1 } } as any,
    ).limit(20).toArray();

    for (const c of convs as any[]) {
      const cPhone = norm.phone(c.data?.telefone) ?? norm.phone(c.telemovel);
      const cEmail = norm.email(c.data?.email);
      const cOrig = norm.token(c.data?.origem);
      const cDest = norm.token(c.data?.destino);

      let score = 0;
      const on: string[] = [];
      if (phone && cPhone === phone) { score += 60; on.push('telefone'); }
      if (email && cEmail === email) { score += 40; on.push('email'); }
      if (svcOrig && cOrig && svcOrig === cOrig) { score += 10; on.push('recolha'); }
      if (svcDest && cDest && svcDest === cDest) { score += 10; on.push('entrega'); }
      // O serviço deve ser POSTERIOR à conversa (senão é cliente pré-existente).
      if (svcAt && c.createdAt && svcAt.getTime() >= new Date(c.createdAt).getTime()) { score += 10; on.push('timing'); }

      if (score < SUGGEST_THRESHOLD) continue;

      await db.collection('conversations').updateOne(
        { _id: c._id },
        {
          $set: {
            clientMatch: {
              serviceNr: svc.nr ?? null,
              score,
              matchedOn: on,
              serviceRoute: (svcOrig || svcDest) ? `${svcOrig || '?'} -> ${svcDest || '?'}` : null,
              serviceAt: svcAt,
              at: new Date(),
            },
          },
        },
      );
      suggestions++;
    }
  }

  return { services: services.length, suggestions };
}
