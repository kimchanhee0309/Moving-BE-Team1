import path from "node:path";

import type { Express } from "express";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

import { env } from "./env";

const apiDocumentPaths =
  env.NODE_ENV === "production"
    ? [
        path.resolve(process.cwd(), "dist/routes/**/*.js"),
        path.resolve(process.cwd(), "dist/modules/**/*.js"),
      ]
    : [
        path.resolve(process.cwd(), "src/routes/**/*.ts"),
        path.resolve(process.cwd(), "src/modules/**/*.ts"),
      ];

const swaggerSpecification = swaggerJsdoc({
  definition: {
    openapi: "3.0.3",

    info: {
      title: "Moving API",
      version: "1.0.0",
      description: "이사 소비자와 기사님을 연결하는 무빙 서비스 API",
    },

    servers: [
      {
        url: "/",
        description: "현재 API 서버",
      },
    ],

    tags: [
      {
        name: "Health",
        description: "서버 상태 확인",
      },
      {
        name: "Auth",
        description: "인증 및 인가",
      },
      {
        name: "Customers",
        description: "일반 유저",
      },
      {
        name: "Movers",
        description: "기사님",
      },
      {
        name: "MoveRequests",
        description: "이사 견적 요청",
      },
      {
        name: "Quotes",
        description: "견적",
      },
      {
        name: "Favorites",
        description: "찜한 기사님",
      },
      {
        name: "Reviews",
        description: "리뷰",
      },
      {
        name: "Notifications",
        description: "알림",
      },
    ],

    components: {
      securitySchemes: {
        accessTokenCookie: {
          type: "apiKey",
          in: "cookie",
          name: "accessToken",
          description: "로그인 시 HttpOnly 쿠키로 전달되는 Access Token",
        },

        refreshTokenCookie: {
          type: "apiKey",
          in: "cookie",
          name: "refreshToken",
          description: "Access Token 재발급에 사용하는 Refresh Token",
        },
      },

      schemas: {
        UserRole: {
          type: "string",
          enum: ["CUSTOMER", "MOVER"],
        },

        ServiceType: {
          type: "string",
          enum: ["SMALL", "HOME", "OFFICE"],
        },

        QuoteStatus: {
          type: "string",
          enum: ["PENDING", "CONFIRMED", "REJECTED"],
        },

        MoveRequestStatus: {
          type: "string",
          enum: ["WAITING", "CONFIRMED", "COMPLETED"],
        },

        ErrorResponse: {
          type: "object",
          required: ["success", "error"],
          properties: {
            success: {
              type: "boolean",
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
                  type: "object",
                  additionalProperties: {
                    oneOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "array",
                        items: {
                          type: "string",
                        },
                      },
                    ],
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
              example: true,
            },

            data: {
              type: "object",
              required: ["status", "timestamp"],
              properties: {
                status: {
                  type: "string",
                  example: "ok",
                },

                timestamp: {
                  type: "string",
                  format: "date-time",
                  example: "2026-09-03T10:00:00.000Z",
                },
              },
            },
          },
        },
      },

      responses: {
        BadRequest: {
          description: "잘못된 요청",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse",
              },
            },
          },
        },

        Unauthorized: {
          description: "로그인이 필요함",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse",
              },
            },
          },
        },

        Forbidden: {
          description: "접근 권한이 없음",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse",
              },
            },
          },
        },

        NotFound: {
          description: "데이터를 찾을 수 없음",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse",
              },
            },
          },
        },

        Conflict: {
          description: "현재 상태와 충돌하는 요청",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse",
              },
            },
          },
        },

        InternalServerError: {
          description: "서버 내부 오류",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse",
              },
            },
          },
        },
      },
    },
  },

  apis: apiDocumentPaths,
});

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
        displayRequestDuration: true,
        persistAuthorization: false,
        tryItOutEnabled: true,
      },
    }),
  );
}
