import { Router } from "express";
import { ConflictError, UnauthorizedError } from "../../common/errors/app-error";
import { clearAuthCookies, getAccessTokenFromCookie, getRefreshTokenFromCookie, setAuthCookies } from "../../common/cookies/auth-cookie";
import { sendSuccess, sendNoContent } from "../../common/response/api-response";
import { prisma } from "../../lib/prisma";
import { parseCredentials } from "./auth.validation";
import { hashPassword, verifyPassword } from "./auth.crypto";
import { authenticateToken, createSession, publicUser, refreshSession, revokeSession } from "./auth.service";
import { authRateLimit } from "./auth.middleware";
import { createOAuthRouter } from "./oauth.routes";

export const authRouter = Router();
authRouter.use((_request,response,next)=>{response.set("Cache-Control","no-store");next();});
authRouter.use("/oauth",createOAuthRouter());
const limit = authRateLimit();
authRouter.post("/signup",limit,async(request,response)=>{
  const input = parseCredentials(request.body,true);
  if (await prisma.user.findUnique({where:{email:input.email}})) throw new ConflictError("이미 가입된 이메일입니다.","EMAIL_ALREADY_EXISTS");
  const user = await prisma.user.create({data:{name:input.name,email:input.email,phone:input.phone,role:input.role,passwordHash:await hashPassword(input.password)}});
  setAuthCookies(response,await createSession(user.id));
  return sendSuccess(response,201,{user:publicUser(user)});
});
authRouter.post("/login",limit,async(request,response)=>{
  const input = parseCredentials(request.body);
  const user = await prisma.user.findUnique({where:{email:input.email}});
  const verified = await verifyPassword(input.password,user?.passwordHash ?? null);
  if (!user || !verified || user.role !== input.role) throw new UnauthorizedError("이메일, 비밀번호 또는 선택한 계정 유형을 확인해 주세요.","INVALID_CREDENTIALS");
  setAuthCookies(response,await createSession(user.id));
  return sendSuccess(response,200,{user:publicUser(user)});
});
authRouter.get("/me",async(request,response)=>{
  const session = await authenticateToken(getAccessTokenFromCookie(request));
  return sendSuccess(response,200,{user:publicUser(session.user)});
});
authRouter.post("/refresh",authRateLimit(60),async(request,response)=>{
  const session = await refreshSession(getRefreshTokenFromCookie(request));
  setAuthCookies(response,session.tokens);
  return sendSuccess(response,200,{user:publicUser(session.user)});
});
authRouter.post("/logout",async(request,response)=>{
  await revokeSession(getAccessTokenFromCookie(request),getRefreshTokenFromCookie(request));
  clearAuthCookies(response);
  return sendNoContent(response);
});
