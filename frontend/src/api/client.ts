import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL as string,
});

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

api.interceptors.request.use((config) => {
  if (authToken) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

// A 401 here always means the token is missing/expired/invalid — clear it and bounce to /login,
// mirroring the old app's cookie-auth redirect-to-LoginPath behavior.
export function installUnauthorizedHandler(onUnauthorized: () => void) {
  api.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error?.response?.status === 401) onUnauthorized();
      return Promise.reject(error);
    },
  );
}
