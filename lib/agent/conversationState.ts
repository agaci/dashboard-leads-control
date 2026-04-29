import { getDb } from '@/lib/mongodb';
import type { Conversation, ConversationStep, ConversationData, ConversationMessage } from '@/types/agent';

export async function getConversation(telemovel: string): Promise<Conversation | null> {
  const db = await getDb();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // expirar após 24h de inactividade
  return db.collection('conversations').findOne({
    telemovel,
    step: { $nin: ['CLOSED', 'LEAD_REGISTERED'] },
    updatedAt: { $gte: cutoff },
  }) as any;
}

export async function createConversation(telemovel: string, canal: Conversation['canal']): Promise<Conversation> {
  const db = await getDb();
  const doc: Omit<Conversation, '_id'> = {
    telemovel,
    canal,
    step: 'INIT',
    data: { telemovel, objectionCount: 0 },
    history: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const result = await db.collection('conversations').insertOne(doc);
  return { ...doc, _id: result.insertedId.toString() };
}

export async function updateConversation(
  telemovel: string,
  step: ConversationStep,
  dataUpdate: Partial<ConversationData>,
  botMessage: string,
  leadMessage: string,
  situacaoId?: string
): Promise<void> {
  const db = await getDb();
  const now = new Date();

  const newMessages: ConversationMessage[] = [];
  if (leadMessage) newMessages.push({ role: 'lead', text: leadMessage, timestamp: now });
  if (botMessage)  newMessages.push({ role: 'bot',  text: botMessage,  timestamp: now, situacaoId });

  await db.collection('conversations').updateOne(
    { telemovel, step: { $nin: ['CLOSED', 'LEAD_REGISTERED'] } },
    {
      $set: {
        step,
        updatedAt: now,
        ...(dataUpdate ? { [`data`]: undefined } : {}),
      },
      $push: { history: { $each: newMessages } } as any,
      $inc: {},
    }
  );

  // Actualizar campos de data separadamente para merge correcto
  await db.collection('conversations').updateOne(
    { telemovel, step },
    { $set: Object.fromEntries(Object.entries(dataUpdate).map(([k, v]) => [`data.${k}`, v])) }
  );
}

export async function setConversationStep(
  telemovel: string,
  step: ConversationStep,
  extra: Partial<Conversation> = {}
): Promise<void> {
  const db = await getDb();
  await db.collection('conversations').updateOne(
    { telemovel, step: { $nin: ['CLOSED', 'LEAD_REGISTERED'] } },
    { $set: { step, updatedAt: new Date(), ...extra } }
  );
}

export async function appendMessage(
  telemovel: string,
  message: ConversationMessage
): Promise<void> {
  const db = await getDb();
  await db.collection('conversations').updateOne(
    { telemovel, step: { $nin: ['CLOSED', 'LEAD_REGISTERED'] } },
    { $push: { history: message } as any, $set: { updatedAt: new Date() } }
  );
}

export async function updateConversationData(
  telemovel: string,
  dataUpdate: Partial<ConversationData>
): Promise<void> {
  const db = await getDb();
  const setFields = Object.fromEntries(
    Object.entries(dataUpdate).map(([k, v]) => [`data.${k}`, v])
  );
  await db.collection('conversations').updateOne(
    { telemovel, step: { $nin: ['CLOSED', 'LEAD_REGISTERED'] } },
    { $set: { ...setFields, updatedAt: new Date() } }
  );
}

export async function closeConversation(telemovel: string, leadId?: string): Promise<void> {
  const db = await getDb();
  await db.collection('conversations').updateOne(
    { telemovel, step: { $nin: ['CLOSED'] } },
    { $set: { step: 'LEAD_REGISTERED', closedAt: new Date(), updatedAt: new Date(), ...(leadId ? { leadId } : {}) } }
  );
}

export async function escalateConversation(telemovel: string): Promise<void> {
  const db = await getDb();
  await db.collection('conversations').updateOne(
    { telemovel, step: { $nin: ['CLOSED', 'LEAD_REGISTERED'] } },
    { $set: { step: 'ESCALATED_TO_HUMAN', escalatedAt: new Date(), updatedAt: new Date() } }
  );
}
