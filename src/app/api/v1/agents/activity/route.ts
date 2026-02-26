import { NextRequest } from 'next/server';
import { z } from 'zod';
import { successResponse, handleError } from '@/lib/utils/api-helpers';
import { ValidationError } from '@/lib/utils/errors';
import { prisma } from '@/lib/database/prisma';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(3650).optional().default(3650),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      days: searchParams.get('days') ?? undefined,
    });

    if (!parsed.success) {
      const fields: Record<string, string> = {};
      parsed.error.errors.forEach((err) => {
        fields[err.path.join('.')] = err.message;
      });
      throw new ValidationError('Invalid query parameters', fields);
    }

    const { days } = parsed.data;

    // Raw query to get daily registration and verification counts
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

    return successResponse(data);
  } catch (error) {
    return handleError(error);
  }
}
