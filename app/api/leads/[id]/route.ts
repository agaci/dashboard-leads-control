import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db  = await getDb();
    const doc = await db.collection('messages').findOne({ _id: new ObjectId(id) });
    if (!doc) return Response.json({ error: 'not found' }, { status: 404 });

    // Procurar breakdown da conversa associada, se houver
    let priceBreakdown = null;
    if (doc.leadData?.telemovel) {
      const conv = await db.collection('conversations').findOne({
        telemovel: doc.leadData.telemovel,
        leadId: doc._id.toString(),
      });
      if (conv?.data?.priceBreakdown) {
        priceBreakdown = conv.data.priceBreakdown;
      }
    }

    const leadData = {
      ...doc.leadData,
      ...(priceBreakdown && { priceBreakdown }),
    };

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
      },
    });
  } catch {
    return Response.json({ error: 'invalid id' }, { status: 400 });
  }
}
