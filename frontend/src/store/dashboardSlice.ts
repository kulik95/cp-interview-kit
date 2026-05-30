import { create } from 'zustand';

interface Widget {
  id: string;
  name: string;
  type: string;
  config: any;
  position: { x: number; y: number; w: number; h: number };
  data?: any;
}

interface Dashboard {
  id: string;
  name: string;
  description?: string;
  layout: string;
  widgets: Widget[];
  _count?: { widgets: number };
}

interface DashboardState {
  dashboards: Dashboard[];
  currentDashboard: Dashboard | null;
  isLoading: boolean;
  error: string | null;

  setDashboards: (dashboards: Dashboard[]) => void;
  addDashboard: (dashboard: Dashboard) => void;
  removeDashboard: (id: string) => void;
  setCurrentDashboard: (dashboard: Dashboard | null) => void;
  updateDashboard: (id: string, updates: Partial<Dashboard>) => void;

  addWidget: (dashboardId: string, widget: Widget) => void;
  updateWidget: (dashboardId: string, widgetId: string, updates: Partial<Widget>) => void;
  removeWidget: (dashboardId: string, widgetId: string) => void;
  setWidgetData: (dashboardId: string, widgetId: string, data: any) => void;
  reorderWidgets: (dashboardId: string, widgets: Widget[]) => void;
}

// Always return new objects/arrays so Zustand and React detect changes.
// Mutating in place (Object.assign, push, splice) often skips re-renders.
export const useDashboardStore = create<DashboardState>((set, get) => ({
  dashboards: [],
  currentDashboard: null,
  isLoading: false,
  error: null,

  setDashboards: (dashboards) => {
    set({ dashboards });
  },

  addDashboard: (dashboard) => {
    set({ dashboards: [...get().dashboards, dashboard] });
  },

  removeDashboard: (id) => {
    set({
      dashboards: get().dashboards.filter((d) => d.id !== id),
    });
  },

  setCurrentDashboard: (dashboard) => {
    set({ currentDashboard: dashboard });
  },

  updateDashboard: (id, updates) => {
    set({
      dashboards: get().dashboards.map((d) =>
        d.id === id ? { ...d, ...updates } : d
      ),
      currentDashboard:
        get().currentDashboard?.id === id
          ? { ...get().currentDashboard!, ...updates }
          : get().currentDashboard,
    });
  },

  addWidget: (dashboardId, widget) => {
    const withWidget = (dashboard: Dashboard): Dashboard =>
      dashboard.id === dashboardId
        ? { ...dashboard, widgets: [...dashboard.widgets, widget] }
        : dashboard;

    set({
      dashboards: get().dashboards.map(withWidget),
      currentDashboard: get().currentDashboard
        ? withWidget(get().currentDashboard)
        : null,
    });
  },

  updateWidget: (dashboardId, widgetId, updates) => {
    const withUpdatedWidget = (dashboard: Dashboard): Dashboard =>
      dashboard.id === dashboardId
        ? {
            ...dashboard,
            widgets: dashboard.widgets.map((w) =>
              w.id === widgetId ? { ...w, ...updates } : w
            ),
          }
        : dashboard;

    set({
      dashboards: get().dashboards.map(withUpdatedWidget),
      currentDashboard: get().currentDashboard
        ? withUpdatedWidget(get().currentDashboard)
        : null,
    });
  },

  removeWidget: (dashboardId, widgetId) => {
    const withoutWidget = (dashboard: Dashboard): Dashboard =>
      dashboard.id === dashboardId
        ? {
            ...dashboard,
            widgets: dashboard.widgets.filter((w) => w.id !== widgetId),
          }
        : dashboard;

    set({
      dashboards: get().dashboards.map(withoutWidget),
      currentDashboard: get().currentDashboard
        ? withoutWidget(get().currentDashboard)
        : null,
    });
  },

  setWidgetData: (dashboardId, widgetId, data) => {
    const current = get().currentDashboard;
    if (current?.id !== dashboardId) return;

    set({
      currentDashboard: {
        ...current,
        widgets: current.widgets.map((w) =>
          w.id === widgetId ? { ...w, data } : w
        ),
      },
    });
  },

  reorderWidgets: (dashboardId, widgets) => {
    set({
      dashboards: get().dashboards.map((d) =>
        d.id === dashboardId ? { ...d, widgets } : d
      ),
      currentDashboard:
        get().currentDashboard?.id === dashboardId
          ? { ...get().currentDashboard!, widgets }
          : get().currentDashboard,
    });
  },
}));
