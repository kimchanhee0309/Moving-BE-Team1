import { Router, type CookieOptions } from "express";
import { AppError, ConflictError, ForbiddenError } from "../../common/errors/app-error";
import { setAuthCookies } from "../../common/cookies/auth-cookie";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { parseRole, safeRedirect } from "./auth.validation";
import { randomToken, tokenHash } from "./auth.crypto";
import { createSession } from "./auth.service";
import { authorizationUrl, authOrigins, exchangeIdentity, parseProvider, type IdentityExchange, type OAuthProvider } from "./oauth.provider";
import { authRateLimit } from "./auth.middleware";

function cookieOptions(provider:OAuthProvider):CookieOptions {
  return {httpOnly:true,secure:env.COOKIE_SECURE,sameSite:"lax",path:`/auth/oauth/${provider}/callback`,maxAge:10*60*1000};
}

/** 공급자 교환만 어댑터 경계로 두고, 인증 판단/DB/state 로직은 항상 서버에서 실행합니다. */
export function createOAuthRouter(exchange:IdentityExchange=exchangeIdentity) {
  const router=Router();
  router.use((_request,response,next)=>{response.set("Cache-Control","no-store");response.set("Referrer-Policy","no-referrer");next();});
  router.get("/:provider",authRateLimit(),async(request,response)=>{
    const provider=parseProvider(request.params.provider),role=parseRole(request.query.role);
    const state=randomToken(),browser=randomToken(),verifier=randomToken();
    // 앱 설정이 없는 경우에는 state나 쿠키를 만들지 않습니다.
    const url=authorizationUrl(provider,state,verifier);
    await prisma.oAuthState.deleteMany({where:{expiresAt:{lte:new Date()}}});
    await prisma.oAuthState.create({data:{id:tokenHash(state),browserHash:tokenHash(browser),provider,role,redirect:safeRedirect(request.query.redirect),verifier,expiresAt:new Date(Date.now()+600000)}});
      response.cookie(`moving_oauth_${provider}`,browser,cookieOptions(provider));
    if(request.query.format==="json") {response.json({success:true,data:{url}});return;}
    response.redirect(url);
  });
  router.get("/:provider/callback",async(request,response)=>{
    const callback=new URL("/auth/callback",authOrigins().frontend);
    let errorCode="OAUTH_INVALID_STATE";
    try {
      const provider=parseProvider(request.params.provider);
      const state=typeof request.query.state==="string"?request.query.state:"";
      const browser:unknown=request.cookies?.[`moving_oauth_${provider}`];
      if(!/^[A-Za-z0-9_-]{43}$/.test(state)||typeof browser!=="string"||browser.length!==43)throw new Error("state missing");
      errorCode="OAUTH_INVALID_STATE";
      const stored=await prisma.oAuthState.findUnique({where:{id:tokenHash(state)}});
      if(!stored||stored.provider!==provider||stored.browserHash!==tokenHash(browser)||stored.expiresAt<=new Date())throw new Error("state rejected");
      // 조건부 삭제로 같은 state의 동시 callback도 한 번만 허용합니다.
      const consumed=await prisma.oAuthState.deleteMany({where:{id:stored.id,browserHash:stored.browserHash,expiresAt:{gt:new Date()}}});
      if(consumed.count!==1)throw new Error("state replayed");
      response.clearCookie(`moving_oauth_${provider}`,{...cookieOptions(provider),maxAge:undefined});
      callback.searchParams.set("role",stored.role);
      errorCode="OAUTH_CANCELLED";
      if(request.query.error)throw new Error("consent declined");
      errorCode="OAUTH_FAILED";
      const code=typeof request.query.code==="string"?request.query.code:"";
      if(!code||code.length>4096)throw new Error("authorization code missing");
      const identity=await exchange(provider,code,state,stored.verifier);
      const existing=await prisma.oAuthAccount.findUnique({where:{provider_providerId:{provider,providerId:identity.providerId}},include:{user:true}});
      let user=existing?.user;
      if(user&&user.role!==stored.role)throw new ForbiddenError("가입한 계정 유형으로 로그인해 주세요.","ROLE_MISMATCH");
      if(!user) {
        if(identity.email&&await prisma.user.findUnique({where:{email:identity.email}}))throw new ConflictError("같은 이메일의 계정이 있습니다. 기존 로그인 방법을 이용해 주세요.","OAUTH_ACCOUNT_CONFLICT");
        user=await prisma.user.create({data:{name:identity.name,email:identity.email,role:stored.role,oauthAccounts:{create:{provider,providerId:identity.providerId}}}});
      }
      setAuthCookies(response,await createSession(user.id));
      callback.searchParams.set("redirect",stored.redirect);
    } catch(error) {
      // 에러 원문에는 공급자 응답/인증 코드가 있을 수 있어 정해진 코드만 전달합니다.
      callback.searchParams.set("error",error instanceof AppError?error.code:errorCode);
    }
    response.redirect(callback.toString());
  });
  return router;
}
