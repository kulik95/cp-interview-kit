import { create } from 'zustand';

interface ErrorState {
  message: string | null;
  showError: (message: string) => void;
  clearError: () => void;
}

export const useErrorStore = create<ErrorState>((set) => ({
  message: null,
  showError: (message) => set({ message }),
  clearError: () => set({ message: null }),
}));
