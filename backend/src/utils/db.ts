import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

export async function findUsersBySearch(searchTerm: string, orgId: string): Promise<any[]> {
  return prisma.user.findMany({
    where: {
      organizationId: orgId,
      OR: [
        { name: { contains: searchTerm, mode: 'insensitive' } },
        { email: { contains: searchTerm, mode: 'insensitive' } },
      ],
    },
  });
}

export async function getAnalyticsByFilter(
  orgId: string,
  eventType: string,
  startDate: string,
  endDate: string
): Promise<any[]> {
  return prisma.$queryRaw`
    SELECT
      DATE_TRUNC('day', timestamp) as date,
      "eventType",
      COUNT(*) as count
    FROM "AnalyticsEvent"
    WHERE "organizationId" = ${orgId}
    AND "eventType" = ${eventType}
    AND timestamp >= ${new Date(startDate)}
    AND timestamp <= ${new Date(endDate)}
    GROUP BY DATE_TRUNC('day', timestamp), "eventType"
    ORDER BY date DESC
  `;
}

export async function getAuditLogs(
  orgId: string,
  orderBy: string = 'createdAt',
  order: string = 'DESC'
): Promise<any[]> {
  // Validate orderBy to prevent injection
  const validOrderByFields = ['createdAt', 'id', 'userId', 'action', 'resourceType'];
  if (!validOrderByFields.includes(orderBy)) {
    orderBy = 'createdAt';
  }

  const validOrder = order.toUpperCase() === 'ASC' ? 'asc' : 'desc';

  return prisma.auditLog.findMany({
    where: { organizationId: orgId },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
    orderBy: { [orderBy]: validOrder },
  });
}

export async function queryDashboards(
  filters: Record<string, any>
): Promise<any[]> {
  const where = {};

  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null) {
      // Only allow specific fields to prevent injection
      if (['organizationId', 'id', 'name', 'isPublic'].includes(key)) {
        (where as any)[key] = value;
      }
    }
  }

  return prisma.dashboard.findMany({ where });
}

export async function searchEvents(
  orgId: string,
  searchQuery: string
): Promise<any[]> {
  return prisma.analyticsEvent.findMany({
    where: {
      organizationId: orgId,
      OR: [
        { eventName: { contains: searchQuery, mode: 'insensitive' } },
        { properties: { search: searchQuery } }, // Requires full-text search config
      ],
    },
    take: 1000,
  });
}

export async function safeGetAnalytics(
  orgId: string,
  eventType: string,
  startDate: Date,
  endDate: Date
): Promise<any[]> {
  return prisma.$queryRaw`
    SELECT
      DATE_TRUNC('day', timestamp) as date,
      "eventType",
      COUNT(*) as count
    FROM "AnalyticsEvent"
    WHERE "organizationId" = ${orgId}
    AND "eventType" = ${eventType}
    AND timestamp >= ${startDate}
    AND timestamp <= ${endDate}
    GROUP BY DATE_TRUNC('day', timestamp), "eventType"
    ORDER BY date DESC
  `;
}

export async function bulkInsertEvents(
  events: Array<{
    organizationId: string;
    eventType: string;
    eventName: string;
    properties: any;
  }>
): Promise<void> {
  if (events.length === 0) return;

  await prisma.analyticsEvent.createMany({
    data: events.map(e => ({
      organizationId: e.organizationId,
      eventType: e.eventType,
      eventName: e.eventName,
      properties: e.properties,
      timestamp: new Date(),
    })),
    skipDuplicates: true,
  });
}

export async function getTableData(tableName: string, limit: number = 100): Promise<any[]> {
  // Limit to safe tables to prevent generic query injection
  const safeTables = ['Dashboard', 'Widget', 'User', 'Organization', 'AnalyticsEvent'];
  
  if (!safeTables.includes(tableName)) {
    throw new Error(`Invalid table: ${tableName}`);
  }

  if (limit < 1 || limit > 1000) {
    limit = 100;
  }

  // Use type-safe Prisma queries instead
  switch (tableName) {
    case 'Dashboard':
      return prisma.dashboard.findMany({ take: limit });
    case 'Widget':
      return prisma.widget.findMany({ take: limit });
    case 'User':
      return prisma.user.findMany({
        take: limit,
        select: { id: true, name: true, email: true, role: true },
      });
    case 'Organization':
      return prisma.organization.findMany({ take: limit });
    case 'AnalyticsEvent':
      return prisma.analyticsEvent.findMany({ take: limit });
    default:
      return [];
  }
}
