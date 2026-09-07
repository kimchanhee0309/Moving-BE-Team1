const errorResponses={"400":{$ref:"#/components/responses/BadRequest"},"401":{$ref:"#/components/responses/Unauthorized"},"403":{$ref:"#/components/responses/Forbidden"},"409":{$ref:"#/components/responses/Conflict"},"429":{description:"요청 횟수 초과"}};
const userSchema={type:"object",required:["id","name","email","phone","role","profileCompleted"],properties:{id:{type:"string"},name:{type:"string"},email:{type:"string",nullable:true},phone:{type:"string",nullable:true},role:{$ref:"#/components/schemas/UserRole"},profileCompleted:{type:"boolean"}}};
const sessionResponse={description:"서버 세션. 토큰은 HttpOnly 쿠키로만 발급",content:{"application/json":{schema:{type:"object",properties:{success:{type:"boolean",enum:[true]},data:{type:"object",properties:{user:userSchema}}}}}}};
function credentials(signup: boolean) {
  const schema = {
    type: "object",
    required: signup ? ["email", "password", "role", "name", "phone"] : ["email", "password", "role"],
    properties: {
      email: {type:"string",format:"email",maxLength:254},
      password: {type:"string",format:"password",maxLength:128,...(signup?{minLength:8}:{})},
      role: {$ref:"#/components/schemas/UserRole"},
      ...(signup?{name:{type:"string",maxLength:80},phone:{type:"string"}}:{}),
    },
  };
  return {required:true,content:{"application/json":{schema}}};
}
const provider={name:"provider",in:"path",required:true,schema:{type:"string",enum:["google","kakao","naver"]}};

/** 구현과 함께 관리하는 인증 API 문서. 클라이언트에 서버 비밀키/토큰 응답을 노출하지 않습니다. */
export const authPaths={
  "/auth/signup":{post:{tags:["Auth"],summary:"이메일 가입 및 로그인",requestBody:credentials(true),responses:{"201":sessionResponse,...errorResponses}}},
  "/auth/login":{post:{tags:["Auth"],summary:"역할별 이메일 로그인",requestBody:credentials(false),responses:{"200":sessionResponse,...errorResponses}}},
  "/auth/me":{get:{tags:["Auth"],summary:"내 인증 정보",security:[{accessTokenCookie:[]}],responses:{"200":sessionResponse,"401":errorResponses["401"]}}},
  "/auth/refresh":{post:{tags:["Auth"],summary:"리프레시 토큰 회전",security:[{refreshTokenCookie:[]}],responses:{"200":sessionResponse,"401":errorResponses["401"]}}},
  "/auth/logout":{post:{tags:["Auth"],summary:"현재 기기 세션 폐기 및 쿠키 제거",responses:{"204":{description:"로그아웃 완료"}}}},
  "/auth/oauth/{provider}":{get:{tags:["Auth"],summary:"SNS 로그인 시작",parameters:[provider,{name:"role",in:"query",required:true,schema:{$ref:"#/components/schemas/UserRole"}},{name:"redirect",in:"query",schema:{type:"string",example:"/"}},{name:"format",in:"query",schema:{type:"string",enum:["json"]}}],responses:{"302":{description:"공급자 인증 페이지로 이동"},"200":{description:"format=json: {success:true,data:{url}}"},"503":{description:"공급자 앱 미설정"},...errorResponses}}},
  "/auth/oauth/{provider}/callback":{get:{tags:["Auth"],summary:"공급자 콜백: 일회용 state 검증",parameters:[provider,{name:"state",in:"query",required:true,schema:{type:"string"}},{name:"code",in:"query",schema:{type:"string"}},{name:"error",in:"query",schema:{type:"string"}}],responses:{"302":{description:"프런트 /auth/callback으로 이동. 실패 시 error 코드만 전달"}}}},
};
