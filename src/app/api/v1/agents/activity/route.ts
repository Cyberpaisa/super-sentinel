import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') ?? '3650', 10);
    if (isNaN(days) || days < 1 || days > 3650) {
      return NextResponse.json(
        { data: null, error: { message: 'Invalid days parameter. Must be between 1 and 3650.', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    // Raw query to get daily registration and verification counts
    // When days is very large (e.g. 3650 for "ALL"), we skip the date filter
    const rows = await prisma.$queryRaw<
      Array<{ date: Date; registrations: bigint; verifications: bigint }>
    >`
      SELECT
        DATE("created_at" AT TIME ZONE 'UTC') AS date,
        COUNT(*)                              AS registrations,
        COUNT(*) FILTER (WHERE status = 'VERIFIED') AS verifications
      FROM "agents"
      WHERE "created_at" >= NOW() - (${days} || ' days')::INTERVAL
      GROUP BY DATE("created_at" AT TIME ZONE 'UTC')
      ORDER BY date ASC
    `;

    const data = rows.map((r) => ({
      date:          r.date.toISOString().slice(0, 10),
      registrations: Number(r.registrations),
      verifications: Number(r.verifications),
    }));

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('[activity]', err);
    return NextResponse.json(
      { data: null, error: { message: 'Failed to fetch activity', code: 'INTERNAL' } },
      { status: 500 },
    );
  }
}
