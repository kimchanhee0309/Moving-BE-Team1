/**
 * 기사님의 받은 요청 조회 권한과 목록 pagination을 처리
 * Express 객체에 의존하지 않고 Repository 결과를 외부 API DTO로 변환
 */
import { NotFoundError } from "../../common/errors/app-error";
import type {
  GetReceivedRequestsQuery,
  ReceivedRequestDetailDto,
  ReceivedRequestItemDto,
  ReceivedRequestListDto,
} from "./mover-request.dto";
import {
  findReceivedRequestById,
  findReceivedRequests,
  type ReceivedRequestRecord,
} from "./mover-request.repository";

function toReceivedRequestItemDto(
  record: ReceivedRequestRecord,
): ReceivedRequestItemDto {
  return {
    requestId: record.id,
    customerName: record.customer.user.name,
    serviceType: record.serviceType.name,
    isDesignated: record.designatedRequests.length > 0,
    moveDate: record.moveDate.toISOString(),
    fromAddress: record.fromAddress,
    toAddress: record.toAddress,
    requestedAt: record.createdAt.toISOString(),
  };
}

function toReceivedRequestDetailDto(
  record: ReceivedRequestRecord,
): ReceivedRequestDetailDto {
  return {
    ...toReceivedRequestItemDto(record),
    status: record.status,
  };
}

/** 기사님이 아직 처리하지 않은 요청 목록과 cursor 정보를 반환 */
export async function getReceivedRequests(
  moverId: string,
  query: GetReceivedRequestsQuery,
  now = new Date(),
): Promise<ReceivedRequestListDto> {
  const records = await findReceivedRequests({
    moverId,
    now,
    ...query,
  });

  const hasNext = records.length > query.limit;
  const pageRecords = records.slice(0, query.limit);
  const items = pageRecords.map(toReceivedRequestItemDto);
  const lastItem = items.at(-1);

  return {
    items,
    pagination: {
      nextCursor: hasNext && lastItem ? lastItem.requestId : null,
      hasNext,
    },
  };
}

/**
 * 현재 기사님이 조회하고 처리할 수 있는 요청 상세를 반환
 * 대상이 없거나 이미 처리했거나 서비스 조건이 맞지 않으면 동일한 404로 숨김
 */
export async function getReceivedRequestDetail(
  moverId: string,
  requestId: string,
  now = new Date(),
): Promise<ReceivedRequestDetailDto> {
  const record = await findReceivedRequestById({
    moverId,
    requestId,
    now,
  });

  if (!record) {
    throw new NotFoundError(
      "받은 요청을 찾을 수 없습니다.",
      "REQUEST_NOT_FOUND",
    );
  }

  return toReceivedRequestDetailDto(record);
}
