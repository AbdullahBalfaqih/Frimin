import { NextRequest, NextResponse } from 'next/server';
import { verifyTrailChain } from '@/lib/crypto-trail';
import { readTrailRecords } from '@/lib/engine-store';
import { getSqliteDiagnosticsCount } from '@/lib/sqlite-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const format = req.nextUrl.searchParams.get('format');
  const records = readTrailRecords();
  const sqliteStats = getSqliteDiagnosticsCount();
  const verification = {
    ...verifyTrailChain(records),
    sqliteSynced: sqliteStats.trailCount >= records.length,
  };

  if (format === 'jsonl') {
    const body = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Content-Disposition':
          'attachment; filename="frimin-audit-trail.jsonl"',
      },
    });
  }

  return NextResponse.json({
    ok: true,
    system: 'Frimin',
    sqliteStats,
    verification,
    count: records.length,
    records,
  });
}
