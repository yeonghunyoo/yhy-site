import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { AppShell } from "./components/AppShell";
import { Spinner } from "./components/ui";
import { useMe } from "./lib/queries";
import { AccountDeletePage } from "./pages/AccountDelete";
import { DesignPage } from "./pages/Design";
import { DuplicatesPage } from "./pages/Duplicates";
import { InvitePage } from "./pages/Invite";
import { LandingPage } from "./pages/Landing";
import { LibraryPage } from "./pages/Library";
import { SettingsPage } from "./pages/Settings";
import { SignInPage } from "./pages/SignIn";
import { ResetPasswordPage, VerifiedPage } from "./pages/AuthResult";
import { SpaceDetailPage } from "./pages/SpaceDetail";
import { SpacesPage } from "./pages/Spaces";

function RequireAuth({ children }: { children: ReactNode }) {
  const me = useMe();
  const loc = useLocation();
  if (me.sessionPending) return <div className="flex justify-center py-32"><Spinner /></div>;
  if (!me.signedIn) return <Navigate to={`/signin?next=${encodeURIComponent(loc.pathname)}`} replace />;
  return children;
}

export function App() {
  return (
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
  );
}
