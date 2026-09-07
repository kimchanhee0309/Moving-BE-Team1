import { UnauthorizedError } from "../../common/errors/app-error";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import type { User } from "../../generated/prisma/client";
import { randomToken, tokenHash } from "./auth.crypto";

/** DB 모델에서 비밀번호·세션 값 등을 제거한 공개 인증 DTO입니다. */
export function publicUser(user: User) {
  return { id:user.id, name:user.name, email:user.email, phone:user.phone, role:user.role, profileCompleted:user.profileCompleted };
}

function tokenPair() {
  const accessToken = randomToken(), refreshToken = randomToken();
  return { tokens:{accessToken,refreshToken}, data:{accessTokenHash:tokenHash(accessToken),refreshTokenHash:tokenHash(refreshToken),accessExpiresAt:new Date(Date.now()+env.ACCESS_TOKEN_MAX_AGE_MS)} };
}

export async function createSession(userId: string) {
  const pair = tokenPair();
  await prisma.session.create({data:{userId,...pair.data,expiresAt:new Date(Date.now()+env.REFRESH_TOKEN_MAX_AGE_MS)}});
  return pair.tokens;
}

/** DB 세션을 매 요청 확인해 로그아웃 직후 액세스 토큰도 무효화합니다. */
export async function authenticateToken(token: string | null) {
  if (!token || token.length > 128) throw new UnauthorizedError();
  const session = await prisma.session.findUnique({where:{accessTokenHash:tokenHash(token)},include:{user:true}});
  if (!session || session.revokedAt || session.expiresAt <= new Date() || session.accessExpiresAt <= new Date()) throw new UnauthorizedError();
  return session;
}

/** 조건부 UPDATE로 동시 refresh 중 하나만 성공하도록 하며 절대 세션 만료는 연장하지 않습니다. */
export async function refreshSession(token: string | null) {
  if (!token || token.length > 128) throw new UnauthorizedError();
  const hash = tokenHash(token);
  const session = await prisma.session.findUnique({where:{refreshTokenHash:hash},include:{user:true}});
  if (!session || session.revokedAt || session.expiresAt <= new Date()) throw new UnauthorizedError();
  const pair = tokenPair();
  await prisma.$transaction(async(tx)=>{
    const updated = await tx.session.updateMany({where:{id:session.id,refreshTokenHash:hash,revokedAt:null,expiresAt:{gt:new Date()}},data:pair.data});
    if (updated.count !== 1) throw new UnauthorizedError();
    await tx.sessionToken.createMany({data:[session.accessTokenHash,session.refreshTokenHash].map(hash=>({hash,sessionId:session.id}))});
  });
  return {user:session.user,tokens:pair.tokens};
}

export async function revokeSession(access: string | null, refresh: string | null) {
  const hashes = [access,refresh].filter((v):v is string => !!v && v.length <= 128).map(tokenHash);
  if (!hashes.length) return;
  // 회전 전/후 어느 시점의 쿠키여도 세션 ID를 먼저 찾고 그 ID를 폐기합니다.
  // find 시점 이후 refresh가 먼저 완료되어도 해시 변경으로 로그아웃이 누락되지 않습니다.
  const sessions=await prisma.session.findMany({where:{OR:[{accessTokenHash:{in:hashes}},{refreshTokenHash:{in:hashes}},{previousTokens:{some:{hash:{in:hashes}}}}],revokedAt:null},select:{id:true}});
  if(sessions.length)await prisma.session.updateMany({where:{id:{in:sessions.map(s=>s.id)}},data:{revokedAt:new Date()}});
}
