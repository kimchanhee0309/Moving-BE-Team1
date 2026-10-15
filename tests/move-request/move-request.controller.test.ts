/**
 * MoveRequest Controller가 인증된 customerId와 검증된 입력을 Service에 전달하고
 * 공통 응답(sendSuccess)으로 반환하는지 검증합니다. client가 보낸 값은 신뢰하지 않는지도 함께 확인합니다.
 */
jest.mock("../../src/modules/move-request/move-request.service", () => ({
  createDesignatedRequestForCustomer: jest.fn(),
  createMoveRequestForCustomer: jest.fn(),
  getActiveMoveRequestForCustomer: jest.fn(),
}));

jest.mock("../../src/modules/move-request/move-request.validator", () => ({
  parseCreateDesignatedRequestInput: jest.fn(),
  parseCreateMoveRequestInput: jest.fn(),
  parseMoveRequestIdParam: jest.fn(),
}));

jest.mock("../../src/common/utils/auth-context", () => ({
  getProfileAuthContext: jest.fn(),
}));

import type { Request, Response } from "express";

import { getProfileAuthContext } from "../../src/common/utils/auth-context";
import {
  createDesignatedRequestController,
  createMoveRequestController,
  getActiveMoveRequestController,
} from "../../src/modules/move-request/move-request.controller";
import {
  createDesignatedRequestForCustomer,
  createMoveRequestForCustomer,
  getActiveMoveRequestForCustomer,
} from "../../src/modules/move-request/move-request.service";
import {
  parseCreateDesignatedRequestInput,
  parseCreateMoveRequestInput,
  parseMoveRequestIdParam,
} from "../../src/modules/move-request/move-request.validator";

const CUSTOMER_ID = "550e8400-e29b-41d4-a716-446655440000";
const MOVE_REQUEST_ID = "550e8400-e29b-41d4-a716-446655440001";

function createResponse(): Response {
  const response = { status: jest.fn(), json: jest.fn() } as unknown as Response;
  jest.mocked(response.status).mockReturnValue(response);
  return response;
}

describe("Move request controller", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(getProfileAuthContext).mockReturnValue({
      userId: "user-id",
      role: "CUSTOMER",
      profileId: CUSTOMER_ID,
    });
  });

  test("createMoveRequestController는 인증된 customerId로 생성해 201과 data.moveRequest를 반환한다", async () => {
    const input = {
      serviceType: "SMALL" as const,
      moveDate: "2099-11-01",
      fromAddress: "출발지",
      toAddress: "도착지",
    };
    const moveRequest = { id: MOVE_REQUEST_ID };
    jest.mocked(parseCreateMoveRequestInput).mockReturnValue(input);
    jest.mocked(createMoveRequestForCustomer).mockResolvedValue(moveRequest as never);
    const response = createResponse();

    await createMoveRequestController(
      { body: { customerId: "someone-else" } } as unknown as Request,
      response,
      jest.fn(),
    );

    expect(parseCreateMoveRequestInput).toHaveBeenCalledWith({
      customerId: "someone-else",
    });
    expect(createMoveRequestForCustomer).toHaveBeenCalledWith(CUSTOMER_ID, input);
    expect(response.status).toHaveBeenCalledWith(201);
    expect(response.json).toHaveBeenCalledWith({ success: true, data: { moveRequest } });
  });

  test("getActiveMoveRequestController는 인증된 customerId로 조회해 200과 data.moveRequest를 반환한다(없으면 null)", async () => {
    jest.mocked(getActiveMoveRequestForCustomer).mockResolvedValue(null);
    const response = createResponse();

    await getActiveMoveRequestController({} as Request, response, jest.fn());

    expect(getActiveMoveRequestForCustomer).toHaveBeenCalledWith(CUSTOMER_ID);
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({
      success: true,
      data: { moveRequest: null },
    });
  });

  test("createDesignatedRequestController는 path moveRequestId와 검증된 moverId로 생성해 201을 반환한다", async () => {
    const input = { moverId: "550e8400-e29b-41d4-a716-446655440002" };
    const designatedRequest = { id: "designated-id" };
    jest.mocked(parseMoveRequestIdParam).mockReturnValue(MOVE_REQUEST_ID);
    jest.mocked(parseCreateDesignatedRequestInput).mockReturnValue(input);
    jest
      .mocked(createDesignatedRequestForCustomer)
      .mockResolvedValue(designatedRequest as never);
    const response = createResponse();

    await createDesignatedRequestController(
      {
        params: { moveRequestId: MOVE_REQUEST_ID },
        body: { moverId: input.moverId, customerId: "someone-else" },
      } as unknown as Request,
      response,
      jest.fn(),
    );

    expect(parseMoveRequestIdParam).toHaveBeenCalledWith(MOVE_REQUEST_ID);
    expect(createDesignatedRequestForCustomer).toHaveBeenCalledWith(
      CUSTOMER_ID,
      MOVE_REQUEST_ID,
      input,
    );
    expect(response.status).toHaveBeenCalledWith(201);
    expect(response.json).toHaveBeenCalledWith({
      success: true,
      data: { designatedRequest },
    });
  });
});
