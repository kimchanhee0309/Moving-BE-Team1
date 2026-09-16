/**
 * Mover Profile Controller가 Auth context와 공통 응답을 사용하고 실패 파일을 정리하는지 검증합니다.
 * 실제 Multer 파일, DB와 JWT 처리는 mock으로 격리합니다.
 */
jest.mock("../../src/modules/mover-profile/mover-profile.image", () => ({
  getUploadedMoverProfileImageUrl: jest.fn(),
  removeUploadedMoverProfileImage: jest.fn(),
  validateUploadedMoverProfileImage: jest.fn(),
}));

jest.mock("../../src/modules/mover-profile/mover-profile.service", () => ({
  createMoverProfile: jest.fn(),
  getMoverProfile: jest.fn(),
  updateMoverProfile: jest.fn(),
}));

jest.mock("../../src/modules/mover-profile/mover-profile.validator", () => ({
  parseCreateMoverProfileRequest: jest.fn(),
  parseUpdateMoverProfileRequest: jest.fn(),
}));

import type { Request, Response } from "express";

import {
  createMoverProfileController,
  getMoverProfileController,
  updateMoverProfileController,
} from "../../src/modules/mover-profile/mover-profile.controller";
import {
  getUploadedMoverProfileImageUrl,
  removeUploadedMoverProfileImage,
  validateUploadedMoverProfileImage,
} from "../../src/modules/mover-profile/mover-profile.image";
import {
  createMoverProfile,
  getMoverProfile,
  updateMoverProfile,
} from "../../src/modules/mover-profile/mover-profile.service";
import {
  parseCreateMoverProfileRequest,
  parseUpdateMoverProfileRequest,
} from "../../src/modules/mover-profile/mover-profile.validator";

const profile = {
  id: "mover-id",
  profileImageUrl: null,
  nickname: "김코드",
  careerYears: 8,
  shortIntroduction: "꼼꼼한 이사",
  description: "안전하게 운송합니다.",
  serviceTypes: ["SMALL" as const],
  regions: ["서울" as const],
  createdAt: "2026-09-16T00:00:00.000Z",
  updatedAt: "2026-09-16T00:00:00.000Z",
};

function createResponse(): Response {
  const response = { status: jest.fn(), json: jest.fn() } as unknown as Response;
  jest.mocked(response.status).mockReturnValue(response);
  return response;
}

describe("Mover Profile controller", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("생성은 token userId를 사용하고 201 data.profile을 반환한다", async () => {
    const input = {
      ...profile,
      profileImageUrl: null,
    };
    jest.mocked(getUploadedMoverProfileImageUrl).mockReturnValue(undefined);
    jest.mocked(parseCreateMoverProfileRequest).mockReturnValue(input);
    jest.mocked(createMoverProfile).mockResolvedValue(profile);
    const response = createResponse();

    await createMoverProfileController(
      {
        body: {},
        auth: { userId: "user-id", role: "MOVER" },
      } as Request,
      response,
      jest.fn(),
    );

    expect(validateUploadedMoverProfileImage).toHaveBeenCalledWith(undefined);
    expect(createMoverProfile).toHaveBeenCalledWith("user-id", input);
    expect(response.status).toHaveBeenCalledWith(201);
    expect(response.json).toHaveBeenCalledWith({
      success: true,
      data: { profile },
    });
  });

  test("조회와 수정은 profiled guard가 만든 mover profileId를 사용한다", async () => {
    jest.mocked(getMoverProfile).mockResolvedValue(profile);
    jest.mocked(parseUpdateMoverProfileRequest).mockReturnValue({ careerYears: 10 });
    jest.mocked(updateMoverProfile).mockResolvedValue({ ...profile, careerYears: 10 });
    const getResponse = createResponse();
    const patchResponse = createResponse();
    const request = {
      body: { careerYears: "10" },
      auth: { userId: "user-id", role: "MOVER", profileId: "mover-id" },
    } as Request;

    await getMoverProfileController(request, getResponse, jest.fn());
    await updateMoverProfileController(request, patchResponse, jest.fn());

    expect(getMoverProfile).toHaveBeenCalledWith("mover-id");
    expect(updateMoverProfile).toHaveBeenCalledWith("mover-id", {
      careerYears: 10,
    });
    expect(patchResponse.status).toHaveBeenCalledWith(200);
  });

  test("DB 실패 시 이번 요청에서 업로드한 새 이미지를 정리한다", async () => {
    const file = { path: "new-image" } as Express.Multer.File;
    jest.mocked(getUploadedMoverProfileImageUrl).mockReturnValue(
      "/uploads/mover-profiles/new-image.jpg",
    );
    jest.mocked(parseUpdateMoverProfileRequest).mockReturnValue({
      profileImageUrl: "/uploads/mover-profiles/new-image.jpg",
    });
    jest.mocked(updateMoverProfile).mockRejectedValue(new Error("DB failure"));

    await expect(
      updateMoverProfileController(
        {
          body: {},
          file,
          auth: { userId: "user-id", role: "MOVER", profileId: "mover-id" },
        } as Request,
        createResponse(),
        jest.fn(),
      ),
    ).rejects.toThrow("DB failure");

    expect(removeUploadedMoverProfileImage).toHaveBeenCalledWith(file);
  });
});
