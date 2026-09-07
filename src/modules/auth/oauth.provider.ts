import { createHash } from "node:crypto";
import { AppError, BadRequestError } from "../../common/errors/app-error";
import { env } from "../../config/env";

export type OAuthProvider = "google" | "kakao" | "naver";
export interface OAuthIdentity {providerId:string;email:string|null;name:string}
export type IdentityExchange = (provider:OAuthProvider,code:string,state:string,verifier:string)=>Promise<OAuthIdentity>;

const endpoints = {
  google:{authorize:"https://accounts.google.com/o/oauth2/v2/auth",token:"https://oauth2.googleapis.com/token",profile:"https://openidconnect.googleapis.com/v1/userinfo",scope:"openid email profile"},
  kakao:{authorize:"https://kauth.kakao.com/oauth/authorize",token:"https://kauth.kakao.com/oauth/token",profile:"https://kapi.kakao.com/v2/user/me",scope:""},
  naver:{authorize:"https://nid.naver.com/oauth2.0/authorize",token:"https://nid.naver.com/oauth2.0/token",profile:"https://openapi.naver.com/v1/nid/me",scope:""},
} as const;

export function parseProvider(value:unknown):OAuthProvider {
  if(value!=="google"&&value!=="kakao"&&value!=="naver")throw new BadRequestError("지원하지 않는 로그인입니다.","INVALID_PROVIDER");
  return value;
}

/** 환경에 지정한 origin만 callback에 사용하며 요청 Host 헤더로 URL을 만들지 않습니다. */
export function authOrigins() {
  const frontend = new URL(process.env.FRONTEND_URL ?? "http://localhost:3000");
  const backend = new URL(process.env.BACKEND_URL ?? `http://localhost:${env.PORT}`);
  for(const url of [frontend,backend]) {
    if(!["http:","https:"].includes(url.protocol)||url.username||url.password||url.pathname!=="/"||url.search||url.hash||(env.NODE_ENV==="production"&&url.protocol!=="https:")) throw new Error("인증 origin 환경변수를 확인해 주세요.");
  }
  return {frontend:frontend.origin,backend:backend.origin};
}

function configuration(provider:OAuthProvider) {
  const clientId=process.env[`${provider.toUpperCase()}_CLIENT_ID`]?.trim();
  const clientSecret=process.env[`${provider.toUpperCase()}_CLIENT_SECRET`]?.trim();
  if(!clientId||!clientSecret)throw new AppError({status:503,code:"OAUTH_NOT_CONFIGURED",message:"SNS 로그인 준비 중입니다. 이메일 로그인을 이용해 주세요."});
  return {clientId,clientSecret,redirectUri:`${authOrigins().backend}/auth/oauth/${provider}/callback`};
}

/** Google은 PKCE S256, 모든 공급자는 브라우저에 바인딩된 일회용 state를 사용합니다. */
export function authorizationUrl(provider:OAuthProvider,state:string,verifier:string) {
  const config=configuration(provider), endpoint=endpoints[provider];
  const url=new URL(endpoint.authorize);
  url.search=new URLSearchParams({response_type:"code",client_id:config.clientId,redirect_uri:config.redirectUri,state}).toString();
  if(endpoint.scope)url.searchParams.set("scope",endpoint.scope);
  if(provider==="google") {
    url.searchParams.set("code_challenge",createHash("sha256").update(verifier).digest("base64url"));
    url.searchParams.set("code_challenge_method","S256");
  }
  return url.toString();
}

function record(value:unknown):Record<string,unknown> { return value&&typeof value==="object"?value as Record<string,unknown>:{}; }
function asString(value:unknown):string {return typeof value==="string"?value:"";}

async function requestJson(url:string,options:RequestInit):Promise<Record<string,unknown>> {
  const response=await fetch(url,{...options,signal:AbortSignal.timeout(10000),redirect:"error"});
  if(!response.ok)throw new Error("OAuth provider request failed");
  return record(await response.json());
}

/** 공급자 토큰은 서버에서만 사용하고 사용자 식별 후 폐기합니다. 응답 원문은 로그/브라우저에 노출하지 않습니다. */
export const exchangeIdentity:IdentityExchange=async(provider,code,state,verifier)=>{
  const config=configuration(provider), endpoint=endpoints[provider];
  const params=new URLSearchParams({grant_type:"authorization_code",client_id:config.clientId,client_secret:config.clientSecret,redirect_uri:config.redirectUri,code,state});
  if(provider==="google")params.set("code_verifier",verifier);
  const token=await requestJson(endpoint.token,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:params});
  if(typeof token.access_token!=="string"||!token.access_token)throw new Error("OAuth access token missing");
  const raw=await requestJson(endpoint.profile,{headers:{Authorization:`Bearer ${token.access_token}`}});
  let id:unknown, email:unknown, name:unknown;
  if(provider==="google") {id=raw.sub;email=raw.email_verified===true?raw.email:null;name=raw.name;}
  else if(provider==="kakao") {const account=record(raw.kakao_account);id=raw.id;email=account.is_email_verified===true&&account.is_email_valid===true?account.email:null;name=record(account.profile).nickname;}
  else {if(raw.resultcode!=="00")throw new Error("Naver profile failed");const profile=record(raw.response);id=profile.id;email=profile.email;name=profile.name??profile.nickname;}
  if((typeof id!=="string"&&typeof id!=="number")||!String(id)||String(id).length>255)throw new Error("OAuth identity missing");
  const normalizedEmail=asString(email).trim().toLowerCase();
  return {providerId:String(id),email:normalizedEmail.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)?normalizedEmail:null,name:asString(name).trim().slice(0,80)||"무빙 회원"};
};
