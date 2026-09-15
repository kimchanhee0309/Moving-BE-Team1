/**
 * Review API의 입력과 외부 응답 DTO를 정의합니다.
 * Prisma Review/Customer/User 원문과 password hash, 이메일, 전화번호는 응답에 넣지 않습니다.
 *
 * 담당 기능: 리뷰 작성, 고객 작성가능/작성완료 목록, 기사님 받은 리뷰 목록
 * 계층 책임: API 필드 의미와 허용값만 선언하며 HTTP·DB 처리는 하지 않습니다.
 */

/** 고객 리뷰 목록의 탭입니다. WRITABLE은 작성 가능한 완료 요청, WRITTEN은 이미 쓴 리뷰입니다. */
export type CustomerReviewListType = "WRITABLE" | "WRITTEN";

/**
 * 경로의 기사님 식별자입니다.
 * 값은 Prisma Mover.id와 같은 UUID 문자열이며 User.id가 아닙니다.
 */
export interface ReviewMoverIdParams {
  moverId: string;
}

/**
 * 목록 Query의 페이지 값입니다.
 * page는 1부터 시작하는 페이지 번호(최대 2147483647), pageSize는 한 페이지 건수(최대 50건)입니다.
 * (page - 1) * pageSize는 Prisma skip/PostgreSQL OFFSET INT4 상한 2147483647을 넘을 수 없습니다.
 */
export interface ListReviewsQuery {
  page: number;
  pageSize: number;
}

/**
 * 고객 리뷰 목록 Query입니다.
 * type은 탭 구분이며 page·pageSize는 공통 목록 페이지네이션입니다.
 */
export interface ListCustomerReviewsQuery extends ListReviewsQuery {
  type: CustomerReviewListType;
}

/**
 * 리뷰 작성 Body입니다.
 * rating은 1~5 정수, content는 공백 제거 후 10~500자입니다.
 */
export interface CreateReviewInput {
  moveRequestId: string;
  rating: number;
  content: string;
}

/** 고객 화면의 기사님 카드입니다. 비밀번호와 연락처는 포함하지 않습니다. */
export interface ReviewMoverCardDto {
  id: string;
  nickname: string;
  profileImageUrl: string | null;
}

/**
 * 기사님이 받은 리뷰에 노출하는 고객 카드입니다.
 * name은 User.name이며 이메일·전화번호는 넣지 않습니다.
 */
export interface ReviewCustomerCardDto {
  id: string;
  name: string;
  profileImageUrl: string | null;
}

/**
 * 고객 리뷰 카드의 이사 요청 요약입니다.
 * moveDate는 ISO 8601이며 fromAddress·toAddress는 본인 요청에만 내려줍니다.
 */
export interface ReviewMoveRequestDto {
  id: string;
  serviceType: string;
  moveDate: string;
  fromAddress: string;
  toAddress: string;
}

/**
 * POST /reviews 성공 시 data.review입니다.
 * id는 Review 식별자, createdAt은 작성 시각(ISO 8601)입니다.
 */
export interface ReviewDto {
  id: string;
  moveRequestId: string;
  moverId: string;
  rating: number;
  content: string;
  createdAt: string;
  mover: ReviewMoverCardDto;
  moveRequest: ReviewMoveRequestDto;
}

/**
 * 작성 가능한 리뷰 카드입니다.
 * Review 행이 아직 없으므로 id·rating·content는 없습니다.
 */
export interface WritableReviewDto {
  mover: ReviewMoverCardDto;
  moveRequest: ReviewMoveRequestDto;
}

/**
 * 기사님이 받은 리뷰 카드입니다.
 * 공개 목록이라 고객 주소는 넣지 않고 서비스 유형만 포함합니다.
 */
export interface ReceivedReviewDto {
  id: string;
  rating: number;
  content: string;
  createdAt: string;
  serviceType: string;
  customer: ReviewCustomerCardDto;
}

/**
 * 템플릿의 Page 기반 목록 pagination입니다.
 * totalCount는 전체 건수, totalPages는 올림한 페이지 수이며 0건이면 0입니다.
 */
export interface ReviewPaginationDto {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

/**
 * 기사님 받은 리뷰의 집계입니다.
 * averageRating은 소수점 첫째 자리이며 리뷰가 없으면 null입니다.
 */
export interface ReviewSummaryDto {
  reviewCount: number;
  averageRating: number | null;
}

/** GET /customers/me/reviews?type=WRITTEN 성공 data입니다. */
export interface WrittenReviewListDto {
  type: "WRITTEN";
  items: ReviewDto[];
  pagination: ReviewPaginationDto;
}

/** GET /customers/me/reviews?type=WRITABLE 성공 data입니다. */
export interface WritableReviewListDto {
  type: "WRITABLE";
  items: WritableReviewDto[];
  pagination: ReviewPaginationDto;
}

export type CustomerReviewListDto = WrittenReviewListDto | WritableReviewListDto;

/** GET /movers/:moverId/reviews 와 GET /movers/me/reviews 성공 data입니다. */
export interface ReceivedReviewListDto {
  items: ReceivedReviewDto[];
  pagination: ReviewPaginationDto;
  summary: ReviewSummaryDto;
}
