import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { env } from "../src/config/env";
import type { Server } from "node:http";

if(!new URL(env.DATABASE_URL).pathname.endsWith("_test"))throw new Error("이 테스트는 _test로 끝나는 전용 DB가 필요합니다.");
let base:string, server:Server;
before(async()=>{
  server=app.listen(0);
  await new Promise<void>(resolve=>server.once("listening",resolve));
  const address=server.address();if(!address||typeof address==="string")throw Error("listen failed");
  base=`http://localhost:${address.port}`;
});
after(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));await prisma.$disconnect();});
const cookieJar=(response:Response)=>response.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ");
const post=(path:string,body:unknown,cookie="")=>fetch(`${base}${path}`,{method:"POST",headers:{"Content-Type":"application/json",cookie},body:JSON.stringify(body)});
test("가입에서 발급된 세션은 me에서 유효하고 로그아웃 후 재사용할 수 없다", async () => {
  const email = `auth-${Date.now()}@example.test`;
  const signup = await fetch(`${base}/auth/signup`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:"인증 테스트",email,phone:"01012345678",password:"Password1!",role:"CUSTOMER"})});
  assert.equal(signup.status,201);
  const cookies = signup.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ");
  assert.ok(cookies.includes("accessToken="));
  const me = await fetch(`${base}/auth/me`, {headers:{cookie:cookies}});
  assert.equal(me.status,200);
  assert.equal((await me.json()).data.user.email,email);
  assert.equal((await fetch(`${base}/auth/logout`,{method:"POST",headers:{cookie:cookies}})).status,204);
  assert.equal((await fetch(`${base}/auth/me`,{headers:{cookie:cookies}})).status,401);
});

test("중복 가입·틀린 비밀번호·역할 불일치를 거부하고 공개 응답에 비밀번호를 포함하지 않는다",async()=>{
  const input={name:"기사 테스트",email:`mover-${Date.now()}@example.test`,phone:"01012345678",password:"Password1!",role:"MOVER"};
  const created=await post("/auth/signup",input);
  assert.equal(created.status,201);
  const body=await created.json();
  assert.equal(body.data.user.role,"MOVER");assert.equal(body.data.user.profileCompleted,false);
  assert.equal("passwordHash" in body.data.user,false);
  assert.ok(created.headers.getSetCookie().every(c=>c.includes("HttpOnly")));
  assert.equal((await post("/auth/signup",input)).status,409);
  assert.equal((await post("/auth/login",{...input,password:"Wrong1!"})).status,401);
  assert.equal((await post("/auth/login",{...input,role:"CUSTOMER"})).status,401);
  assert.equal((await post("/auth/login",input)).status,200);
  assert.equal((await post("/auth/signup",{...input,email:`weak-${Date.now()}@example.test`,password:"weak"})).status,400);
});

test("refresh는 토큰을 회전시키고 이전 토큰·동시 재사용을 거부한다",async()=>{
  const created=await post("/auth/signup",{name:"회전 테스트",email:`rotate-${Date.now()}@example.test`,phone:"01012345678",password:"Password1!",role:"CUSTOMER"});
  assert.equal(created.status,201);
  const previous=cookieJar(created);
  const results=await Promise.all([post("/auth/refresh",{},previous),post("/auth/refresh",{},previous)]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,401]);
  const current=cookieJar(results.find(r=>r.status===200)!);
  assert.notEqual(current,previous);
  assert.equal((await fetch(`${base}/auth/me`,{headers:{cookie:previous}})).status,401);
  assert.equal((await post("/auth/refresh",{},previous)).status,401);
  assert.equal((await fetch(`${base}/auth/me`,{headers:{cookie:current}})).status,200);
  await post("/auth/logout",{},current);
  assert.equal((await post("/auth/refresh",{},current)).status,401);
});

test("OAuth 미설정·위조 콜백·허용되지 않은 출처를 거부한다",async()=>{
  const start=await fetch(`${base}/auth/oauth/google?role=CUSTOMER&format=json`);
  assert.equal(start.status,503);
  assert.equal((await start.json()).error.code,"OAUTH_NOT_CONFIGURED");
  const denied=await fetch(`${base}/auth/login`,{method:"POST",headers:{Origin:"https://evil.example","Content-Type":"application/json"},body:"{}"});
  assert.equal(denied.status,403);
  const callback=await fetch(`${base}/auth/oauth/google/callback?code=untrusted&state=invalid`,{redirect:"manual"});
  assert.equal(callback.status,302);
  assert.equal(new URL(callback.headers.get("location")!).searchParams.get("error"),"OAUTH_INVALID_STATE");
  assert.equal(callback.headers.getSetCookie().some(c=>c.startsWith("accessToken=")),false);
});

test("refresh 직전의 쿠키로 로그아웃해도 새로 발급된 세션을 폐기한다",async()=>{
  const created=await post("/auth/signup",{name:"경합 테스트",email:`race-${Date.now()}@example.test`,phone:"01012345678",password:"Password1!",role:"CUSTOMER"});
  assert.equal(created.status,201);
  const oldCookies=cookieJar(created);
  const refreshed=await post("/auth/refresh",{},oldCookies);
  assert.equal(refreshed.status,200);
  const newCookies=cookieJar(refreshed);
  await post("/auth/logout",{},oldCookies);
  assert.equal((await fetch(`${base}/auth/me`,{headers:{cookie:newCookies}})).status,401);
  assert.equal((await post("/auth/refresh",{},newCookies)).status,401);
});

test("액세스 만료는 갱신 가능하지만 세션 절대 만료 이후에는 갱신할 수 없다",async()=>{
  const email=`expire-${Date.now()}@example.test`;
  const created=await post("/auth/signup",{name:"만료 테스트",email,phone:"01012345678",password:"Password1!",role:"CUSTOMER"});
  assert.equal(created.status,201);
  const user=await prisma.user.findUniqueOrThrow({where:{email}});
  const oldCookies=cookieJar(created);
  await prisma.session.updateMany({where:{userId:user.id},data:{accessExpiresAt:new Date(0)}});
  assert.equal((await fetch(`${base}/auth/me`,{headers:{cookie:oldCookies}})).status,401);
  const refreshed=await post("/auth/refresh",{},oldCookies);
  assert.equal(refreshed.status,200);
  const current=cookieJar(refreshed);
  await prisma.session.updateMany({where:{userId:user.id},data:{expiresAt:new Date(0)}});
  assert.equal((await post("/auth/refresh",{},current)).status,401);
  assert.equal((await fetch(`${base}/auth/me`,{headers:{cookie:current}})).status,401);
});
