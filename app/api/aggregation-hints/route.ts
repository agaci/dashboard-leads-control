import { NextRequest } from 'next/server';
import { findAggregationHints } from '@/lib/agent/aggregation';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const origem = searchParams.get('origem');
    const destino = searchParams.get('destino');

    if (!origem || !destino) {
      return Response.json({ error: 'origem e destino são obrigatórios' }, { status: 400 });
    }

    const result = await findAggregationHints(origem, destino);

    return Response.json({ success: true, ...result });
  } catch (err: any) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
