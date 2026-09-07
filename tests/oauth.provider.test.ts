import assert from "node:assert/strict";
import { test } from "node:test";
import { authorizationUrl, exchangeIdentity, type OAuthProvider } from "../src/modules/auth/oauth.provider";

const profiles={google:{sub:"google-id",email:"G@example.test",email_verified:true,name:"구글"},kakao:{id:12345,kakao_account:{email:"K@example.test",is_email_verified:true,is_email_valid:true,profile:{nickname:"카카오"}}},naver:{resultcode:"00",response:{id:"naver-id",email:"N@example.test",name:"네이버"}}};
for(const provider of ["google","kakao","naver"] as OAuthProvider[]) {
  test(`${provider}: 공식 토큰·프로필 응답을 계정 DTO로 변환하고 공급자 토큰을 노출하지 않는다`,async(context)=>{
    process.env[`${provider.toUpperCase()}_CLIENT_ID`]="test-id";
    process.env[`${provider.toUpperCase()}_CLIENT_SECRET`]="test-secret";
    const calls:{url:string;options?:RequestInit}[]=[];
    context.mock.method(globalThis,"fetch",async(url:string,options:RequestInit)=>{
      calls.push({url,options});
      return Response.json(calls.length===1?{access_token:"provider-token"}:profiles[provider]);
    });
    const url=new URL(authorizationUrl(provider,"state-value","verifier"));
    assert.equal(url.searchParams.get("state"),"state-value");
    if(provider==="google")assert.equal(url.searchParams.get("code_challenge_method"),"S256");
    const result=await exchangeIdentity(provider,"code-value","state-value","verifier");
    assert.equal(calls.length,2);
    assert.equal(calls[0]!.options!.method,"POST");
    assert.equal(new URLSearchParams(calls[0]!.options!.body as URLSearchParams).get("code"),"code-value");
    assert.ok(result.providerId);
    assert.equal(result.email,`${provider[0]}@example.test`);
    assert.equal("access_token" in result,false);
  });
}
