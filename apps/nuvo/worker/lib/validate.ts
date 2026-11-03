import { zValidator } from "@hono/zod-validator";
import { HTTPException } from "hono/http-exception";
import type { ValidationTargets } from "hono";
import type { ZodType } from "zod";

/** zod 검증 실패 시 400 + 한국어 메시지 (응답 타입에 오류 형태가 섞이지 않게 throw) */
export const validate = <T extends ZodType, Target extends keyof ValidationTargets>(target: Target, schema: T) =>
  zValidator(target, schema, (result) => {
    if (!result.success) throw new HTTPException(400, { message: "입력값이 올바르지 않아요" });
  });
