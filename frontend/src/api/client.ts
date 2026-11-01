import { createDemoApi, SESSION_KEY } from './demo';
import { createHttpApi } from './http';
import type { Api } from './types';

const apiUrl = import.meta.env.VITE_API_URL as string | undefined;

/** With VITE_API_URL set the app talks to FastAPI; otherwise it runs the in-browser demo. */
export const api: Api = apiUrl
  ? createHttpApi(apiUrl.replace(/\/$/, ''), () => localStorage.getItem(SESSION_KEY))
  : createDemoApi();

export { SESSION_KEY };
