/**
 * 이사 요청 완료 전이(CONFIRMED → COMPLETED)가
 * - 이사일이 "오늘 UTC 자정"보다 이전인 CONFIRMED 요청만 대상으로 하는지(이사 당일은 제외)
 * - 활성 요청 판단(findActiveMoveRequestByCustomerId)과 같은 날짜 경계를 쓰는지
 * - 전달받은 transaction client를 사용하는지
 * - service가 현재 시각 기본값과 전이 건수를 그대로 전달하는지
 * 를 검증합니다. 실제 DB 대신 Prisma client를 mock합니다.
 */
const mockMoveRequestUpdateMany = jest.fn();

jest.mock("../../src/lib/prisma", () => ({
  prisma: {
    moveRequest: {
      updateMany: (...args: unknown[]) => mockMoveRequestUpdateMany(...args),
    },
  },
}));

import type { Prisma } from "../../src/generated/prisma/client";
import { runMoveRequestCompletionJob } from "../../src/modules/move-request/move-request-completion.service";
import { completePastConfirmedMoveRequests } from "../../src/modules/move-request/move-request.repository";

describe("completePastConfirmedMoveRequests", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("오늘 UTC 자정보다 이사일이 이전인 CONFIRMED 요청만 COMPLETED로 바꾸고 바뀐 수를 반환한다", async () => {
    // 사전 조건: KST 2026-10-16 15:00(=UTC 06:00). 오늘 UTC 날짜는 2026-10-16입니다.
    mockMoveRequestUpdateMany.mockResolvedValue({ count: 3 });

    const count = await completePastConfirmedMoveRequests(new Date("2026-10-16T06:00:00.000Z"));

    // 기대 결과: 이사일이 10-15 이전인 요청만 대상이며, 10-16(이사 당일)은 lt 조건으로 제외됩니다.
    expect(mockMoveRequestUpdateMany).toHaveBeenCalledWith({
      where: {
        status: "CONFIRMED",
        moveDate: { lt: new Date("2026-10-16T00:00:00.000Z") },
      },
      data: { status: "COMPLETED" },
    });
    expect(count).toBe(3);
  });

  test("UTC 날짜가 바뀌기 전(KST 오전 8시)에는 전날이 이사일인 요청도 아직 대상이 아니다", async () => {
    // 사전 조건: KST 2026-10-17 08:00(=UTC 2026-10-16 23:00). 활성 요청 판단과 같은 UTC 날짜 기준입니다.
    mockMoveRequestUpdateMany.mockResolvedValue({ count: 0 });

    await completePastConfirmedMoveRequests(new Date("2026-10-16T23:00:00.000Z"));

    // 기대 결과: 경계는 2026-10-16 UTC 자정이므로 이사일 10-16 요청은 아직 CONFIRMED로 남습니다.
    expect(mockMoveRequestUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          moveDate: { lt: new Date("2026-10-16T00:00:00.000Z") },
        }),
      }),
    );
  });

  test("transaction client를 넘기면 기본 prisma 대신 그 client로 갱신한다", async () => {
    const transactionUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const transaction = {
      moveRequest: { updateMany: transactionUpdateMany },
    } as unknown as Prisma.TransactionClient;

    const count = await completePastConfirmedMoveRequests(new Date("2026-10-16T06:00:00.000Z"), transaction);

    expect(transactionUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockMoveRequestUpdateMany).not.toHaveBeenCalled();
    expect(count).toBe(1);
  });
});

describe("runMoveRequestCompletionJob", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("주입한 기준 시각으로 전이를 실행하고 전이 건수를 반환한다", async () => {
    mockMoveRequestUpdateMany.mockResolvedValue({ count: 2 });

    const count = await runMoveRequestCompletionJob(new Date("2026-10-20T01:00:00.000Z"));

    expect(mockMoveRequestUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          moveDate: { lt: new Date("2026-10-20T00:00:00.000Z") },
        }),
      }),
    );
    expect(count).toBe(2);
  });

  test("DB 오류는 삼키지 않고 그대로 던져 scheduler가 실패를 기록할 수 있게 한다", async () => {
    mockMoveRequestUpdateMany.mockRejectedValue(new Error("connection lost"));

    await expect(runMoveRequestCompletionJob(new Date("2026-10-20T01:00:00.000Z"))).rejects.toThrow(
      "connection lost",
    );
  });
});
