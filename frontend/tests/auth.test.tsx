import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAuthStore } from '../src/store/authSlice';

const initialState = {
  user: null,
  organization: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
};

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  role: 'owner',
  organizationId: 'org-1',
  organization: { id: 'org-1', name: 'Test Org', slug: 'test-org', tier: 'pro' },
};

describe('Auth Store', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    useAuthStore.setState(initialState);
  });

  describe('login', () => {
    it('should authenticate and persist the token on success', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: true,
          json: async () => ({ token: 'jwt-123', user: mockUser }),
        }))
      );

      await useAuthStore.getState().login('test@example.com', 'password');

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.token).toBe('jwt-123');
      expect(state.user?.email).toBe('test@example.com');
      expect(state.error).toBeNull();
      expect(localStorage.getItem('token')).toBe('jwt-123');
    });

    it('should set an error and stay unauthenticated on failure', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: false,
          json: async () => ({ error: 'Invalid credentials' }),
        }))
      );

      await expect(
        useAuthStore.getState().login('test@example.com', 'wrong')
      ).rejects.toThrow('Invalid credentials');

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.token).toBeNull();
      expect(state.error).toBe('Invalid credentials');
      expect(localStorage.getItem('token')).toBeNull();
    });
  });

  describe('logout', () => {
    it('should clear auth state and stored credentials', () => {
      localStorage.setItem('token', 'jwt-123');
      localStorage.setItem('user', JSON.stringify(mockUser));
      useAuthStore.setState({ user: mockUser, token: 'jwt-123', isAuthenticated: true });

      useAuthStore.getState().logout();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.token).toBeNull();
      expect(state.user).toBeNull();
      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('user')).toBeNull();
    });
  });

  describe('checkAuth', () => {
    it('should remain unauthenticated when no token is stored', async () => {
      await useAuthStore.getState().checkAuth();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.token).toBeNull();
      expect(state.isLoading).toBe(false);
    });
  });
});
