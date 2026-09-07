import assert from "node:assert/strict";
import { test, after } from "node:test";
import express from "express";
import cookieParser from "cookie-parser";
import { createOAuthRouter } from "../src/modules/auth/oauth.routes";
import { errorHandler } from "../src/common/middleware/error-handler";
import { prisma } from "../src/lib/prisma";
import { env } from "../src/config/env";
if(!new URL(env.DATABASE_URL).pathname.endsWith("_test"))throw new Error("이 테스트는 _test로 끝나는 전용 DB가 필요합니다.");
process.env.GOOGLE_CLIENT_ID="test-only";
process.env.GOOGLE_CLIENT_SECRET="test-only";
after(()=>prisma.$disconnect());

// 외부 공급자만 대체합니다. state 저장/검증, 계정 생성, 쿠키 발급은 실제 구현과 DB를 사용합니다.
test("OAuth는 브라우저 바인딩을 확인하고 callback state 재사용을 거부한다",async()=>{
  let exchanges = 0;
  const app=express(); app.use(cookieParser());
  app.use("/auth/oauth",createOAuthRouter(async()=>{exchanges++;return {providerId:`fake-${Date.now()}`,email:null,name:"SNS 테스트"};}));
  app.use(errorHandler);
  const server=app.listen(0); await new Promise<void>(resolve=>server.once("listening",resolve));
  const address=server.address(); if(!address||typeof address==="string")throw Error("listen failed");
  const base=`http://localhost:${address.port}`;
  try {
    const start=await fetch(`${base}/auth/oauth/google?role=CUSTOMER&redirect=%2F`,{redirect:"manual"});
    assert.equal(start.status,302);
    const state=new URL(start.headers.get("location")!).searchParams.get("state")!;
    const cookie=start.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ");
    const callback=`${base}/auth/oauth/google/callback?state=${state}&code=mock-code`;
    const unbound=await fetch(callback,{redirect:"manual"});
    assert.equal(new URL(unbound.headers.get("location")!).searchParams.get("error"),"OAUTH_INVALID_STATE");
    assert.equal(exchanges,0);
    const success=await fetch(callback,{headers:{cookie},redirect:"manual"});
    assert.equal(success.status,302);
    assert.ok(success.headers.getSetCookie().some(c=>c.startsWith("accessToken=")));
    assert.equal(exchanges,1);
    const replay=await fetch(callback,{headers:{cookie},redirect:"manual"});
    assert.equal(new URL(replay.headers.get("location")!).searchParams.get("error"),"OAUTH_INVALID_STATE");
    assert.equal(exchanges,1);
  } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
