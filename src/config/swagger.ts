import path from "node:path";

import type { Express } from "express";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

import { env } from "./env";

/**
 * Windows에서도 swagger-jsdoc의 glob이 동작하도록
 * 절대 경로 구분자를 POSIX 형식으로 통일합니다.
 */
function resolveApiDocumentPath(relativePath: string): string {
  return path.resolve(process.cwd(), relativePath).replaceAll(path.sep, "/");
}

/**
 * 공통 오류 응답 정의를 생성합니다.
 */
function createErrorResponse(description: string): Record<string, unknown> {
  return {
    description,
    content: {
      "application/json": {
        schema: {
          $ref: "#/components/schemas/ErrorResponse",
        },
      },
    },
  };
}

const apiDocumentPaths =
  env.NODE_ENV === "production"
    ? [
        resolveApiDocumentPath("dist/routes/**/*.js"),
        resolveApiDocumentPath("dist/modules/**/*.router.js"),
      ]
    : [
        resolveApiDocumentPath("src/routes/**/*.ts"),
        resolveApiDocumentPath("src/modules/**/*.router.ts"),
      ];

/**
 * 애플리케이션에서 제공하는 OpenAPI 명세입니다.
 *
 * 공통 Schema와 응답은 이 파일에서 관리하고,
 * 각 endpoint의 상세 명세는 담당 module의 router에 작성합니다.
 */
export const swaggerSpecification = swaggerJsdoc({
  definition: {
    openapi: "3.0.3",

    info: {
      title: "Moving API",
      version: "1.0.0",
      description: [
        "이사 소비자와 기사님을 연결하는 무빙 서비스 API입니다.",
        "",
        "Access Token과 Refresh Token은 HttpOnly Cookie로 전달됩니다.",
        "Swagger UI에서는 `/auth/login` 또는 `/auth/signup` 성공 후",
        "브라우저가 저장한 Cookie를 이용해 인증 API를 테스트할 수 있습니다.",
      ].join("\n"),
    },

    servers: [
      {
        url: "/",
        description: "현재 API Origin 또는 Reverse Proxy Origin",
      },
    ],

    tags: [
      {
        name: "Health",
        description: "서버 상태 확인",
      },
      {
        name: "Auth",
        description: "회원가입, 로그인, 로그아웃 및 OAuth 인증",
      },
      {
        name: "Customers",
        description: "일반 사용자 프로필 및 사용자 기능",
      },
      {
        name: "Movers",
        description: "기사님 프로필 및 기사님 기능",
      },
      {
        name: "MoveRequests",
        description: "이사 견적 요청",
      },
      {
        name: "Quotes",
        description: "고객 및 기사님의 견적 관리",
      },
      {
        name: "Favorites",
        description: "찜한 기사님 관리",
      },
      {
        name: "Reviews",
        description: "리뷰 등록 및 조회",
      },
    ],

    components: {
      securitySchemes: {
        accessTokenCookie: {
          type: "apiKey",
          in: "cookie",
          name: "accessToken",
          description:
            "로그인 또는 회원가입 성공 시 HttpOnly Cookie로 발급되는 Access Token",
        },

        refreshTokenCookie: {
          type: "apiKey",
          in: "cookie",
          name: "refreshToken",
          description:
            "Access Token 재발급에 사용하는 HttpOnly Refresh Token. Cookie Path는 /auth입니다.",
        },
      },

      schemas: {
        UserRole: {
          type: "string",
          enum: ["CUSTOMER", "MOVER"],
          example: "MOVER",
        },

        ServiceType: {
          type: "string",
          enum: ["SMALL", "HOME", "OFFICE"],
          example: "SMALL",
        },

        QuoteStatus: {
          type: "string",
          enum: ["PROPOSED", "CONFIRMED", "REJECTED"],
          example: "PROPOSED",
        },

        MoveRequestStatus: {
          type: "string",
          enum: ["WAITING", "CONFIRMED", "COMPLETED"],
          example: "WAITING",
        },

        ErrorDetail: {
          type: "object",
          required: ["field", "reason"],
          properties: {
            field: {
              type: "string",
              example: "email",
            },
            reason: {
              type: "string",
              example: "올바른 이메일 형식이 아닙니다.",
            },
          },
        },

        ErrorResponse: {
          type: "object",
          required: ["success", "error"],
          properties: {
            success: {
              type: "boolean",
              enum: [false],
              example: false,
            },

            error: {
              type: "object",
              required: ["code", "message"],
              properties: {
                code: {
                  type: "string",
                  example: "VALIDATION_ERROR",
                },

                message: {
                  type: "string",
                  example: "입력값을 확인해 주세요.",
                },

                details: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/ErrorDetail",
                  },
                },
              },
            },
          },
        },

        HealthResponse: {
          type: "object",
          required: ["success", "data"],
          properties: {
            success: {
              type: "boolean",
              enum: [true],
              example: true,
            },

            data: {
              type: "object",
              required: ["status", "timestamp"],
              properties: {
                status: {
                  type: "string",
                  enum: ["ok"],
                  example: "ok",
                },

                timestamp: {
                  type: "string",
                  format: "date-time",
                  example: "2026-09-16T10:00:00.000Z",
                },
              },
            },
          },
        },
      },

      responses: {
        BadRequest: createErrorResponse(
          "요청 형식 또는 입력값이 올바르지 않습니다.",
        ),

        Unauthorized: createErrorResponse(
          "인증 Cookie가 없거나 유효하지 않습니다.",
        ),

        Forbidden: createErrorResponse("요청한 작업을 수행할 권한이 없습니다."),

        NotFound: createErrorResponse(
          "요청한 API 또는 데이터를 찾을 수 없습니다.",
        ),

        Conflict: createErrorResponse(
          "현재 리소스 상태와 충돌하는 요청입니다.",
        ),

        TooManyRequests:
          createErrorResponse("허용된 요청 횟수를 초과했습니다."),

        BadGateway: createErrorResponse(
          "외부 OAuth 공급자 응답을 처리하지 못했습니다.",
        ),

        ServiceUnavailable: createErrorResponse(
          "필수 외부 서비스 설정이 없어 요청을 처리할 수 없습니다.",
        ),

        InternalServerError:
          createErrorResponse("서버 내부 오류가 발생했습니다."),
      },
    },

    paths: {
      "/health": {
        get: {
          tags: ["Health"],
          summary: "서버 상태 확인",
          description: "API 서버가 요청을 처리할 수 있는 상태인지 확인합니다.",
          security: [],
          responses: {
            "200": {
              description: "서버 상태 확인 성공",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/HealthResponse",
                  },
                },
              },
            },
          },
        },
      },
    },
  },

  apis: apiDocumentPaths,
});

/**
 * Swagger JSON과 Swagger UI endpoint를 Express 앱에 등록합니다.
 *
 * SWAGGER_ENABLED=false인 환경에서는 문서 endpoint를 노출하지 않습니다.
 */
export function setupSwagger(app: Express): void {
  if (!env.SWAGGER_ENABLED) {
    return;
  }

  app.get("/api-docs.json", (_request, response) => {
    response.json(swaggerSpecification);
  });

  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpecification, {
      customSiteTitle: "Moving API Docs",

      swaggerOptions: {
        deepLinking: true,
        displayRequestDuration: true,
        docExpansion: "none",
        filter: true,
        persistAuthorization: false,
        tryItOutEnabled: true,
        validatorUrl: null,
        withCredentials: true,
      },
    }),
  );
}
