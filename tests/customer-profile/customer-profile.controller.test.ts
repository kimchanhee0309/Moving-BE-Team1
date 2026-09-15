/**
 * Customer Profile Controller가 Auth context를 사용하고 성공 응답을 data.profile로 반환하는지 검증합니다.
 * 실제 multer 파일, DB와 인증 토큰 처리는 mock으로 분리합니다.
 */
jest.mock("../../src/modules/customer-profile/customer-profile.image", () => ({
  getUploadedProfileImageUrl: jest.fn(),
  removeUploadedProfileImage: jest.fn(),
  validateUploadedProfileImage: jest.fn(),
}));

jest.mock("../../src/modules/customer-profile/customer-profile.service", () => ({
  createCustomerProfile: jest.fn(),
  getCustomerProfile: jest.fn(),
  updateCustomerProfile: jest.fn(),
}));

jest.mock("../../src/modules/customer-profile/customer-profile.validator", () => ({
  parseCreateCustomerProfileInput: jest.fn(),
  parseUpdateCustomerProfileInput: jest.fn(),
}));

import type { NextFunction, Request, Response } from "express";

import {
  createCustomerProfileController,
  getCustomerProfileController,
  updateCustomerProfileController,
} from "../../src/modules/customer-profile/customer-profile.controller";
import {
  getUploadedProfileImageUrl,
  validateUploadedProfileImage,
} from "../../src/modules/customer-profile/customer-profile.image";
import {
  createCustomerProfile,
  getCustomerProfile,
  updateCustomerProfile,
} from "../../src/modules/customer-profile/customer-profile.service";
import {
  parseCreateCustomerProfileInput,
  parseUpdateCustomerProfileInput,
} from "../../src/modules/customer-profile/customer-profile.validator";

const profile = {
  id: "customer-id",
  name: "홍길동",
  email: "customer@example.com",
  phone: null,
  profileImageUrl: null,
  serviceTypes: ["SMALL" as const],
  region: "서울" as const,
  createdAt: "2026-09-14T00:00:00.000Z",
  updatedAt: "2026-09-14T00:00:00.000Z",
};

function createResponse(): Response {
  const response = { status: jest.fn(), json: jest.fn() } as unknown as Response;
  jest.mocked(response.status).mockReturnValue(response);
  return response;
}

describe("Customer Profile controller", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("생성은 토큰의 userId를 사용하고 201 data.profile을 반환한다", async () => {
    const input = { profileImageUrl: null, serviceTypes: ["SMALL" as const], region: "서울" as const };
    jest.mocked(getUploadedProfileImageUrl).mockReturnValue(undefined);
    jest.mocked(parseCreateCustomerProfileInput).mockReturnValue(input);
    jest.mocked(createCustomerProfile).mockResolvedValue(profile);
    const response = createResponse();

    await createCustomerProfileController(
      { body: {}, auth: { userId: "user-id", role: "CUSTOMER" } } as Request,
      response,
      jest.fn() as NextFunction,
    );

    expect(validateUploadedProfileImage).toHaveBeenCalledWith(undefined);
    expect(createCustomerProfile).toHaveBeenCalledWith("user-id", input);
    expect(response.status).toHaveBeenCalledWith(201);
    expect(response.json).toHaveBeenCalledWith({ success: true, data: { profile } });
  });

  test("조회는 profiled guard의 profileId를 사용한다", async () => {
    jest.mocked(getCustomerProfile).mockResolvedValue(profile);
    const response = createResponse();

    await getCustomerProfileController(
      {
        auth: { userId: "user-id", role: "CUSTOMER", profileId: "customer-id" },
      } as Request,
      response,
      jest.fn() as NextFunction,
    );

    expect(getCustomerProfile).toHaveBeenCalledWith("customer-id");
    expect(response.json).toHaveBeenCalledWith({ success: true, data: { profile } });
  });

  test("수정은 profileId와 검증된 DTO를 Service에 전달한다", async () => {
    const input = { phone: null };
    jest.mocked(getUploadedProfileImageUrl).mockReturnValue(undefined);
    jest.mocked(parseUpdateCustomerProfileInput).mockReturnValue(input);
    jest.mocked(updateCustomerProfile).mockResolvedValue(profile);
    const response = createResponse();

    await updateCustomerProfileController(
      {
        body: { phone: "" },
        auth: { userId: "user-id", role: "CUSTOMER", profileId: "customer-id" },
      } as Request,
      response,
      jest.fn() as NextFunction,
    );

    expect(updateCustomerProfile).toHaveBeenCalledWith("customer-id", input);
    expect(response.status).toHaveBeenCalledWith(200);
  });
});
