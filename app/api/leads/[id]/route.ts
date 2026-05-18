import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const db  = await getDb();
    const doc = await db.collection('messages').findOne({ _id: new ObjectId(params.id) });
    if (!doc) return Response.json({ error: 'not found' }, { status: 404 });
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
        leadData:    doc.leadData ?? {},
        clientId:    doc.clientId ?? null,
      },
    });
  } catch {
    return Response.json({ error: 'invalid id' }, { status: 400 });
  }
}
