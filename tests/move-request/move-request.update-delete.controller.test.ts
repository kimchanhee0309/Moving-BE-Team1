/**
 * updateMoveRequestController/deleteMoveRequestController가 인증된 customerId·검증된 입력을
 * Service에 전달하고 공통 응답(sendSuccess/sendNoContent)으로 반환하는지 검증합니다.
 */
jest.mock("../../src/modules/move-request/move-request.service", () => ({
  deleteMoveRequestForCustomer: jest.fn(),
  updateMoveRequestForCustomer: jest.fn(),
}));

jest.mock("../../src/modules/move-request/move-request.validator", () => ({
  parseMoveRequestIdParam: jest.fn(),
  parseUpdateMoveRequestInput: jest.fn(),
}));

jest.mock("../../src/common/utils/auth-context", () => ({
  getProfileAuthContext: jest.fn(),
}));

import type { Request, Response } from "express";

import { getProfileAuthContext } from "../../src/common/utils/auth-context";
import {
  deleteMoveRequestController,
  updateMoveRequestController,
} from "../../src/modules/move-request/move-request.controller";
import {
  deleteMoveRequestForCustomer,
  updateMoveRequestForCustomer,
} from "../../src/modules/move-request/move-request.service";
import {
  parseMoveRequestIdParam,
  parseUpdateMoveRequestInput,
} from "../../src/modules/move-request/move-request.validator";

const CUSTOMER_ID = "550e8400-e29b-41d4-a716-446655440000";
const MOVE_REQUEST_ID = "550e8400-e29b-41d4-a716-446655440001";

function createResponse(): Response {
  const response = {
    status: jest.fn(),
    json: jest.fn(),
    send: jest.fn(),
  } as unknown as Response;
  jest.mocked(response.status).mockReturnValue(response);
  return response;
}

describe("Move request 수정/삭제 controller", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(getProfileAuthContext).mockReturnValue({
      userId: "user-id",
      role: "CUSTOMER",
      profileId: CUSTOMER_ID,
    });
  });

  test("updateMoveRequestController는 인증된 customerId·path의 moveRequestId·검증된 body로 수정해 200을 반환한다", async () => {
    const input = {
      serviceType: "HOME" as const,
      moveDate: "2099-12-25",
      fromAddress: "새 출발지",
      toAddress: "새 도착지",
    };
    const moveRequest = { id: MOVE_REQUEST_ID };
    jest.mocked(parseMoveRequestIdParam).mockReturnValue(MOVE_REQUEST_ID);
    jest.mocked(parseUpdateMoveRequestInput).mockReturnValue(input);
    jest.mocked(updateMoveRequestForCustomer).mockResolvedValue(moveRequest as never);
    const response = createResponse();

    await updateMoveRequestController(
      {
        params: { moveRequestId: MOVE_REQUEST_ID },
        body: { ...input, customerId: "someone-else" },
      } as unknown as Request,
      response,
      jest.fn(),
    );

    expect(parseMoveRequestIdParam).toHaveBeenCalledWith(MOVE_REQUEST_ID);
    expect(updateMoveRequestForCustomer).toHaveBeenCalledWith(
      CUSTOMER_ID,
      MOVE_REQUEST_ID,
      input,
    );
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ success: true, data: { moveRequest } });
  });

  test("deleteMoveRequestController는 인증된 customerId·path의 moveRequestId로 삭제하고 204(본문 없음)를 반환한다", async () => {
    jest.mocked(parseMoveRequestIdParam).mockReturnValue(MOVE_REQUEST_ID);
    jest.mocked(deleteMoveRequestForCustomer).mockResolvedValue(undefined);
    const response = createResponse();

    await deleteMoveRequestController(
      { params: { moveRequestId: MOVE_REQUEST_ID } } as unknown as Request,
      response,
      jest.fn(),
    );

    expect(deleteMoveRequestForCustomer).toHaveBeenCalledWith(CUSTOMER_ID, MOVE_REQUEST_ID);
    expect(response.status).toHaveBeenCalledWith(204);
    expect(response.send).toHaveBeenCalledWith();
  });
});
