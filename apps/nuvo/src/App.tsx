import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { AppShell } from "./components/AppShell";
import { Spinner } from "./components/ui";
import { useMe } from "./lib/queries";
import { LandingPage } from "./pages/Landing";

// 랜딩만 첫 번들에 두고 나머지 화면은 필요할 때 받는다 (랜딩 첫 로드를 줄여 검색 성능에 도움, docs/seo.md 6)
const page = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })));
const AccountDeletePage = page(() => import("./pages/AccountDelete"), "AccountDeletePage");
const DesignPage = page(() => import("./pages/Design"), "DesignPage");
const DuplicatesPage = page(() => import("./pages/Duplicates"), "DuplicatesPage");
const InvitePage = page(() => import("./pages/Invite"), "InvitePage");
const LibraryPage = page(() => import("./pages/Library"), "LibraryPage");
const SettingsPage = page(() => import("./pages/Settings"), "SettingsPage");
const SignInPage = page(() => import("./pages/SignIn"), "SignInPage");
const ResetPasswordPage = page(() => import("./pages/AuthResult"), "ResetPasswordPage");
const VerifiedPage = page(() => import("./pages/AuthResult"), "VerifiedPage");
const SpaceDetailPage = page(() => import("./pages/SpaceDetail"), "SpaceDetailPage");
const SpacesPage = page(() => import("./pages/Spaces"), "SpacesPage");

function RequireAuth({ children }: { children: ReactNode }) {
  const me = useMe();
  const loc = useLocation();
  if (me.sessionPending) return <div className="flex justify-center py-32"><Spinner /></div>;
  if (!me.signedIn) return <Navigate to={`/signin?next=${encodeURIComponent(loc.pathname)}`} replace />;
  return children;
}

export function App() {
  return (
    <Suspense fallback={<div className="flex justify-center py-32"><Spinner /></div>}>
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/signin" element={<SignInPage />} />
      <Route path="/verified" element={<VerifiedPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/library" element={<AppShell><LibraryPage /></AppShell>} />
      <Route path="/library/duplicates" element={<AppShell><RequireAuth><DuplicatesPage /></RequireAuth></AppShell>} />
      <Route path="/spaces" element={<AppShell><RequireAuth><SpacesPage /></RequireAuth></AppShell>} />
      <Route path="/spaces/:id" element={<AppShell><RequireAuth><SpaceDetailPage /></RequireAuth></AppShell>} />
      <Route path="/spaces/:id/duplicates" element={<AppShell><RequireAuth><DuplicatesPage /></RequireAuth></AppShell>} />
      <Route path="/invite/:token" element={<AppShell><InvitePage /></AppShell>} />
      <Route path="/settings" element={<AppShell><SettingsPage /></AppShell>} />
      {/* 스토어 등록정보에 넣는 계정 삭제 주소 (Google Play 요건) */}
      <Route path="/account/delete" element={<AppShell><AccountDeletePage /></AppShell>} />
      <Route path="/design" element={<AppShell><DesignPage /></AppShell>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}
