import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;

  // Verificar origin se fornecida
  const origin = req.headers.get('origin') ?? req.headers.get('referer') ?? '';

  try {
    const db = await getDb();
    const doc = await db.collection('widgetClients').findOne({ clientId, active: true });
    if (!doc) return Response.json({ error: 'Widget não encontrado' }, { status: 404 });

    // Validar allowedOrigins (se '*' ou lista)
    const allowed: string[] = doc.allowedOrigins ?? ['*'];
    if (!allowed.includes('*') && origin && !allowed.some((o: string) => origin.includes(o))) {
      return Response.json({ error: 'Origem não autorizada' }, { status: 403 });
    }

    return Response.json({
      success: true,
      config: {
        clientId:       doc.clientId,
        name:           doc.name,
        primaryColor:   doc.primaryColor   ?? '#bed62f',
        darkColor:      doc.darkColor      ?? '#1a1a1a',
        logoUrl:        doc.logoUrl        ?? null,
        whatsappNumber: doc.whatsappNumber ?? null,
        botName:        doc.botName        ?? 'Assistente',
        webhookUrl:     doc.webhookUrl     ?? null,
      },
    }, {
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
    },
  });
}
