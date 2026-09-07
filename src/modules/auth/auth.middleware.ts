import type { RequestHandler } from "express";
import { AppError, ForbiddenError } from "../../common/errors/app-error";
import { getAccessTokenFromCookie } from "../../common/cookies/auth-cookie";
import { authenticateToken, publicUser } from "./auth.service";
import type { AuthRole } from "./auth.validation";

/** 타 도메인이 동일한 서버 인증과 역할/프로필 정책을 재사용할 수 있는 미들웨어입니다. */
export function requireAuth(role?: AuthRole, requireProfile = false): RequestHandler {
  return async (request,response,next) => {
    try {
      const session = await authenticateToken(getAccessTokenFromCookie(request));
      if (role && session.user.role !== role) throw new ForbiddenError("역할에 맞는 계정으로 로그인해 주세요.","ROLE_MISMATCH");
      if (requireProfile && !session.user.profileCompleted) throw new ForbiddenError("프로필 등록이 필요합니다.","PROFILE_REQUIRED");
      response.locals.auth = {user:publicUser(session.user),sessionId:session.id};
      next();
    } catch(error) { next(error); }
  };
}

/** 단일 서버용 IP 제한. 만료된 키를 지우며 무제한 메모리 증가를 방지합니다. */
export function authRateLimit(limit = 30, windowMs = 60_000): RequestHandler {
  const buckets = new Map<string,{count:number;until:number}>();
  return (request,response,next) => {
    const now = Date.now();
    for (const [key,bucket] of buckets) if (bucket.until <= now) buckets.delete(key);
    const key = request.ip ?? "unknown";
    const bucket = buckets.get(key) ?? {count:0,until:now+windowMs};
    if (!buckets.has(key) && buckets.size >= 10000) { next(new AppError({status:429,code:"RATE_LIMITED",message:"잠시 후 다시 시도해 주세요."})); return; }
    bucket.count++; buckets.set(key,bucket);
    if (bucket.count > limit) {response.set("Retry-After",String(Math.ceil((bucket.until-now)/1000)));next(new AppError({status:429,code:"RATE_LIMITED",message:"요청이 많습니다. 잠시 후 다시 시도해 주세요."}));return;}
    next();
  };
}
