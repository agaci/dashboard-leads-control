import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';

async function getCalcName(db: Awaited<ReturnType<typeof getDb>>): Promise<string> {
  const cfg = await db.collection('routingConfig').findOne({ _id: 'yourbox_main' as any });
  return (cfg as any)?.calcPriceMachine ?? process.env.CALC_PRICE_MACHINE ?? 'calculator_1_FixCityPriceAPI';
}

export async function GET() {
  try {
    const db = await getDb();
    const calcName = await getCalcName(db);
    const doc = await db.collection('calculators').findOne(
      { name: calcName, companyProvider: 'Yourbox' },
      { projection: { _id: 0 } }
    );
    if (!doc) return Response.json({ error: 'Calculadora não encontrada', name: calcName }, { status: 404 });
    return Response.json({ success: true, calculator: doc, name: calcName });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const db = await getDb();
    const calcName = await getCalcName(db);
    const { discountPercent, type2, type50, type150, type300, globalParameters, outOfHoursFees,
      percentPlusMaxForcalcPriceMachineForAPIFromSiteYourbox,
      percentPlusMinForcalcPriceMachineForAPIFromSiteYourbox } = body;

    await db.collection('calculators').updateOne(
      { name: calcName, companyProvider: 'Yourbox' },
      { $set: {
        discountPercent,
        type2, type50, type150, type300,
        globalParameters,
        outOfHoursFees,
        percentPlusMaxForcalcPriceMachineForAPIFromSiteYourbox,
        percentPlusMinForcalcPriceMachineForAPIFromSiteYourbox,
        updatedAt: new Date(),
      }}
    );
    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
