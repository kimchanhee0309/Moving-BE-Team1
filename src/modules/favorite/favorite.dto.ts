/**
 * Favorite API의 입력과 외부 응답 DTO를 정의합니다.
 * Prisma Favorite/Mover 원문과 password 같은 내부 필드는 응답에 포함하지 않습니다.
 *
 * 담당 기능: 찜 등록·목록 조회·해제
 * 계층 책임: API 필드 의미와 허용값만 선언하며 HTTP·DB 처리는 하지 않습니다.
 */

/**
 * 경로의 기사님 식별자입니다.
 * 값은 Prisma Mover.id와 같은 UUID 문자열이며, client가 보낸 customerId는 사용하지 않습니다.
 */
export interface FavoriteMoverIdParams {
  moverId: string;
}

/**
 * 찜 목록 Query입니다.
 * page는 1부터 시작하는 페이지 번호(최대 2147483647), pageSize는 한 페이지 개수(최대 50건)입니다.
 * (page - 1) * pageSize는 Prisma skip/PostgreSQL OFFSET INT4 상한 2147483647을 넘을 수 없습니다.
 */
export interface ListFavoritesQuery {
  page: number;
  pageSize: number;
}

/**
 * 목록·등록 응답에 넣는 기사님 카드입니다.
 * profileImageUrl과 averageRating만 리뷰가 없거나 이미지가 없을 때 null입니다.
 */
export interface FavoriteMoverDto {
  id: string;
  nickname: string;
  profileImageUrl: string | null;
  careerYears: number;
  shortIntroduction: string;
  serviceTypes: string[];
  regions: string[];
  reviewCount: number;
  averageRating: number | null;
  favoriteCount: number;
}

/**
 * 단건 찜 응답입니다.
 * id는 Favorite 식별자, createdAt은 찜 등록 시각(ISO 8601)입니다.
 */
export interface FavoriteDto {
  id: string;
  moverId: string;
  createdAt: string;
  mover: FavoriteMoverDto;
}

/**
 * 템플릿의 Page 기반 목록 pagination입니다.
 * page/pageSize는 요청과 동일하고, totalCount는 전체 찜 수, totalPages는 올림한 페이지 수입니다.
 */
export interface FavoritePaginationDto {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

/** GET /favorites 성공 data입니다. items가 비어 있어도 pagination은 항상 포함합니다. */
export interface FavoriteListDto {
  items: FavoriteDto[];
  pagination: FavoritePaginationDto;
}
