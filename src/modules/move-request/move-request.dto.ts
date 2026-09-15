/**
 * MoveRequest/DesignatedRequest API의 요청·응답 타입을 정의합니다.
 * serviceType은 내부 UUID가 아니라 SERVICE_TYPE_NAMES 문자열로 주고받습니다.
 */
import type { MoveRequestStatus } from "../../generated/prisma/enums";

export const SERVICE_TYPE_NAMES = ["SMALL", "HOME", "OFFICE"] as const;
export type ServiceTypeName = (typeof SERVICE_TYPE_NAMES)[number];

export type {
  CreateDesignatedRequestInput,
  CreateMoveRequestInput,
} from "./move-request.validator";

export interface MoveRequestDto {
  id: string;
  serviceType: ServiceTypeName;
  moveDate: string;
  fromAddress: string;
  toAddress: string;
  status: MoveRequestStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DesignatedRequestDto {
  id: string;
  moveRequestId: string;
  moverId: string;
  createdAt: string;
  updatedAt: string;
}
