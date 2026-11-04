import { createAuthClient } from 'better-auth/react';
import { magicLinkClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  // 빌드 때(SSR) 렌더되는 아일랜드에서도 만들어지므로 window가 없을 때를 대비한다.
  baseURL: typeof window === 'undefined' ? 'http://localhost' : window.location.origin,
  basePath: '/auth',
  plugins: [magicLinkClient()],
});
