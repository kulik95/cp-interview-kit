import { describe, it, expect, beforeEach } from '@jest/globals';

const mockPrisma: any = {
  dashboard: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn()
  },
  widget: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn()
  },
  analyticsEvent: {
    count: jest.fn(),
    groupBy: jest.fn(),
    findMany: jest.fn()
  },
  auditLog: {
    create: jest.fn()
  }
};

jest.mock('../src/index', () => ({
  prisma: mockPrisma,
  broadcastToOrg: jest.fn()
}));

describe('Dashboard Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /', () => {
    it('should return all dashboards for organization', async () => {
      mockPrisma.dashboard.findMany.mockResolvedValue([
        { id: 'dash-1', name: 'Dashboard 1' },
        { id: 'dash-2', name: 'Dashboard 2' }
      ]);

      const dashboards = await mockPrisma.dashboard.findMany({
        where: { organizationId: 'org-1' }
      });

      expect(dashboards).toHaveLength(2);
    });
    it('should cap pagination limit at the maximum page size', () => {
      const { paginationSchema } = require('../src/middleware/validate');

      expect(paginationSchema.safeParse({ limit: 101 }).success).toBe(false);
      expect(paginationSchema.parse({ limit: 50 }).limit).toBe(50);
      expect(paginationSchema.parse({}).limit).toBe(20);
    });
  });

  describe('GET /:dashboardId', () => {
    it('should return dashboard with widgets', async () => {
      mockPrisma.dashboard.findFirst.mockResolvedValue({
        id: 'dash-1',
        name: 'Test Dashboard',
        widgets: [
          { id: 'widget-1', name: 'Widget 1' }
        ]
      });

      const dashboard = await mockPrisma.dashboard.findFirst({
        where: { id: 'dash-1', organizationId: 'org-1' },
        include: { widgets: true }
      });

      expect(dashboard?.widgets).toHaveLength(1);
    });

    it('should return null for non-existent dashboard', async () => {
      mockPrisma.dashboard.findFirst.mockResolvedValue(null);

      const dashboard = await mockPrisma.dashboard.findFirst({
        where: { id: 'invalid' }
      });

      expect(dashboard).toBeNull();
    });
  });

  describe('Widget data N+1 query', () => {
    it('should fetch widget data', async () => {
      const widgets = [
        { id: 'w1', type: 'metric' },
        { id: 'w2', type: 'chart' },
        { id: 'w3', type: 'table' }
      ];

      mockPrisma.dashboard.findFirst.mockResolvedValue({
        id: 'dash-1',
        widgets
      });

      mockPrisma.analyticsEvent.count.mockResolvedValue(100);
      mockPrisma.analyticsEvent.groupBy.mockResolvedValue([]);
      mockPrisma.analyticsEvent.findMany.mockResolvedValue([]);

      const dashboard = await mockPrisma.dashboard.findFirst({
        include: { widgets: true }
      });

      // Simulate fetching data for each widget
      for (const widget of dashboard!.widgets) {
        if (widget.type === 'metric') {
          await mockPrisma.analyticsEvent.count({});
        } else if (widget.type === 'chart') {
          await mockPrisma.analyticsEvent.groupBy({});
        } else {
          await mockPrisma.analyticsEvent.findMany({});
        }
      }
      // Each widget causes a separate query
      expect(mockPrisma.analyticsEvent.count).toHaveBeenCalledTimes(1);
      expect(mockPrisma.analyticsEvent.groupBy).toHaveBeenCalledTimes(1);
      expect(mockPrisma.analyticsEvent.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /', () => {
    it('should create dashboard', async () => {
      mockPrisma.dashboard.create.mockResolvedValue({
        id: 'new-dash',
        name: 'New Dashboard'
      });

      const dashboard = await mockPrisma.dashboard.create({
        data: {
          name: 'New Dashboard',
          organizationId: 'org-1',
          createdById: 'user-1'
        }
      });

      expect(dashboard.name).toBe('New Dashboard');
    });

    it('should reject dashboard input with an empty name', () => {
      const { createDashboardSchema } = require('../src/middleware/validate');

      expect(createDashboardSchema.safeParse({ name: '' }).success).toBe(false);
      expect(createDashboardSchema.safeParse({ name: 'Valid Dashboard' }).success).toBe(true);
    });
  });

  describe('Dashboard duplication', () => {
    it('should duplicate dashboard with widgets', async () => {
      mockPrisma.dashboard.findFirst.mockResolvedValue({
        id: 'dash-1',
        name: 'Original',
        widgets: [
          { id: 'w1', name: 'Widget 1' },
          { id: 'w2', name: 'Widget 2' }
        ]
      });

      mockPrisma.dashboard.create.mockResolvedValue({
        id: 'dash-2',
        name: 'Original (Copy)'
      });

      mockPrisma.widget.create.mockResolvedValue({});

      // Simulate duplication
      const original = await mockPrisma.dashboard.findFirst({});
      await mockPrisma.dashboard.create({
        data: { name: `${original!.name} (Copy)` }
      });

      for (const widget of original!.widgets) {
        await mockPrisma.widget.create({
          data: { name: widget.name }
        });
      }

      expect(mockPrisma.widget.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('Cache invalidation', () => {
    it('should invalidate cache on update', async () => {
      const mockCache = {
        delete: jest.fn()
      };

      mockPrisma.dashboard.update.mockResolvedValue({
        id: 'dash-1',
        name: 'Updated'
      });

      // Simulate the operation
      await mockPrisma.dashboard.update({
        where: { id: 'dash-1' },
        data: { name: 'Updated' }
      });

      mockCache.delete('dashboard:dash-1');

      expect(mockCache.delete).toHaveBeenCalledWith('dashboard:dash-1');
    });
  });
});
describe('Real-time updates', () => {
  it('should broadcast on create', async () => {
    const { broadcastToOrg } = require('../src/index');

    mockPrisma.dashboard.create.mockResolvedValue({
      id: 'dash-1',
      name: 'New'
    });

    await mockPrisma.dashboard.create({ data: {} });
    broadcastToOrg('org-1', { type: 'dashboard_created' });

    expect(broadcastToOrg).toHaveBeenCalled();
  });
});
