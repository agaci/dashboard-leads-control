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

export async function reconcileClients(opts?: { sinceDays?: number; debug?: boolean }) {
  const db = await getDb();
  const since = new Date(Date.now() - (opts?.sinceDays ?? 3) * 24 * 3600 * 1000);

  // 1) Serviços YourBox recentes
  const services = await db.collection('services').find(
    { companyProvider: 'Yourbox', timestamp: { $gte: since } },
    opts?.debug ? {} : { projection: { clientName: 1, points: 1, parameters: 1, timestamp: 1, nr: 1 } } as any,
  ).limit(500).toArray();

  const debugOut: any = opts?.debug ? { serviceSamples: [], convSamples: [], matches: [], usersFound: 0 } : null;

  // 2) Resolver contacto dos clientes: svc.client = _id do utilizador (users) ->
  //    profile.phoneNumber / emails[0].address.
  const clientIds = Array.from(new Set(services.map((s: any) => s.client).filter((v: any) => typeof v === 'string'))) as string[];
  const users = clientIds.length
    ? await db.collection('users').find(
        { _id: { $in: clientIds } as any },
        { projection: { 'emails.address': 1, 'profile.phoneNumber': 1, 'profile.contactEmail': 1 } } as any,
      ).toArray()
    : [];
  const contactById: Record<string, { phone: string | null; email: string | null }> = {};
  for (const u of users as any[]) {
    contactById[String(u._id)] = {
      phone: norm.phone(u.profile?.phoneNumber),
      email: norm.email(u.emails?.[0]?.address) ?? norm.email(u.profile?.contactEmail),
    };
  }
  if (debugOut) {
    debugOut.usersFound = users.length;
    debugOut.clientIds = clientIds.length;
    debugOut.withPhone = Object.values(contactById).filter((c) => c.phone).length;
    debugOut.withEmail = Object.values(contactById).filter((c) => c.email).length;
  }

  let suggestions = 0;

  for (const svc of services as any[]) {
    const contact = (typeof svc.client === 'string' && contactById[svc.client]) || { phone: null, email: null };
    const email = contact.email;
    const phone = contact.phone;

    const pts: any[] = svc.points ?? [];
    const svcOrig = norm.token(pts[0]?.addressLocal);
    const svcDest = norm.token(pts.at(-1)?.addressLocal);
    const svcAt: Date | null = svc.timestamp ? new Date(svc.timestamp)
      : (svc.parameters?.dataHour ? new Date(svc.parameters.dataHour) : null);

    if (debugOut && debugOut.serviceSamples.length < 8) {
      debugOut.serviceSamples.push({
        nr: svc.nr,
        clientName: svc.clientName ?? null,
        clientId: svc.client ?? null,
        phoneResolved: phone,
        emailResolved: email,
        svcOrig, svcDest, svcAt,
      });
    }

    if (!email && !phone) continue;

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
      if (debugOut) debugOut.matches.push({
        convName: c.data?.nome ?? null, convPhone: cPhone, convEmail: cEmail,
        serviceNr: svc.nr, clientName: svc.clientName, svcPhone: phone, svcEmail: email,
        score, matchedOn: on,
      });
      suggestions++;
    }
  }

  if (debugOut) {
    const convs = await db.collection('conversations').find(
      { canal: 'web-quiz' },
      { projection: { 'data.telefone': 1, 'data.email': 1, 'data.origem': 1, 'data.destino': 1, telemovel: 1, createdAt: 1 } } as any,
    ).sort({ createdAt: -1 }).limit(4).toArray();
    debugOut.convSamples = (convs as any[]).map((c) => ({
      telefone: c.data?.telefone ?? null, telefoneNorm: norm.phone(c.data?.telefone) ?? norm.phone(c.telemovel),
      email: c.data?.email ?? null, telemovel: c.telemovel ?? null,
      origem: c.data?.origem ?? null, destino: c.data?.destino ?? null,
    }));
  }

  return { services: services.length, suggestions, ...(debugOut ? { debug: debugOut } : {}) };
}
