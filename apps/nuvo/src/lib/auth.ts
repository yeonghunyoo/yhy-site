import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({ basePath: "/api/auth" });
export const { useSession, signIn, signUp, signOut, requestPasswordReset, resetPassword, sendVerificationEmail } = authClient;

/** Better Auth 오류 → 한국어 안내 */
export function authErrorMessage(err: { code?: string; status?: number; message?: string } | null | undefined) {
  if (!err) return "잠시 후 다시 시도해 주세요";
  if (err.status === 429) return "요청이 너무 많아요. 잠시 후 다시 시도해 주세요";
  switch (err.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "이메일 또는 비밀번호가 맞지 않아요";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "이미 가입된 이메일이에요. 로그인하거나 비밀번호를 재설정해 주세요";
    case "EMAIL_NOT_VERIFIED":
      return "이메일 인증이 아직 안 됐어요. 인증 메일을 다시 보냈어요";
    case "PASSWORD_TOO_SHORT":
      return "비밀번호는 8자 이상이어야 해요";
    case "PASSWORD_TOO_LONG":
      return "비밀번호가 너무 길어요";
    case "INVALID_EMAIL":
      return "이메일 형식을 확인해 주세요";
    case "INVALID_TOKEN":
      return "링크가 만료됐거나 이미 사용됐어요";
    default:
      return "잠시 후 다시 시도해 주세요";
  }
}
