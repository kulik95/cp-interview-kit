import { create } from 'zustand';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
  organization?: Organization;
}

interface Organization {
  id: string;
  name: string;
  slug: string;
  tier: string;
}

interface AuthState {
  user: User | null;
  organization: Organization | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User | null) => void;
  setOrganization: (org: Organization | null) => void;
  checkAuth: () => Promise<void>;
}

function clearStoredAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

// Zustand is the runtime source of truth; localStorage is persistence only (read/written here).
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  organization: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      set({
        user: data.user,
        organization: data.user.organization,
        token: data.token,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error: any) {
      set({
        error: error.message,
        isLoading: false,
        isAuthenticated: false,
        token: null,
      });
      throw error;
    }
  },

  logout: () => {
    clearStoredAuth();

    set({
      user: null,
      organization: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    });
  },

  setUser: (user) => {
    set({ user });
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    }
  },

  setOrganization: (organization) => {
    set({ organization });
  },

  checkAuth: async () => {
    set({ isLoading: true });

    const storedToken = localStorage.getItem('token');

    if (!storedToken) {
      set({
        user: null,
        organization: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      });
      return;
    }

    try {
      const response = await fetch('/api/auth/verify', {
        headers: {
          Authorization: `Bearer ${storedToken}`,
        },
      });

      const data = await response.json();

      if (data.valid) {
        const storedUser = localStorage.getItem('user');
        const user = storedUser ? JSON.parse(storedUser) : data.user;

        set({
          user,
          organization: user?.organization ?? null,
          token: storedToken,
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        clearStoredAuth();
        set({
          user: null,
          organization: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
        });
      }
    } catch (error) {
      console.log('Auth check failed:', error);
      clearStoredAuth();
      set({
        user: null,
        organization: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },
}));
