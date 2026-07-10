import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db  = await getDb();
    const doc = await db.collection('messages').findOne({ _id: new ObjectId(id) });
    if (!doc) return Response.json({ error: 'not found' }, { status: 404 });

    // Procurar breakdown — primeiro em leadData (novo), depois em conversa (fallback)
    let priceBreakdown = doc.leadData?.priceBreakdown || null;

    if (!priceBreakdown && doc.leadData?.telemovel) {
      const conv = await db.collection('conversations').findOne({
        $or: [
          { telemovel: doc.leadData.telemovel, leadId: doc._id.toString() },
          { leadId: doc._id.toString() },
        ],
      });
      if (conv?.data?.priceBreakdown) {
        priceBreakdown = conv.data.priceBreakdown;
      }
    }

    const leadData = {
      ...doc.leadData,
      ...(priceBreakdown && { priceBreakdown }),
    };

    // Sugestão "provável cliente" — vive na CONVERSA (fonte única). Procuramos pela
    // conversa com o mesmo telemóvel que tenha um clientMatch aberto (não convertida).
    let clientMatch: any = null;
    let convId: string | null = null;
    const telDigits = String(doc.leadData?.telefone ?? '').replace(/\D/g, '');
    const phone = /(\d{9})$/.test(telDigits) ? telDigits.slice(-9) : null;
    if (phone && !doc.clientId) {
      const conv = await db.collection('conversations').findOne(
        { $or: [{ 'data.telefone': phone }, { telemovel: phone }], clientMatch: { $exists: true }, clientId: { $exists: false } },
        { projection: { clientMatch: 1 } },
      );
      if (conv?.clientMatch) { clientMatch = conv.clientMatch; convId = conv._id.toString(); }
    }

    return Response.json({
      success: true,
      lead: {
        id:          doc._id.toString(),
        messageType: doc.messageType,
        timeStamp:   doc.timeStamp,
        closed:      doc.closed,
        closedAt:    doc.closedAt,
        message:     doc.message,
        senderName:  doc.senderName,
        variante:    doc.variante ?? null,
        leadData,
        clientId:    doc.clientId ?? null,
        clientMatch,
        convId,
      },
    });
  } catch {
    return Response.json({ error: 'invalid id' }, { status: 400 });
  }
}

// Apagar uma lead (só administrador). Hard delete: sai de todas as estatísticas.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'administrator') {
    return Response.json({ error: 'Sem permissão' }, { status: 403 });
  }
  try {
    const { id } = await params;
    const db = await getDb();
    const r = await db.collection('messages').deleteOne({ _id: new ObjectId(id) });
    return Response.json({ success: true, deleted: r.deletedCount });
  } catch {
    return Response.json({ error: 'invalid id' }, { status: 400 });
  }
}
