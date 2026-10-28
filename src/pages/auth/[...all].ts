import type { APIRoute } from 'astro';
import { getAuth } from '../../lib/server/auth';

export const prerender = false;

// Better Auth 엔드포인트 전체: /auth/sign-in/magic-link, /auth/magic-link/verify, /auth/callback/google ...
export const ALL: APIRoute = ({ request }) => getAuth().handler(request);
