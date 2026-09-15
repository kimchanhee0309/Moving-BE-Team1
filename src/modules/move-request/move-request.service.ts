/**
 * MoveRequest/DesignatedRequest 도메인의 권한·비즈니스 규칙·상태 전이·transaction 경계를 담당합니다.
 * Prisma 세부 query는 `move-request.repository.ts`에 위임합니다.
 */
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../common/errors/app-error";
import { prisma } from "../../lib/prisma";
import {
  SERVICE_TYPE_NAMES,
  type CreateDesignatedRequestInput,
  type CreateMoveRequestInput,
  type DesignatedRequestDto,
  type MoveRequestDto,
  type ServiceTypeName,
} from "./move-request.dto";
import {
  countDesignatedRequestsByMoveRequestId,
  createDesignatedRequest,
  createMoveRequest,
  findActiveMoveRequestByCustomerId,
  findDesignatedRequestByMoveRequestAndMover,
  findMoveRequestByIdForUpdate,
  findMoverById,
  findServiceTypeIdByName,
  type DesignatedRequestRecord,
  type MoveRequestRecord,
} from "./move-request.repository";

// 일반 견적(5명)·총합(8명) 제한은 mover-request가 담당하고, 이 모듈은 지정 요청 3명 제한만 검증합니다.
const DESIGNATED_REQUEST_LIMIT = 3;

// validator가 이미 3개 값으로만 통과시키므로 여기서 막히면 seed/DB 데이터 문제입니다.
// AppError가 아닌 일반 Error를 던져 전역 handler가 500으로 처리하게 둡니다.
function assertServiceTypeName(name: string): ServiceTypeName {
  if ((SERVICE_TYPE_NAMES as readonly string[]).includes(name)) {
    return name as ServiceTypeName;
  }

  throw new Error(`알 수 없는 ServiceType name입니다: ${name}`);
}

function toMoveRequestDto(record: MoveRequestRecord): MoveRequestDto {
  return {
    id: record.id,
    serviceType: assertServiceTypeName(record.serviceType.name),
    moveDate: record.moveDate.toISOString(),
    fromAddress: record.fromAddress,
    toAddress: record.toAddress,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toDesignatedRequestDto(record: DesignatedRequestRecord): DesignatedRequestDto {
  return {
    id: record.id,
    moveRequestId: record.moveRequestId,
    moverId: record.moverId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function createMoveRequestForCustomer(
  customerId: string,
  input: CreateMoveRequestInput,
): Promise<MoveRequestDto> {
  const now = new Date();

  // UTC 캘린더 날짜 기준 비교(응답 예시가 moveDate를 UTC 자정으로 저장하는 것을 근거로 한 임시
  // 가정). 실제 timezone 기준은 문서에도 미정으로 남아 있어 추후 팀 협의 필요.
  const moveDate = new Date(`${input.moveDate}T00:00:00.000Z`);
  const todayUtcMidnight = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
  // "2026-02-30"처럼 형식은 맞지만 실존하지 않는 날짜는 Date가 조용히 다음 날짜로 넘겨버리므로,
  // 파싱 결과를 다시 문자열로 되돌려 입력과 같은지 확인해야 롤오버를 걸러낼 수 있습니다.
  const isInvalidCalendarDate =
    Number.isNaN(moveDate.getTime()) ||
    moveDate.toISOString().slice(0, 10) !== input.moveDate;

  if (isInvalidCalendarDate || moveDate.getTime() <= todayUtcMidnight.getTime()) {
    throw new BadRequestError("moveDate는 오늘(UTC 기준)보다 미래여야 합니다.", "VALIDATION_ERROR", [
      { field: "moveDate", reason: "오늘 이후의 유효한 날짜여야 합니다." },
    ]);
  }

  const serviceType = await findServiceTypeIdByName(input.serviceType);

  if (!serviceType) {
    throw new Error(`ServiceType을 찾을 수 없습니다: ${input.serviceType}`);
  }

  // 활성 요청 확인과 생성을 같은 transaction으로 묶어 동시 요청으로 인한 중복 생성을 줄입니다.
  const created = await prisma.$transaction(async (tx) => {
    const activeMoveRequest = await findActiveMoveRequestByCustomerId(customerId, now, tx);

    if (activeMoveRequest) {
      throw new ConflictError(
        "이미 진행 중인 이사 견적 요청이 있습니다.",
        "ACTIVE_MOVE_REQUEST_EXISTS",
      );
    }

    return createMoveRequest(
      {
        customerId,
        serviceTypeId: serviceType.id,
        moveDate,
        fromAddress: input.fromAddress,
        toAddress: input.toAddress,
      },
      tx,
    );
  });

  return toMoveRequestDto(created);
}

export async function getActiveMoveRequestForCustomer(
  customerId: string,
): Promise<MoveRequestDto | null> {
  const record = await findActiveMoveRequestByCustomerId(customerId, new Date());

  return record ? toMoveRequestDto(record) : null;
}

// 검증 순서(문서의 오류 표 기준): 존재 확인 → 소유권 → 상태 → mover 존재 → 중복 → 인원 초과.
// 확인과 insert 사이에 다른 요청이 끼어들지 못하게, MoveRequest row를 FOR UPDATE로 잠근 채로
// 전부 같은 트랜잭션 안에서 재확인한다(상태 재확인 경쟁 + 인원 수 경쟁을 함께 막는다).
export async function createDesignatedRequestForCustomer(
  customerId: string,
  moveRequestId: string,
  input: CreateDesignatedRequestInput,
): Promise<DesignatedRequestDto> {
  const created = await prisma.$transaction(async (tx) => {
    const moveRequest = await findMoveRequestByIdForUpdate(moveRequestId, tx);

    if (!moveRequest) {
      throw new NotFoundError(
        "이사 견적 요청을 찾을 수 없습니다.",
        "MOVE_REQUEST_NOT_FOUND",
      );
    }

    // client가 보낸 값이 아니라 인증된 customerId와 DB의 소유 관계로만 소유권을 판단합니다.
    if (moveRequest.customerId !== customerId) {
      throw new ForbiddenError(
        "본인의 이사 견적 요청이 아닙니다.",
        "MOVE_REQUEST_FORBIDDEN",
      );
    }

    if (moveRequest.status !== "WAITING") {
      throw new ConflictError(
        "이미 확정되었거나 완료된 이사 견적 요청입니다.",
        "MOVE_REQUEST_ALREADY_CONFIRMED",
      );
    }

    const mover = await findMoverById(input.moverId, tx);

    if (!mover) {
      throw new NotFoundError("기사님을 찾을 수 없습니다.", "MOVER_NOT_FOUND");
    }

    // unique 제약(P2002)에 기대지 않고 명시적으로 먼저 조회해 문서가 요구하는
    // DESIGNATED_REQUEST_ALREADY_EXISTS 코드를 그대로 던집니다.
    const existingDesignatedRequest = await findDesignatedRequestByMoveRequestAndMover(
      moveRequestId,
      input.moverId,
      tx,
    );

    if (existingDesignatedRequest) {
      throw new ConflictError(
        "이미 같은 기사님에게 지정 요청을 보냈습니다.",
        "DESIGNATED_REQUEST_ALREADY_EXISTS",
      );
    }

    const designatedRequestCount = await countDesignatedRequestsByMoveRequestId(
      moveRequestId,
      tx,
    );

    if (designatedRequestCount >= DESIGNATED_REQUEST_LIMIT) {
      throw new ConflictError(
        "지정 견적 최대 인원(3명)을 초과했습니다.",
        "DESIGNATED_REQUEST_LIMIT_EXCEEDED",
      );
    }

    return createDesignatedRequest({ moveRequestId, moverId: input.moverId }, tx);
  });

  return toDesignatedRequestDto(created);
}
