import { AxiosError } from 'axios';

export function getApiErrorMessage(
  error: unknown,
  fallback = 'Something went wrong'
): string {
  if (error instanceof AxiosError) {
    const data = error.response?.data as { error?: string; message?: string } | undefined;

    if (data?.error) {
      return data.error;
    }

    if (data?.message) {
      return data.message;
    }

    if (error.message) {
      return error.message;
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
