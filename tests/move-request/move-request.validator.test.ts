/**
 * MoveRequest Body/Path Parameter zod validator의 정규화와 VALIDATION_ERROR 변환을 검증합니다.
 */
import { BadRequestError } from "../../src/common/errors/app-error";
import {
  parseCreateDesignatedRequestInput,
  parseCreateMoveRequestInput,
  parseMoveRequestIdParam,
} from "../../src/modules/move-request/move-request.validator";

const VALID_MOVE_REQUEST_ID = "550e8400-e29b-41d4-a716-446655440000";
const VALID_MOVER_ID = "550e8400-e29b-41d4-a716-446655440001";

describe("Move request validator", () => {
  describe("parseCreateMoveRequestInput", () => {
    test("올바른 Body를 통과시키고 주소 앞뒤 공백을 제거한다", () => {
      const result = parseCreateMoveRequestInput({
        serviceType: "SMALL",
        moveDate: "2026-11-01",
        fromAddress: "  서울시 강남구 테헤란로 123  ",
        toAddress: "  경기도 성남시 분당구  ",
      });

      expect(result).toEqual({
        serviceType: "SMALL",
        moveDate: "2026-11-01",
        fromAddress: "서울시 강남구 테헤란로 123",
        toAddress: "경기도 성남시 분당구",
      });
    });

    test("허용되지 않은 serviceType을 details와 함께 거절한다", () => {
      expect.assertions(2);

      try {
        parseCreateMoveRequestInput({
          serviceType: "XL",
          moveDate: "2026-11-01",
          fromAddress: "a",
          toAddress: "b",
        });
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestError);
        expect((error as BadRequestError).details).toEqual(
          expect.arrayContaining([expect.objectContaining({ field: "serviceType" })]),
        );
      }
    });

    test("YYYY-MM-DD 형식이 아닌 moveDate를 거절한다", () => {
      expect(() =>
        parseCreateMoveRequestInput({
          serviceType: "SMALL",
          moveDate: "2026/11/01",
          fromAddress: "a",
          toAddress: "b",
        }),
      ).toThrow(BadRequestError);
    });

    test("공백만 있는 fromAddress를 거절한다", () => {
      expect(() =>
        parseCreateMoveRequestInput({
          serviceType: "SMALL",
          moveDate: "2026-11-01",
          fromAddress: "   ",
          toAddress: "b",
        }),
      ).toThrow(BadRequestError);
    });

    test("255자를 초과하는 toAddress를 거절한다", () => {
      expect(() =>
        parseCreateMoveRequestInput({
          serviceType: "SMALL",
          moveDate: "2026-11-01",
          fromAddress: "a",
          toAddress: "가".repeat(256),
        }),
      ).toThrow(BadRequestError);
    });

    test("필수값이 모두 없으면 details에 4개 field를 함께 기록한다", () => {
      expect.assertions(1);

      try {
        parseCreateMoveRequestInput({});
      } catch (error) {
        expect((error as BadRequestError).details).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: "serviceType" }),
            expect.objectContaining({ field: "moveDate" }),
            expect.objectContaining({ field: "fromAddress" }),
            expect.objectContaining({ field: "toAddress" }),
          ]),
        );
      }
    });

    test("Body가 객체가 아니면 거절한다", () => {
      expect(() => parseCreateMoveRequestInput(null)).toThrow(BadRequestError);
      expect(() => parseCreateMoveRequestInput("string")).toThrow(BadRequestError);
    });
  });

  describe("parseCreateDesignatedRequestInput", () => {
    test("UUID 형식의 moverId를 통과시킨다", () => {
      expect(parseCreateDesignatedRequestInput({ moverId: VALID_MOVER_ID })).toEqual({
        moverId: VALID_MOVER_ID,
      });
    });

    test("UUID 형식이 아닌 moverId를 거절한다", () => {
      expect(() =>
        parseCreateDesignatedRequestInput({ moverId: "not-a-uuid" }),
      ).toThrow(BadRequestError);
    });

    test("moverId가 없으면 거절한다", () => {
      expect(() => parseCreateDesignatedRequestInput({})).toThrow(BadRequestError);
    });
  });

  describe("parseMoveRequestIdParam", () => {
    test("UUID 형식의 값을 그대로 반환한다", () => {
      expect(parseMoveRequestIdParam(VALID_MOVE_REQUEST_ID)).toBe(VALID_MOVE_REQUEST_ID);
    });

    test("UUID 형식이 아니면 moveRequestId field로 거절한다", () => {
      expect.assertions(2);

      try {
        parseMoveRequestIdParam("not-a-uuid");
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestError);
        expect((error as BadRequestError).details).toEqual(
          expect.arrayContaining([expect.objectContaining({ field: "moveRequestId" })]),
        );
      }
    });

    test("값이 undefined이거나 배열이면 거절한다", () => {
      expect(() => parseMoveRequestIdParam(undefined)).toThrow(BadRequestError);
      expect(() => parseMoveRequestIdParam(["a", "b"])).toThrow(BadRequestError);
    });
  });
});
