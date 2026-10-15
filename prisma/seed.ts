/**
 * 로컬 개발용 사용자와 도메인 예시 데이터를 생성합니다.
 * Seed 계정도 실제 Auth와 같은 bcrypt 해시를 사용하며 실행 전 기존 seed 전용 데이터를 삭제합니다.
 *
 * 화면 확인 시나리오별로 계정을 나눠 둡니다. 실행이 끝나면 시나리오별 로그인 계정 목록을 출력합니다.
 * - 받은 견적 확인·확정: 대기 중인 요청에 견적이 여러 건 도착한 일반 유저
 * - 리뷰 작성: 이사가 끝났고 아직 리뷰를 쓰지 않은 일반 유저
 * - 반려한 요청: 요청을 반려한 기록이 있는 기사님(RequestRejection)
 * - 견적 보내기: 아직 견적이 없는 대기 요청을 받은 기사님
 *
 * 모든 seed 계정의 이메일은 SEED_EMAIL_DOMAIN으로 끝나며, 실행할 때마다 이 도메인의 계정과
 * 그 계정들이 만든 요청·견적·반려·리뷰·알림을 지우고 다시 만듭니다. 대상 DB를 반드시 확인하고 실행합니다.
 */
import {
  MoveRequestStatus,
  NotificationType,
  type Prisma,
  QuoteStatus,
  UserRole,
} from "../src/generated/prisma/client";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/modules/auth/password";

const SEED_EMAIL_DOMAIN = "@seed.moving.local";
const SEED_PASSWORD = "Moving1234!";

const REVIEW_TEST_CUSTOMER_EMAIL = "aaa123@test.com";

const SERVICE_TYPE_NAMES = ["SMALL", "HOME", "OFFICE"] as const;

type ServiceTypeName = (typeof SERVICE_TYPE_NAMES)[number];

/** 알림 문구에 쓰는 서비스 유형 표시 이름입니다. 앱의 알림 생성 문구와 같게 맞춥니다. */
const SERVICE_TYPE_LABELS: Record<ServiceTypeName, string> = {
  SMALL: "소형이사",
  HOME: "가정이사",
  OFFICE: "사무실이사",
};

const REGION_NAMES = [
  "SEOUL",
  "BUSAN",
  "DAEGU",
  "INCHEON",
  "GWANGJU",
  "DAEJEON",
  "ULSAN",
  "SEJONG",
  "GYEONGGI",
  "GANGWON",
  "CHUNGBUK",
  "CHUNGNAM",
  "JEONBUK",
  "JEONNAM",
  "GYEONGBUK",
  "GYEONGNAM",
  "JEJU",
] as const;

type RegionName = (typeof REGION_NAMES)[number];

interface CustomerSeed {
  /** 요청·찜 seed에서 고객을 가리키는 내부 키입니다. DB에는 저장하지 않습니다. */
  key: string;
  name: string;
  email: string;
  phone: string;
  region: RegionName;
  serviceTypes: ServiceTypeName[];
  /** 실행 결과 표에 보여 줄 확인용 시나리오 설명입니다. */
  scenario: string;
}

interface MoverSeed {
  /** 요청·견적 seed에서 기사님을 가리키는 내부 키입니다. DB에는 저장하지 않습니다. */
  key: string;
  name: string;
  email: string;
  phone: string;
  nickname: string;
  careerYears: number;
  shortIntroduction: string;
  description: string;
  regions: RegionName[];
  serviceTypes: ServiceTypeName[];
  scenario: string;
}

interface QuoteSeed {
  mover: string;
  price: number;
  comment: string;
  /** 요청 생성 후 몇 시간 뒤에 견적을 보냈는지입니다. */
  hoursAfterRequest: number;
}

interface RejectionSeed {
  mover: string;
  reason: string;
  hoursAfterRequest: number;
}

interface ReviewSeed {
  rating: number;
  content: string;
  /** 이사일로부터 며칠 뒤에 리뷰를 썼는지입니다. */
  daysAfterMove: number;
}

/**
 * 이사 요청 한 건과 그 요청에 달린 견적·반려·리뷰입니다.
 * - WAITING: proposedQuotes가 PROPOSED 견적이 됩니다. 이사일은 미래여야 합니다.
 * - CONFIRMED: confirmedQuote가 확정 견적, declinedQuotes는 고객이 다른 견적을 골라 REJECTED가 된 견적입니다.
 * - COMPLETED: CONFIRMED와 같고 이사일이 과거입니다. review가 없으면 고객의 "작성 가능한 리뷰"에 나옵니다.
 * rejections는 기사님이 요청 자체를 반려한 기록(RequestRejection)으로, 기사님의 "반려 요청" 목록에 나옵니다.
 */
interface MoveRequestSeed {
  customer: string;
  serviceType: ServiceTypeName;
  /** 오늘 기준 이사일까지의 일 수입니다. 음수면 이미 지난 이사입니다. */
  moveDateOffset: number;
  /** 요청을 만든 시점(오늘 기준 며칠 전)입니다. */
  createdDaysAgo: number;
  fromAddress: string;
  toAddress: string;
  status: MoveRequestStatus;
  /** 지정 견적 요청을 보낸 기사님입니다. 최대 3명입니다. */
  designatedMovers?: string[];
  proposedQuotes?: QuoteSeed[];
  confirmedQuote?: QuoteSeed;
  declinedQuotes?: QuoteSeed[];
  rejections?: RejectionSeed[];
  review?: ReviewSeed;
}

interface CreatedCustomer {
  userId: string;
  customerId: string;
  name: string;
}

interface CreatedMover {
  userId: string;
  moverId: string;
  name: string;
  nickname: string;
}

interface SeedSummary {
  moveRequests: number;
  quotes: number;
  rejections: number;
  reviews: number;
  notifications: number;
}

/**
 * aaa123@test.com 고객의 리뷰 화면을 확인하기 위한 완료 이사 데이터입니다.
 *
 * review가 있으면 WRITTEN 목록에 표시되고,
 * review가 없으면 WRITABLE 목록에 표시됩니다.
 */
interface ReviewTestFixtureSeed {
  moveRequestId: string;
  quoteId: string;
  serviceType: ServiceTypeName;
  moverIndex: number;
  moveDateOffset: number;
  fromAddress: string;
  toAddress: string;
  price: number;
  comment: string;
  review?: {
    id: string;
    rating: number;
    content: string;
    createdAtOffset: number;
  };
}

interface ReviewTestFixtureSummary {
  moveRequests: number;
  quotes: number;
  writtenReviews: number;
  writableReviews: number;
}

const CUSTOMER_SEEDS: CustomerSeed[] = [
  // ── 기존 seed 계정 (아이디 customer01~10 유지) ──
  {
    key: "minseo",
    name: "김민서",
    email: `customer01${SEED_EMAIL_DOMAIN}`,
    phone: "010-2913-4408",
    region: "SEOUL",
    serviceTypes: ["SMALL", "HOME"],
    scenario: "받은 견적 확인·확정 (지정 1건 포함 2건)",
  },
  {
    key: "seojun",
    name: "이서준",
    email: `customer02${SEED_EMAIL_DOMAIN}`,
    phone: "010-7731-0526",
    region: "GYEONGGI",
    serviceTypes: ["HOME"],
    scenario: "받은 견적 확인·확정 (2건) + 작성한 리뷰 1건",
  },
  {
    key: "jiwoo",
    name: "박지우",
    email: `customer03${SEED_EMAIL_DOMAIN}`,
    phone: "010-4058-6612",
    region: "INCHEON",
    serviceTypes: ["SMALL", "OFFICE"],
    scenario: "받은 견적 확인·확정 (사무실, 지정 1건 포함 2건) + 작성한 리뷰 1건",
  },
  {
    key: "yujin",
    name: "최유진",
    email: `customer04${SEED_EMAIL_DOMAIN}`,
    phone: "010-6627-3190",
    region: "BUSAN",
    serviceTypes: ["HOME", "OFFICE"],
    scenario: "받은 견적 확인·확정 (2건)",
  },
  {
    key: "doyoon",
    name: "정도윤",
    email: `customer05${SEED_EMAIL_DOMAIN}`,
    phone: "010-3384-7051",
    region: "DAEGU",
    serviceTypes: ["SMALL"],
    scenario: "요청만 하고 아직 견적 없음 (지정 1명) + 작성한 리뷰 1건",
  },
  {
    key: "sua",
    name: "한수아",
    email: `customer06${SEED_EMAIL_DOMAIN}`,
    phone: "010-9041-2287",
    region: "DAEJEON",
    serviceTypes: ["HOME"],
    scenario: "견적 확정 후 이사 대기",
  },
  {
    key: "jiho_o",
    name: "오지호",
    email: `customer07${SEED_EMAIL_DOMAIN}`,
    phone: "010-5176-8834",
    region: "GWANGJU",
    serviceTypes: ["SMALL", "HOME"],
    scenario: "견적 확정 후 이사 대기",
  },
  {
    key: "seoyeon_y",
    name: "윤서연",
    email: `customer08${SEED_EMAIL_DOMAIN}`,
    phone: "010-2560-9473",
    region: "ULSAN",
    serviceTypes: ["OFFICE"],
    scenario: "견적 확정 후 이사 대기 (사무실)",
  },
  {
    key: "hajun",
    name: "강하준",
    email: `customer09${SEED_EMAIL_DOMAIN}`,
    phone: "010-8812-5340",
    region: "SEJONG",
    serviceTypes: ["SMALL", "OFFICE"],
    scenario: "이사 완료 + 작성한 리뷰 1건",
  },
  {
    key: "chaewon",
    name: "임채원",
    email: `customer10${SEED_EMAIL_DOMAIN}`,
    phone: "010-4495-1768",
    region: "JEJU",
    serviceTypes: ["HOME", "OFFICE"],
    scenario: "리뷰 작성 가능 1건",
  },

  // ── 추가 seed 계정 ──
  {
    key: "minji",
    name: "박민지",
    email: `minji.park92${SEED_EMAIL_DOMAIN}`,
    phone: "010-4821-3307",
    region: "SEOUL",
    serviceTypes: ["SMALL"],
    scenario: "받은 견적 확인·확정 (원룸, 견적 3건 중 지정 1건)",
  },
  {
    key: "junho",
    name: "이준호",
    email: `junho.lee${SEED_EMAIL_DOMAIN}`,
    phone: "010-3175-9902",
    region: "GYEONGGI",
    serviceTypes: ["HOME"],
    scenario: "받은 견적 확인·확정 (가정이사, 견적 3건)",
  },
  {
    key: "seoyeon",
    name: "김서연",
    email: `seoyeon.kim0315${SEED_EMAIL_DOMAIN}`,
    phone: "010-6620-1458",
    region: "INCHEON",
    serviceTypes: ["HOME"],
    scenario: "받은 견적 확인·확정 (지정 견적 2건)",
  },
  {
    key: "haneul",
    name: "정하늘",
    email: `haneul.jung${SEED_EMAIL_DOMAIN}`,
    phone: "010-2048-7713",
    region: "SEOUL",
    serviceTypes: ["OFFICE"],
    scenario: "받은 견적 확인·확정 (사무실이사, 견적 3건)",
  },
  {
    key: "yuna",
    name: "최유나",
    email: `yuna.choi${SEED_EMAIL_DOMAIN}`,
    phone: "010-9134-0275",
    region: "BUSAN",
    serviceTypes: ["SMALL", "HOME"],
    scenario: "리뷰 작성 가능 1건 + 작성한 리뷰 1건",
  },
  {
    key: "taewoo",
    name: "강태우",
    email: `taewoo.kang${SEED_EMAIL_DOMAIN}`,
    phone: "010-5507-6631",
    region: "SEOUL",
    serviceTypes: ["SMALL"],
    scenario: "리뷰 작성 가능 1건 + 작성한 리뷰 1건",
  },
  {
    key: "sohee",
    name: "윤소희",
    email: `sohee.yoon${SEED_EMAIL_DOMAIN}`,
    phone: "010-7742-8129",
    region: "DAEGU",
    serviceTypes: ["SMALL"],
    scenario: "리뷰 작성 가능 1건",
  },
  {
    key: "jaehyun",
    name: "임재현",
    email: `jaehyun.lim${SEED_EMAIL_DOMAIN}`,
    phone: "010-8263-4490",
    region: "DAEJEON",
    serviceTypes: ["SMALL", "HOME"],
    scenario: "리뷰 작성 가능 1건 + 작성한 리뷰 1건",
  },
  {
    key: "jiwon",
    name: "한지원",
    email: `jiwon.han${SEED_EMAIL_DOMAIN}`,
    phone: "010-3390-5826",
    region: "GYEONGGI",
    serviceTypes: ["HOME"],
    scenario: "견적 확정 후 이사 대기 + 작성한 리뷰 1건",
  },
  {
    key: "daeun",
    name: "송다은",
    email: `daeun.song${SEED_EMAIL_DOMAIN}`,
    phone: "010-4479-2063",
    region: "JEJU",
    serviceTypes: ["SMALL"],
    scenario: "견적 확정 후 이사 대기 + 작성한 리뷰 1건",
  },
  {
    key: "hyunwoo",
    name: "오현우",
    email: `hyunwoo.oh${SEED_EMAIL_DOMAIN}`,
    phone: "010-6015-3348",
    region: "GWANGJU",
    serviceTypes: ["HOME"],
    scenario: "요청만 하고 아직 견적 없음 (지정 1명)",
  },
  {
    key: "sujin",
    name: "배수진",
    email: `sujin.bae${SEED_EMAIL_DOMAIN}`,
    phone: "010-2856-9174",
    region: "SEOUL",
    serviceTypes: ["SMALL"],
    scenario: "요청만 하고 아직 견적 없음 (지정 2명)",
  },
  {
    key: "jiho",
    name: "문지호",
    email: `jiho.moon${SEED_EMAIL_DOMAIN}`,
    phone: "010-7308-1592",
    region: "SEOUL",
    serviceTypes: ["SMALL", "HOME"],
    scenario: "요청 없음 (새 견적 요청 작성용)",
  },
];

/**
 * 순서를 바꾸지 않습니다. 아래 리뷰 테스트 fixture(aaa123@test.com)가 앞의 네 기사님(mover01~04)을 index로 참조합니다.
 */
const MOVER_SEEDS: MoverSeed[] = [
  // ── 기존 seed 계정 (아이디 mover01~10 유지) ──
  {
    key: "dongwoo",
    name: "김동우",
    email: `mover01${SEED_EMAIL_DOMAIN}`,
    phone: "010-3302-7715",
    nickname: "바른이사 김동우",
    careerYears: 8,
    shortIntroduction: "말씀드린 금액에서 10원도 안 올립니다. 제 계산기는 정직하게 생겼거든요.",
    description:
      "8년 동안 큰 사고 없이 해왔습니다.\n견적 받으실 때 짐 사진 몇 장만 보내주시면 현장에서 금액 바뀔 일 없게 해드려요.\n평일 저녁, 주말 모두 상담 가능합니다.\n현장에서 '어? 이건 추가요금인데요' 하는 말, 저한테선 못 들으실 거예요.",
    regions: ["SEOUL", "GYEONGGI", "INCHEON"],
    serviceTypes: ["SMALL", "HOME", "OFFICE"],
    scenario: "보낸 견적·확정 견적·반려 2건·받은 리뷰가 모두 있음",
  },
  {
    key: "junhyung",
    name: "박준형",
    email: `mover02${SEED_EMAIL_DOMAIN}`,
    phone: "010-6174-2039",
    nickname: "준형이네 용달",
    careerYears: 5,
    shortIntroduction: "1톤 용달 하나로 서울·인천 누빕니다. 답장 속도는 5톤급이에요.",
    description:
      "짐 적은 이사는 반나절이면 끝납니다.\n문자, 전화 답장 빠릅니다. 읽씹은 제 사전에 없어요.\n반포장도 가능하니 편하게 물어보세요.",
    regions: ["SEOUL", "INCHEON"],
    serviceTypes: ["SMALL", "HOME"],
    scenario: "보낸 견적·반려 1건·받은 리뷰 있음",
  },
  {
    key: "hyunwoo_m",
    name: "이현우",
    email: `mover03${SEED_EMAIL_DOMAIN}`,
    phone: "010-2865-4401",
    nickname: "빠른손 이사센터",
    careerYears: 7,
    shortIntroduction: "손은 빠르고 연락은 더 빠릅니다. 문의 남기시면 라면 물 끓기 전에 답드려요.",
    description:
      "팀원 3명이 같이 움직여서 가정이사도 하루 안에 끝냅니다.\n사무실 이전은 주말 작업 위주로 하고 있어요.\n빨리 끝낸다고 대충 하는 거 아니냐고요? 그래서 깨진 그릇이 아직 0개입니다.",
    regions: ["GYEONGGI", "SEOUL"],
    serviceTypes: ["SMALL", "HOME", "OFFICE"],
    scenario: "보낸 견적·지정 요청·받은 리뷰 있음",
  },
  {
    key: "dongmin",
    name: "최동민",
    email: `mover04${SEED_EMAIL_DOMAIN}`,
    phone: "010-7409-1182",
    nickname: "해운대 동민이사",
    careerYears: 10,
    shortIntroduction: "10년간 고객 불만족 0건. 불만은 가끔 제 허리만 합니다.",
    description:
      "부산 토박이고 해운대, 기장, 수영 쪽 고층 아파트 이사를 많이 했습니다.\n불편하셨던 점은 이사 끝나고라도 말씀 주시면 다시 달려갑니다. 광안리 바닷바람보다 빨리요.\n울산·김해까지도 다녀요. 견적은 전화로도 바로 드립니다.",
    regions: ["BUSAN", "GYEONGNAM", "ULSAN"],
    serviceTypes: ["HOME", "OFFICE"],
    scenario: "보낸 견적·반려 1건",
  },
  {
    key: "sunghoon",
    name: "정성훈",
    email: `mover05${SEED_EMAIL_DOMAIN}`,
    phone: "010-5528-9063",
    nickname: "수성구 정이사",
    careerYears: 6,
    shortIntroduction: "고객 불만 없는 기사. 불만 접수 창구가 심심해서 울고 있어요.",
    description:
      "대구 수성구·동구 위주로 6년째 원룸부터 아파트까지 하고 있어요.\n학생 원룸 이사는 학기 초에 몰리니 미리 연락 주시면 날짜 잡아드릴게요.",
    regions: ["DAEGU", "GYEONGBUK"],
    serviceTypes: ["SMALL", "HOME"],
    scenario: "견적 보내기 대상 지정 요청 있음·반려 1건·받은 리뷰 있음",
  },
  {
    key: "jaemin",
    name: "한재민",
    email: `mover06${SEED_EMAIL_DOMAIN}`,
    phone: "010-8693-3317",
    nickname: "재민통운",
    careerYears: 4,
    shortIntroduction: "아버지께 물려받은 건 트럭이랑 성실함. 성실함은 아직 고장 난 적이 없습니다.",
    description:
      "아버지 일 이어받아 4년째 하고 있습니다.\n작은 짐 하나도 소중히 다루겠습니다.\n고객님 불만이 생기면 아버지한테 혼나서, 불만 안 생기게 하는 데 진심입니다.",
    regions: ["DAEJEON", "SEJONG", "CHUNGNAM"],
    serviceTypes: ["SMALL", "HOME"],
    scenario: "고객이 다른 견적을 골라 탈락한 견적 있음",
  },
  {
    key: "taeyang",
    name: "오태양",
    email: `mover07${SEED_EMAIL_DOMAIN}`,
    phone: "010-3047-6658",
    nickname: "태양특송이사",
    careerYears: 9,
    shortIntroduction: "이름은 태양인데 이사는 야간도 합니다. 해 지고 나서도 깔끔함은 그대로예요.",
    description:
      "광주 첨단지구, 수완지구 아파트 이사가 많습니다.\n사무실 이전은 야간 작업도 가능합니다.\n전화는 해 떠 있을 때도, 해 졌을 때도 잘 받습니다.",
    regions: ["GWANGJU", "JEONNAM"],
    serviceTypes: ["HOME", "OFFICE"],
    scenario: "확정 견적 있음",
  },
  {
    key: "dohyun",
    name: "윤도현",
    email: `mover08${SEED_EMAIL_DOMAIN}`,
    phone: "010-9258-4720",
    nickname: "울산 도현이사",
    careerYears: 12,
    shortIntroduction: "사무실 이전 12년, 월요일 아침 직원분들이 '어? 벌써 다 됐네' 하게 해드립니다.",
    description:
      "울산 공단 쪽 사무실 이전을 주로 해왔습니다.\n가정이사도 하고 있으니 편하게 문의 주세요.\n모니터 선 꼬이는 거 제일 싫어해서, 케이블마다 이름표 붙여서 옮깁니다.",
    regions: ["ULSAN", "BUSAN"],
    serviceTypes: ["HOME", "OFFICE"],
    scenario: "사무실 확정 견적 있음",
  },
  {
    key: "minhyuk",
    name: "강민혁",
    email: `mover09${SEED_EMAIL_DOMAIN}`,
    phone: "010-4730-8851",
    nickname: "민혁이사",
    careerYears: 3,
    shortIntroduction: "3년차 막내 기사. 연락 빠르기는 이미 고참급이라는 소리 듣습니다.",
    description:
      "3년차라 아직 배울 게 많지만 시간 약속 하나는 꼭 지킵니다.\n세종 정부청사 근처 원룸 이사 많이 했어요.\n모르는 건 모른다고 말씀드리고, 아는 건 확실하게 해드려요. 무거운 건 제가 다 들게요.",
    regions: ["SEJONG", "DAEJEON"],
    serviceTypes: ["SMALL", "HOME"],
    scenario: "확정 견적·받은 리뷰 있음",
  },
  {
    key: "jaehyuk",
    name: "임재혁",
    email: `mover10${SEED_EMAIL_DOMAIN}`,
    phone: "010-6385-2296",
    nickname: "제주 재혁이네",
    careerYears: 11,
    shortIntroduction: "제주 이사 11년, 짐은 귤 박스 다루듯 소중하게 옮깁니다.",
    description:
      "제주에서 11년째 이사하고 있습니다.\n육지로 나가시는 분들은 배편 화물 연계까지 안내해 드려요.\n배편 시간 꼬여도 당황 안 하는 게 제 장점이에요. 섬에서 11년 살면 다 그렇게 됩니다.",
    regions: ["JEJU"],
    serviceTypes: ["SMALL", "HOME", "OFFICE"],
    scenario: "확정 견적 있음 (리뷰 받기 전)",
  },

  // ── 추가 seed 계정 ──
  {
    key: "donghyun",
    name: "김동현",
    email: `dh.kim.move${SEED_EMAIL_DOMAIN}`,
    phone: "010-5182-7740",
    nickname: "한결이사",
    careerYears: 11,
    shortIntroduction: "누구보다 깔끔한 이사. 먼지도 이사 온 줄 모르게 치워드립니다.",
    description:
      "서울·경기·인천에서 11년째 이사하고 있습니다.\n짐 다 내리고 나면 바닥 먼지랑 박스 테이프 자국까지 닦고 나옵니다. 먼지한테는 좀 미안하지만요.\n냉장고·세탁기 분리 설치, 침대 분해 조립 기본 포함이고 새벽 이사도 가능해요.",
    regions: ["SEOUL", "GYEONGGI", "INCHEON"],
    serviceTypes: ["SMALL", "HOME", "OFFICE"],
    scenario: "보낸 견적·확정 견적·반려 3건·받은 리뷰가 모두 있음",
  },
  {
    key: "sungwoo",
    name: "박성우",
    email: `sungwoo.park${SEED_EMAIL_DOMAIN}`,
    phone: "010-2297-4061",
    nickname: "성우네 이삿짐",
    careerYears: 6,
    shortIntroduction: "원룸 이사는 커피 한 잔 식기 전에 끝납니다(아이스 기준).",
    description:
      "혼자 사시는 분들 이사를 주로 합니다.\n짐 적으시면 반나절이면 끝나요. 계단 4층까지는 추가요금 없이 해드립니다.\n주말은 예약이 빨리 차니 2주 전에 연락 주세요.\n서랍장은 통째로 랩 감아서 옮겨요. 속옷 서랍 안 열어보니까 걱정 마세요.",
    regions: ["SEOUL", "GYEONGGI"],
    serviceTypes: ["SMALL", "HOME"],
    scenario: "보낸 견적·반려 2건·받은 리뷰 있음",
  },
  {
    key: "jaehoon",
    name: "이재훈",
    email: `jaehoon.lee${SEED_EMAIL_DOMAIN}`,
    phone: "010-8840-1326",
    nickname: "든든익스프레스",
    careerYears: 14,
    shortIntroduction: "피아노도 수족관도 무사히, 14년간 고객님 표정 찡그리게 한 적 없습니다.",
    description:
      "직원 4명이 한 팀으로 움직입니다.\n피아노, 대형 수족관, 서버랙처럼 까다로운 짐도 경험 많습니다.\n파손 시 이사화물 배상보험으로 처리해 드려요.\n물고기들도 이사한 줄 모르게 옮겨드린 적 있어요. 진짜로요.",
    regions: ["GYEONGGI", "SEOUL", "GANGWON"],
    serviceTypes: ["HOME", "OFFICE"],
    scenario: "확정 견적·지정 견적·받은 리뷰 여러 건",
  },
  {
    key: "minho",
    name: "최민호",
    email: `minho.choi${SEED_EMAIL_DOMAIN}`,
    phone: "010-3615-8097",
    nickname: "부산 바다이사",
    careerYears: 9,
    shortIntroduction: "사다리차 직접 운전합니다. 기다리는 시간 없이, 불만도 없이 깔끔하게.",
    description:
      "해운대·수영·남구 아파트 이사 많이 했습니다.\n사다리차를 직접 운영해서 일정 조율이 쉽고 비용도 아끼실 수 있어요.\n견적 문의는 사진 몇 장만 보내주셔도 됩니다.\n부산 사투리가 좀 세서 무뚝뚝해 보여도 연락은 누구보다 다정하게 잘 받습니다.",
    regions: ["BUSAN", "GYEONGNAM", "ULSAN"],
    serviceTypes: ["SMALL", "HOME", "OFFICE"],
    scenario: "확정 견적·반려 2건·받은 리뷰 있음",
  },
  {
    key: "woojin",
    name: "정우진",
    email: `woojin.jung${SEED_EMAIL_DOMAIN}`,
    phone: "010-7051-2283",
    nickname: "원룸전문 정기사",
    careerYears: 4,
    shortIntroduction: "자취방 이사는 제가 제일 잘합니다. 제 자취방 이사만 6번 해봤거든요.",
    description:
      "대학가 원룸, 오피스텔 이사 위주로 하고 있어요.\n엄마 카톡보다 고객님 카톡을 먼저 봅니다(엄마 미안).\n짐 많지 않으시면 반포장으로 비용 줄여드립니다.\n이사 후 박스 수거까지 해드려요.",
    regions: ["SEOUL"],
    serviceTypes: ["SMALL"],
    scenario: "지정 견적 받음·확정 견적 있음",
  },
  {
    key: "sangchul",
    name: "한상철",
    email: `sangchul.han${SEED_EMAIL_DOMAIN}`,
    phone: "010-4426-9358",
    nickname: "사무실이전 한팀장",
    careerYears: 17,
    shortIntroduction: "금요일 저녁에 짐 싸면 월요일 아침엔 커피만 타시면 됩니다.",
    description:
      "업무에 지장 없도록 금요일 저녁부터 일요일까지 작업합니다.\nPC·네트워크 장비 포장, 책상 파티션 해체 설치 모두 가능합니다.\n현장 방문 견적 무료입니다.\n17년 동안 '월요일에 일 못 했다'는 연락은 한 번도 안 받아봤습니다.",
    regions: ["SEOUL", "GYEONGGI", "INCHEON"],
    serviceTypes: ["OFFICE"],
    scenario: "사무실 지정 견적·받은 리뷰 있음",
  },
  {
    key: "taesik",
    name: "윤태식",
    email: `taesik.yoon${SEED_EMAIL_DOMAIN}`,
    phone: "010-9372-5514",
    nickname: "대구 정직이사",
    careerYears: 8,
    shortIntroduction: "연락 잘 받는 기사. 전화벨 두 번 울리기 전에 받는 게 특기입니다.",
    description:
      "견적 문의 주시면 1시간 안에 꼭 답드려요. 밥 먹다가도 받습니다(체하지 않게 조심은 합니다).\n추가요금으로 마음 상하시는 일 없게 하는 것도 원칙이고요.\n수성구, 달서구 아파트 이사 경험 많고 소형 이사도 반갑게 받습니다.",
    regions: ["DAEGU", "GYEONGBUK"],
    serviceTypes: ["SMALL", "HOME"],
    scenario: "확정 견적·반려 1건",
  },
  {
    key: "jinhyuk",
    name: "오진혁",
    email: `jinhyuk.oh${SEED_EMAIL_DOMAIN}`,
    phone: "010-6188-0472",
    nickname: "대전세종 오기사",
    careerYears: 7,
    shortIntroduction: "세종 입주 이사 전문, 엘리베이터 예약 전쟁은 제가 대신 치러드립니다.",
    description:
      "세종 아파트 입주 시즌마다 바쁘게 다니고 있어요.\n엘리베이터 예약, 관리사무소 신고까지 같이 챙겨드립니다.\n연락은 성심당 빵 줄 서는 시간보다 짧게 답드려요.",
    regions: ["DAEJEON", "SEJONG", "CHUNGNAM", "CHUNGBUK"],
    serviceTypes: ["SMALL", "HOME", "OFFICE"],
    scenario: "확정 견적·반려 2건·받은 리뷰 있음",
  },
  {
    key: "youngmin",
    name: "서영민",
    email: `youngmin.seo${SEED_EMAIL_DOMAIN}`,
    phone: "010-2734-6905",
    nickname: "제주한달이사",
    careerYears: 5,
    shortIntroduction: "한달살이 짐은 한 시간이면 끝, 남는 시간엔 바다 보러 가세요.",
    description:
      "제주시 ↔ 서귀포 이사를 주로 합니다.\n한달살이, 연세 계약 끝나고 짐 옮기시는 분들 많이 도와드렸어요.\n짐 옮기고 나서 다음 숙소 근처 맛집도 하나 알려드려요. 이건 서비스입니다.",
    regions: ["JEJU"],
    serviceTypes: ["SMALL", "HOME"],
    scenario: "확정 견적·받은 리뷰 있음",
  },
  {
    key: "doyun",
    name: "강도윤",
    email: `doyun.kang${SEED_EMAIL_DOMAIN}`,
    phone: "010-5840-3167",
    nickname: "새봄이사",
    careerYears: 3,
    shortIntroduction: "이름처럼 새 출발을 깔끔하게. 이사 끝난 집이 봄 햇살처럼 반짝이게 해드려요.",
    description:
      "경력은 짧아도 깔끔함은 고참급입니다.\n이사 끝나면 정리된 집 사진 보내드려요. 비포·애프터 보는 맛이 쏠쏠합니다.\n나주 혁신도시, 광주 상무지구 이사 자주 다녀요.",
    regions: ["GWANGJU", "JEONNAM", "JEONBUK"],
    serviceTypes: ["HOME", "OFFICE"],
    scenario: "견적 보내기 대상 지정 요청 있음·반려 3건",
  },
];

const MOVE_REQUEST_SEEDS: MoveRequestSeed[] = [
  // ── 받은 견적 확인·확정: 대기 중 요청에 견적이 여러 건 ──
  {
    customer: "minji",
    serviceType: "SMALL",
    moveDateOffset: 9,
    createdDaysAgo: 2,
    fromAddress: "서울 마포구 망원로 52",
    toAddress: "서울 서대문구 연희로18길 7",
    status: MoveRequestStatus.WAITING,
    designatedMovers: ["woojin"],
    proposedQuotes: [
      { mover: "woojin", price: 230_000, comment: "원룸 기준으로 잡았어요. 냉장고 소형이면 이 금액 그대로고, 짐 사진 보내주시면 더 정확하게 말씀드릴게요.", hoursAfterRequest: 3 },
      { mover: "donghyun", price: 280_000, comment: "포장이사로 진행하고 연희동 쪽 골목이 좁아서 1톤 두 번 왕복 예상합니다. 추가요금은 없어요.", hoursAfterRequest: 7 },
      { mover: "sungwoo", price: 250_000, comment: "엘리베이터 있으면 오전에 끝납니다! 박스 미리 갖다드릴 수 있어요.", hoursAfterRequest: 20 },
    ],
    rejections: [{ mover: "jinhyuk", reason: "그날은 대전 쪽 일정이 잡혀 있어서 서울까지 가기 어렵습니다. 죄송해요.", hoursAfterRequest: 5 }],
  },
  {
    customer: "junho",
    serviceType: "HOME",
    moveDateOffset: 14,
    createdDaysAgo: 1,
    fromAddress: "경기 성남시 분당구 정자일로 95",
    toAddress: "경기 용인시 수지구 풍덕천로 120",
    status: MoveRequestStatus.WAITING,
    proposedQuotes: [
      { mover: "jaehoon", price: 690_000, comment: "32평 기준 5톤 1대, 인원 4명으로 진행합니다. 에어컨 이전 설치는 별도 업체 연결해 드릴 수 있어요.", hoursAfterRequest: 2 },
      { mover: "donghyun", price: 740_000, comment: "주방 짐이 많으시면 포장 인원 한 명 더 붙입니다. 금액은 변동 없어요.", hoursAfterRequest: 9 },
      { mover: "sungwoo", price: 650_000, comment: "가정이사도 합니다~ 다만 사다리차가 필요하면 15만원 정도 추가될 수 있어요.", hoursAfterRequest: 15 },
    ],
    rejections: [
      { mover: "minho", reason: "부산 지역 위주로 다니고 있어서 경기권은 어렵습니다.", hoursAfterRequest: 4 },
      { mover: "taesik", reason: "대구에서 올라가기엔 일정이 빠듯해서 이번엔 힘들 것 같아요.", hoursAfterRequest: 11 },
    ],
  },
  {
    customer: "seoyeon",
    serviceType: "HOME",
    moveDateOffset: 20,
    createdDaysAgo: 3,
    fromAddress: "인천 연수구 송도과학로 32",
    toAddress: "서울 강서구 마곡중앙로 161",
    status: MoveRequestStatus.WAITING,
    designatedMovers: ["donghyun", "jaehoon"],
    proposedQuotes: [
      { mover: "donghyun", price: 820_000, comment: "지정해 주셔서 감사합니다. 송도에서 마곡이면 오전 8시 시작 기준 오후 3시쯤 마무리됩니다.", hoursAfterRequest: 5 },
      { mover: "jaehoon", price: 790_000, comment: "무진동 차량으로 진행하고, 아이 방 가구는 분해 후 새로 조립해 드립니다.", hoursAfterRequest: 26 },
    ],
    rejections: [{ mover: "doyun", reason: "호남권만 다니고 있어서 수도권은 어렵습니다.", hoursAfterRequest: 8 }],
  },
  {
    customer: "haneul",
    serviceType: "OFFICE",
    moveDateOffset: 25,
    createdDaysAgo: 4,
    fromAddress: "서울 강남구 테헤란로 427",
    toAddress: "서울 성동구 성수이로 113",
    status: MoveRequestStatus.WAITING,
    designatedMovers: ["sangchul"],
    proposedQuotes: [
      { mover: "sangchul", price: 2_400_000, comment: "15인 사무실 기준입니다. 금요일 18시 시작해서 토요일 오전에 세팅까지 끝내 드릴게요. 현장 방문 견적도 가능합니다.", hoursAfterRequest: 6 },
      { mover: "jaehoon", price: 2_150_000, comment: "서버랙 1대 포함 금액이고, 네트워크 재연결은 고객사 IT 담당자분과 같이 진행하면 됩니다.", hoursAfterRequest: 30 },
      { mover: "donghyun", price: 2_600_000, comment: "파티션 해체·설치 포함입니다. 주말 작업이라 조금 높게 잡았어요.", hoursAfterRequest: 52 },
    ],
    rejections: [
      { mover: "jinhyuk", reason: "사무실이사는 지금 장비가 부족해서 이번엔 어렵겠습니다.", hoursAfterRequest: 10 },
      { mover: "doyun", reason: "서울은 거리가 멀어서 진행이 어렵습니다. 좋은 기사님 만나세요!", hoursAfterRequest: 14 },
    ],
  },

  // ── 견적 보내기: 아직 견적이 없는 대기 요청 ──
  {
    customer: "hyunwoo",
    serviceType: "HOME",
    moveDateOffset: 12,
    createdDaysAgo: 0,
    fromAddress: "광주 서구 상무중앙로 61",
    toAddress: "전남 나주시 빛가람로 640",
    status: MoveRequestStatus.WAITING,
    designatedMovers: ["doyun"],
    rejections: [{ mover: "donghyun", reason: "광주까지는 거리가 있어서 어렵습니다. 죄송합니다.", hoursAfterRequest: 2 }],
  },
  {
    customer: "sujin",
    serviceType: "SMALL",
    moveDateOffset: 6,
    createdDaysAgo: 1,
    fromAddress: "서울 관악구 관악로 158",
    toAddress: "서울 동작구 노량진로 100",
    status: MoveRequestStatus.WAITING,
    designatedMovers: ["donghyun", "woojin"],
    rejections: [{ mover: "sungwoo", reason: "이번 주는 예약이 꽉 차서요. 다음에 꼭 다시 연락 주세요!", hoursAfterRequest: 6 }],
  },

  // ── 견적 확정 후 이사 대기 ──
  {
    customer: "jiwon",
    serviceType: "HOME",
    moveDateOffset: 5,
    createdDaysAgo: 9,
    fromAddress: "경기 고양시 일산동구 중앙로 1275",
    toAddress: "경기 파주시 경의로 1100",
    status: MoveRequestStatus.CONFIRMED,
    confirmedQuote: { mover: "jaehoon", price: 720_000, comment: "일산에서 운정까지라 동선 짧아요. 오전 중에 짐 다 빼고 오후에 정리해 드립니다.", hoursAfterRequest: 4 },
    declinedQuotes: [
      { mover: "donghyun", price: 780_000, comment: "포장이사 기준이고 화요일·수요일 가능합니다.", hoursAfterRequest: 10 },
      { mover: "sungwoo", price: 700_000, comment: "짐 양 보고 조정 가능해요. 편하게 연락 주세요.", hoursAfterRequest: 22 },
    ],
    rejections: [{ mover: "minho", reason: "경기 북부는 다니지 않아서 어렵습니다.", hoursAfterRequest: 3 }],
  },
  {
    customer: "daeun",
    serviceType: "SMALL",
    moveDateOffset: 3,
    createdDaysAgo: 6,
    fromAddress: "제주 제주시 신대로 64",
    toAddress: "제주 서귀포시 중정로 61",
    status: MoveRequestStatus.CONFIRMED,
    confirmedQuote: { mover: "youngmin", price: 190_000, comment: "한달살이 짐이면 1톤으로 충분해요. 서귀포까지 1시간 정도 걸립니다.", hoursAfterRequest: 2 },
    rejections: [{ mover: "donghyun", reason: "제주는 배편 일정이 맞지 않아 진행이 어렵습니다.", hoursAfterRequest: 5 }],
  },

  // ── 리뷰 작성 가능: 이사 완료, 리뷰 없음 ──
  {
    customer: "yuna",
    serviceType: "HOME",
    moveDateOffset: -6,
    createdDaysAgo: 20,
    fromAddress: "부산 해운대구 좌동순환로 99",
    toAddress: "부산 수영구 광안해변로 255",
    status: MoveRequestStatus.COMPLETED,
    confirmedQuote: { mover: "minho", price: 560_000, comment: "사다리차 포함 금액입니다. 광안리 쪽 주차가 어려워서 오전 일찍 시작할게요.", hoursAfterRequest: 3 },
    declinedQuotes: [{ mover: "taesik", price: 520_000, comment: "부산까지 내려가서 진행 가능합니다. 출장비 포함이에요.", hoursAfterRequest: 18 }],
  },
  {
    customer: "taewoo",
    serviceType: "SMALL",
    moveDateOffset: -3,
    createdDaysAgo: 15,
    fromAddress: "서울 송파구 오금로 32",
    toAddress: "서울 강동구 천호대로 1017",
    status: MoveRequestStatus.COMPLETED,
    confirmedQuote: { mover: "woojin", price: 240_000, comment: "오피스텔 원룸이면 2시간 안에 끝나요. 박스 수거까지 해드립니다.", hoursAfterRequest: 1 },
    declinedQuotes: [{ mover: "sungwoo", price: 260_000, comment: "평일 오후 시간대 가능합니다.", hoursAfterRequest: 8 }],
  },
  {
    customer: "sohee",
    serviceType: "SMALL",
    moveDateOffset: -10,
    createdDaysAgo: 24,
    fromAddress: "대구 수성구 동대구로 81",
    toAddress: "대구 중구 달구벌대로 2077",
    status: MoveRequestStatus.COMPLETED,
    confirmedQuote: { mover: "taesik", price: 180_000, comment: "소형이사 반포장으로 진행할게요. 짐 정리는 직접 해주시면 됩니다.", hoursAfterRequest: 2 },
  },
  {
    customer: "jaehyun",
    serviceType: "HOME",
    moveDateOffset: -15,
    createdDaysAgo: 30,
    fromAddress: "대전 유성구 대학로 99",
    toAddress: "세종 한누리대로 2130",
    status: MoveRequestStatus.COMPLETED,
    confirmedQuote: { mover: "jinhyuk", price: 610_000, comment: "세종 입주 이사는 엘리베이터 예약이 중요해서 관리사무소에 미리 연락해 둘게요.", hoursAfterRequest: 5 },
    rejections: [
      { mover: "doyun", reason: "충청권은 아직 다니지 않아서요. 죄송합니다.", hoursAfterRequest: 7 },
      { mover: "donghyun", reason: "평일 이사는 이미 예약이 차 있어서 어렵습니다.", hoursAfterRequest: 12 },
    ],
  },

  // ── 지난 이사와 작성한 리뷰 (기사님 평점·받은 리뷰 확인용) ──
  {
    customer: "yuna",
    serviceType: "SMALL",
    moveDateOffset: -210,
    createdDaysAgo: 225,
    fromAddress: "부산 남구 용소로 45",
    toAddress: "부산 해운대구 좌동순환로 99",
    status: MoveRequestStatus.COMPLETED,
    confirmedQuote: { mover: "minho", price: 210_000, comment: "원룸에서 투룸 이사 기준입니다.", hoursAfterRequest: 4 },
    review: { rating: 5, content: "작년에 원룸에서 투룸으로 옮길 때 이용했어요. 비 오는 날이었는데 짐마다 비닐 씌워서 옮겨주셔서 하나도 안 젖었습니다. 이번에도 또 불렀어요 ㅎㅎ", daysAfterMove: 1 },
  },
  {
    customer: "taewoo",
    serviceType: "SMALL",
    moveDateOffset: -380,
    createdDaysAgo: 392,
    fromAddress: "서울 광진구 능동로 120",
    toAddress: "서울 송파구 오금로 32",
    status: MoveRequestStatus.COMPLETED,
    confirmedQuote: { mover: "sungwoo", price: 200_000, comment: "4층 계단이라도 추가요금 없습니다.", hoursAfterRequest: 3 },
    review: { rating: 4, content: "엘리베이터 없는 4층이라 걱정했는데 두 분이서 금방 끝내주셨어요. 다만 도착이 예정보다 20분 정도 늦었어요. 미리 연락은 주셨습니다.", daysAfterMove: 2 },
  },
  {
    customer: "jaehyun",
    serviceType: "SMALL",
    moveDateOffset: -300,
    createdDaysAgo: 312,
    fromAddress: "대전 서구 둔산로 100",
    toAddress: "대전 유성구 대학로 99",
    status: MoveRequestStatus.COMPLETED,
    confirmedQuote: { mover: "jinhyuk", price: 230_000, comment: "가까운 거리라 오전에 끝납니다.", hoursAfterRequest: 6 },
    review: { rating: 5, content: "견적이랑 실제 금액이 똑같았어요. 책상 다리 하나 흔들리던 것도 조여주고 가셨어요. 다음 이사도 부탁드리려고요.", daysAfterMove: 0 },
  },
  {
    customer: "jiwon",
    serviceType: "HOME",
    moveDateOffset: -420,
    createdDaysAgo: 435,
    fromAddress: "서울 은평구 통일로 684",
    toAddress: "경기 고양시 일산동구 중앙로 1275",
    status: MoveRequestStatus.COMPLETED,
    confirmedQuote: { mover: "donghyun", price: 690_000, comment: "포장이사로 진행합니다. 냉장고·세탁기 설치 포함이에요.", hoursAfterRequest: 2 },
    rejections: [{ mover: "sungwoo", reason: "그날 오전에 다른 이사가 있어서 시간 맞추기가 어렵습니다.", hoursAfterRequest: 9 }],
    review: { rating: 5, content: "부모님 댁 이사였는데 그릇 하나하나 신문지로 싸주시는 거 보고 부모님이 엄청 좋아하셨어요. 가구 배치도 말씀드린 대로 다 해주셨습니다.", daysAfterMove: 3 },
  },
  {
    customer: "minji",
    serviceType: "SMALL",
    moveDateOffset: -250,
    createdDaysAgo: 262,
    fromAddress: "서울 노원구 동일로 1414",
    toAddress: "서울 마포구 망원로 52",
    status: MoveRequestStatus.COMPLETED,
    confirmedQuote: { mover: "donghyun", price: 270_000, comment: "노원에서 망원이면 1시간 정도 이동합니다.", hoursAfterRequest: 5 },
    review: { rating: 4, content: "짐은 꼼꼼하게 잘 옮겨주셨어요. 약속 시간보다 30분 늦으셨는데 출발 전에 미리 연락 주셔서 크게 불편하진 않았습니다.", daysAfterMove: 1 },
  },
  {
    customer: "junho",
    serviceType: "HOME",
    moveDateOffset: -500,
    createdDaysAgo: 512,
    fromAddress: "서울 동대문구 왕산로 214",
    toAddress: "경기 성남시 분당구 정자일로 95",
    status: MoveRequestStatus.COMPLETED,
    confirmedQuote: { mover: "jaehoon", price: 650_000, comment: "5톤 1대로 진행합니다.", hoursAfterRequest: 7 },
    review: { rating: 3, content: "짐은 파손 없이 잘 왔는데 침대 조립이 조금 헐거워서 다음 날 다시 조였어요. 친절하시긴 했어요.", daysAfterMove: 4 },
  },
  {
    customer: "daeun",
    serviceType: "SMALL",
    moveDateOffset: -90,
    createdDaysAgo: 100,
    fromAddress: "제주 서귀포시 중앙로 105",
    toAddress: "제주 제주시 신대로 64",
    status: MoveRequestStatus.COMPLETED,
    confirmedQuote: { mover: "youngmin", price: 170_000, comment: "짐 적으시면 1톤 한 번에 끝나요.", hoursAfterRequest: 3 },
    review: { rating: 5, content: "한달살이 끝나고 짐 옮길 때 불렀어요. 혼자라 막막했는데 박스 포장까지 도와주셨어요. 제주 이사는 이분께 맡기세요!", daysAfterMove: 1 },
  },
  {
    customer: "haneul",
    serviceType: "OFFICE",
    moveDateOffset: -330,
    createdDaysAgo: 345,
    fromAddress: "서울 영등포구 국제금융로 10",
    toAddress: "서울 강남구 테헤란로 427",
    status: MoveRequestStatus.COMPLETED,
    confirmedQuote: { mover: "sangchul", price: 1_900_000, comment: "주말 작업 기준입니다. PC 포장 포함이에요.", hoursAfterRequest: 8 },
    review: { rating: 5, content: "금요일 저녁에 시작해서 월요일 출근 전까지 자리 세팅이 다 끝나 있었어요. 선 정리까지 깔끔해서 직원들 반응이 좋았습니다.", daysAfterMove: 2 },
  },
  {
    customer: "seoyeon",
    serviceType: "HOME",
    moveDateOffset: -150,
    createdDaysAgo: 160,
    fromAddress: "인천 남동구 예술로 198",
    toAddress: "인천 연수구 송도과학로 32",
    status: MoveRequestStatus.COMPLETED,
    confirmedQuote: { mover: "jaehoon", price: 760_000, comment: "아이 방 가구 분해·조립 포함입니다.", hoursAfterRequest: 4 },
    review: { rating: 4, content: "전체적으로 만족해요. 아이 책상 서랍 하나에 살짝 긁힘이 생겼는데 바로 말씀드리니 보상 처리해 주셨어요.", daysAfterMove: 2 },
  },

  // ── 기존 seed 계정의 요청 ──
  {
    customer: "minseo",
    serviceType: "SMALL",
    moveDateOffset: 5,
    createdDaysAgo: 2,
    fromAddress: "서울 중구 세종대로 110",
    toAddress: "경기 수원시 팔달구 효원로 241",
    status: MoveRequestStatus.WAITING,
    designatedMovers: ["dongwoo"],
    proposedQuotes: [
      { mover: "dongwoo", price: 260_000, comment: "지정해 주셔서 감사해요. 수원까지 1시간 정도 걸리고 짐 양 보니 1톤 한 대면 충분합니다.", hoursAfterRequest: 4 },
      { mover: "hyunwoo_m", price: 240_000, comment: "평일이면 이 금액 가능해요. 주말이면 3만원 정도 올라갑니다.", hoursAfterRequest: 19 },
    ],
    rejections: [{ mover: "sunghoon", reason: "대구에서 수원까지는 일정상 어렵습니다. 죄송합니다.", hoursAfterRequest: 6 }],
  },
  {
    customer: "seojun",
    serviceType: "HOME",
    moveDateOffset: 8,
    createdDaysAgo: 3,
    fromAddress: "서울 마포구 월드컵로 212",
    toAddress: "인천 남동구 정각로 29",
    status: MoveRequestStatus.WAITING,
    proposedQuotes: [
      { mover: "junhyung", price: 520_000, comment: "투룸 기준이고 인천은 자주 가서 길 막히는 시간 피해서 움직일게요.", hoursAfterRequest: 2 },
      { mover: "hyunwoo_m", price: 580_000, comment: "포장이사로 진행하고 에어컨 철거는 따로 말씀 주세요.", hoursAfterRequest: 11 },
    ],
    rejections: [{ mover: "dongmin", reason: "부산·경남 쪽만 다니고 있어서 어렵습니다.", hoursAfterRequest: 8 }],
  },
  {
    customer: "jiwoo",
    serviceType: "OFFICE",
    moveDateOffset: 10,
    createdDaysAgo: 4,
    fromAddress: "인천 연수구 센트럴로 123",
    toAddress: "서울 강남구 테헤란로 152",
    status: MoveRequestStatus.WAITING,
    designatedMovers: ["hyunwoo_m"],
    proposedQuotes: [
      { mover: "hyunwoo_m", price: 1_350_000, comment: "직원 8명 사무실 기준입니다. 토요일 오전부터 작업하면 오후 늦게 세팅까지 끝나요.", hoursAfterRequest: 5 },
      { mover: "sangchul", price: 1_480_000, comment: "PC·모니터 개별 포장하고 케이블에 라벨 붙여서 옮깁니다. 월요일 바로 업무 보실 수 있게 해드릴게요.", hoursAfterRequest: 21 },
    ],
  },
  {
    customer: "yujin",
    serviceType: "HOME",
    moveDateOffset: 12,
    createdDaysAgo: 2,
    fromAddress: "부산 해운대구 센텀중앙로 55",
    toAddress: "부산 수영구 광안해변로 219",
    status: MoveRequestStatus.WAITING,
    proposedQuotes: [
      { mover: "dongmin", price: 540_000, comment: "센텀에서 광안리면 금방이에요. 사다리차 포함해서 잡았습니다.", hoursAfterRequest: 3 },
      { mover: "minho", price: 510_000, comment: "같은 해운대·수영 권역이라 오전 중에 다 옮겨드릴 수 있어요.", hoursAfterRequest: 14 },
    ],
    rejections: [{ mover: "dongwoo", reason: "부산은 저희가 다니는 지역이 아니라서 진행이 어렵습니다. 근처 기사님께 받아보세요!", hoursAfterRequest: 5 }],
  },
  {
    customer: "doyoon",
    serviceType: "SMALL",
    moveDateOffset: 15,
    createdDaysAgo: 1,
    fromAddress: "대구 중구 공평로 88",
    toAddress: "대구 수성구 달구벌대로 2450",
    status: MoveRequestStatus.WAITING,
    designatedMovers: ["sunghoon"],
    rejections: [{ mover: "dongwoo", reason: "대구까지는 하루 일정으로 다녀오기 어려워서 이번엔 반려할게요. 죄송합니다.", hoursAfterRequest: 3 }],
  },
  {
    customer: "sua",
    serviceType: "HOME",
    moveDateOffset: 18,
    createdDaysAgo: 10,
    fromAddress: "대전 서구 둔산로 100",
    toAddress: "세종 한누리대로 2130",
    status: MoveRequestStatus.CONFIRMED,
    confirmedQuote: { mover: "dongwoo", price: 680_000, comment: "세종까지 이동 포함입니다. 새 아파트라 엘리베이터 예약만 미리 해주세요.", hoursAfterRequest: 6 },
    declinedQuotes: [{ mover: "jaemin", price: 620_000, comment: "대전·세종은 매일 다니는 길이라 일정 맞추기 편해요.", hoursAfterRequest: 3 }],
    rejections: [{ mover: "junhyung", reason: "대전까지는 거리가 있어서 이번엔 어렵겠습니다.", hoursAfterRequest: 9 }],
  },
  {
    customer: "jiho_o",
    serviceType: "HOME",
    moveDateOffset: 20,
    createdDaysAgo: 8,
    fromAddress: "광주 서구 내방로 111",
    toAddress: "전남 나주시 빛가람로 625",
    status: MoveRequestStatus.CONFIRMED,
    confirmedQuote: { mover: "taeyang", price: 590_000, comment: "나주 혁신도시까지 40분 정도 걸립니다. 오전 9시에 시작할게요.", hoursAfterRequest: 4 },
  },
  {
    customer: "seoyeon_y",
    serviceType: "OFFICE",
    moveDateOffset: 25,
    createdDaysAgo: 12,
    fromAddress: "울산 남구 중앙로 201",
    toAddress: "부산 동구 중앙대로 206",
    status: MoveRequestStatus.CONFIRMED,
    confirmedQuote: { mover: "dohyun", price: 1_700_000, comment: "사무용 가구와 복합기 포함 금액입니다. 금요일 저녁 시작으로 잡을게요.", hoursAfterRequest: 7 },
  },
  {
    customer: "hajun",
    serviceType: "SMALL",
    moveDateOffset: -7,
    createdDaysAgo: 18,
    fromAddress: "세종 도움6로 42",
    toAddress: "대전 유성구 대학로 99",
    status: MoveRequestStatus.COMPLETED,
    confirmedQuote: { mover: "minhyuk", price: 200_000, comment: "원룸 짐이면 1톤 한 대로 충분해요. 오후 2시 시작 괜찮으실까요?", hoursAfterRequest: 2 },
    review: { rating: 5, content: "젊은 기사님이 오셨는데 진짜 성실하세요. 무거운 책 박스도 군말 없이 다 옮겨주시고 마지막에 바닥까지 한번 쓸어주고 가셨어요.", daysAfterMove: 1 },
  },
  {
    customer: "chaewon",
    serviceType: "HOME",
    moveDateOffset: -14,
    createdDaysAgo: 28,
    fromAddress: "제주 제주시 문연로 6",
    toAddress: "제주 서귀포시 중앙로 105",
    status: MoveRequestStatus.COMPLETED,
    confirmedQuote: { mover: "jaehyuk", price: 580_000, comment: "서귀포까지 한 번에 옮길 수 있게 5톤으로 갈게요.", hoursAfterRequest: 3 },
  },
  {
    customer: "seojun",
    serviceType: "HOME",
    moveDateOffset: -300,
    createdDaysAgo: 315,
    fromAddress: "서울 은평구 연서로 365",
    toAddress: "서울 마포구 월드컵로 212",
    status: MoveRequestStatus.COMPLETED,
    confirmedQuote: { mover: "junhyung", price: 430_000, comment: "투룸 기준으로 잡았습니다.", hoursAfterRequest: 5 },
    review: { rating: 4, content: "가격 대비 만족합니다. 두 분이 오셔서 조금 오래 걸리긴 했는데 짐 다룰 때 조심스럽게 해주셨어요.", daysAfterMove: 2 },
  },
  {
    customer: "jiwoo",
    serviceType: "SMALL",
    moveDateOffset: -180,
    createdDaysAgo: 190,
    fromAddress: "인천 부평구 부평대로 168",
    toAddress: "인천 연수구 센트럴로 123",
    status: MoveRequestStatus.COMPLETED,
    confirmedQuote: { mover: "hyunwoo_m", price: 190_000, comment: "가까운 거리라 금방 끝나요.", hoursAfterRequest: 4 },
    review: { rating: 5, content: "이름처럼 정말 손이 빠르세요. 한 시간 반 만에 다 끝났는데 깨진 것 하나 없었습니다.", daysAfterMove: 0 },
  },
  {
    customer: "doyoon",
    serviceType: "SMALL",
    moveDateOffset: -100,
    createdDaysAgo: 110,
    fromAddress: "대구 북구 대학로 80",
    toAddress: "대구 중구 공평로 88",
    status: MoveRequestStatus.COMPLETED,
    confirmedQuote: { mover: "sunghoon", price: 160_000, comment: "학교 앞 원룸이면 오전에 끝납니다.", hoursAfterRequest: 3 },
    review: { rating: 4, content: "친절하시고 빨리 끝내주셨어요. 계단에서 박스 하나 모서리가 찌그러졌는데 안에 든 건 괜찮았습니다.", daysAfterMove: 1 },
  },
  {
    customer: "minseo",
    serviceType: "SMALL",
    moveDateOffset: -260,
    createdDaysAgo: 272,
    fromAddress: "서울 성북구 보문로 168",
    toAddress: "서울 중구 세종대로 110",
    status: MoveRequestStatus.COMPLETED,
    confirmedQuote: { mover: "dongwoo", price: 230_000, comment: "오피스텔 이사 기준입니다.", hoursAfterRequest: 6 },
    review: { rating: 5, content: "견적 받을 때부터 설명을 자세히 해주셔서 믿음이 갔어요. 당일에도 추가요금 얘기 전혀 없었습니다. 이번 이사도 기사님께 지정 요청했어요!", daysAfterMove: 2 },
  },
];

/** 고객별로 찜한 기사님입니다. */
const FAVORITE_SEEDS: Record<string, string[]> = {
  minseo: ["dongwoo", "hyunwoo_m"],
  seojun: ["junhyung"],
  jiwoo: ["hyunwoo_m", "sangchul"],
  yujin: ["dongmin", "minho"],
  doyoon: ["sunghoon"],
  hajun: ["minhyuk"],
  chaewon: ["jaehyuk"],
  minji: ["donghyun", "woojin"],
  junho: ["jaehoon"],
  seoyeon: ["donghyun", "jaehoon"],
  haneul: ["sangchul"],
  yuna: ["minho"],
  taewoo: ["woojin", "sungwoo"],
  jiwon: ["donghyun", "jaehoon"],
  daeun: ["youngmin"],
  sujin: ["donghyun", "woojin"],
  jiho: ["donghyun", "sungwoo", "woojin"],
};

/**
 * 고정 UUID를 사용하므로 seed를 여러 번 실행해도 같은 테스트 이력을
 * 계속 생성하지 않고 기존 fixture를 갱신합니다.
 *
 * 앞의 두 요청에는 리뷰가 있어 WRITTEN 목록에 표시되고,
 * 뒤의 두 요청에는 리뷰가 없어 WRITABLE 목록에 표시됩니다.
 */
const REVIEW_TEST_FIXTURE_SEEDS = [
  {
    moveRequestId: "aa000001-0000-4000-8000-000000000001",
    quoteId: "aa000002-0000-4000-8000-000000000001",
    serviceType: "SMALL",
    moverIndex: 0,
    moveDateOffset: -40,
    fromAddress: "서울 마포구 월드컵북로 120",
    toAddress: "경기 고양시 일산동구 중앙로 1000",
    price: 180_000,
    comment: "원룸 짐 기준이에요. 1톤 한 대로 오전 중에 끝내 드릴게요.",
    review: {
      id: "aa000003-0000-4000-8000-000000000001",
      rating: 5,
      content:
        "아침 8시 딱 맞춰 오셨어요. 모니터랑 화분처럼 깨질 만한 건 따로 챙겨서 옮겨주셔서 안심됐습니다.",
      createdAtOffset: -39,
    },
  },
  {
    moveRequestId: "aa000001-0000-4000-8000-000000000002",
    quoteId: "aa000002-0000-4000-8000-000000000002",
    serviceType: "HOME",
    moverIndex: 1,
    moveDateOffset: -30,
    fromAddress: "서울 송파구 올림픽로 300",
    toAddress: "인천 연수구 센트럴로 160",
    price: 320_000,
    comment: "투룸 포장이사로 잡았어요. 송파에서 송도까지라 점심 전에는 출발합니다.",
    review: {
      id: "aa000003-0000-4000-8000-000000000002",
      rating: 4,
      content:
        "친절하셨고 짐도 다 멀쩡히 왔어요. 다만 도착하고 나서 정리 시간이 생각보다 길어져서 별 하나 뺐습니다.",
      createdAtOffset: -29,
    },
  },
  {
    moveRequestId: "aa000001-0000-4000-8000-000000000003",
    quoteId: "aa000002-0000-4000-8000-000000000003",
    serviceType: "OFFICE",
    moverIndex: 2,
    moveDateOffset: -20,
    fromAddress: "경기 성남시 분당구 판교역로 166",
    toAddress: "서울 강남구 테헤란로 152",
    price: 550_000,
    comment: "책상 6개, 캐비닛 3개 기준이에요. 토요일 오전 작업으로 진행하겠습니다.",
  },
  {
    moveRequestId: "aa000001-0000-4000-8000-000000000004",
    quoteId: "aa000002-0000-4000-8000-000000000004",
    serviceType: "HOME",
    moverIndex: 3,
    moveDateOffset: -10,
    fromAddress: "부산 해운대구 센텀중앙로 90",
    toAddress: "부산 수영구 광안해변로 219",
    price: 390_000,
    comment: "사다리차 포함 금액이에요. 가구 배치는 도착해서 말씀해 주시는 대로 해드릴게요.",
  },
] satisfies ReviewTestFixtureSeed[];

function getRequiredId(
  idMap: ReadonlyMap<string, string>,
  key: string,
): string {
  const id = idMap.get(key);

  if (!id) {
    throw new Error(`${key}에 해당하는 seed 데이터를 찾을 수 없습니다.`);
  }

  return id;
}

function createDateFromNow(days: number, hour = 10): Date {
  const date = new Date();

  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);

  return date;
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

/**
 * 앱이 서버에서 막는 규칙을 seed도 지키는지 실행 전에 확인합니다.
 * 규칙을 어긴 데이터로 화면을 확인하면 실제로는 생길 수 없는 상태를 보게 되므로 즉시 중단합니다.
 *
 * @throws Error 고객당 진행 중 요청 2건 이상, 지정 3명 초과, 상태와 이사일·견적 구성이 맞지 않는 경우
 */
function validateSeeds(): void {
  const customerKeys = new Set(CUSTOMER_SEEDS.map((seed) => seed.key));
  const moverKeys = new Set(MOVER_SEEDS.map((seed) => seed.key));
  const activeRequestCount = new Map<string, number>();

  for (const [index, seed] of MOVE_REQUEST_SEEDS.entries()) {
    const label = `MOVE_REQUEST_SEEDS[${index}] (${seed.customer})`;
    const quoteMovers = [
      ...(seed.proposedQuotes ?? []),
      ...(seed.confirmedQuote ? [seed.confirmedQuote] : []),
      ...(seed.declinedQuotes ?? []),
    ].map((quote) => quote.mover);
    const rejectionMovers = (seed.rejections ?? []).map((rejection) => rejection.mover);

    if (!customerKeys.has(seed.customer)) throw new Error(`${label}: 없는 고객입니다.`);
    for (const mover of [...quoteMovers, ...rejectionMovers, ...(seed.designatedMovers ?? [])]) {
      if (!moverKeys.has(mover)) throw new Error(`${label}: 없는 기사님(${mover})입니다.`);
    }
    // Quote·RequestRejection은 (요청, 기사님)당 한 건이고, 견적을 보낸 기사님은 같은 요청을 반려할 수 없습니다.
    if (new Set([...quoteMovers, ...rejectionMovers]).size !== quoteMovers.length + rejectionMovers.length) {
      throw new Error(`${label}: 한 기사님이 같은 요청에 견적·반려를 중복으로 남겼습니다.`);
    }
    if ((seed.designatedMovers?.length ?? 0) > 3) throw new Error(`${label}: 지정 기사님은 최대 3명입니다.`);
    if ((seed.proposedQuotes?.length ?? 0) > 8) throw new Error(`${label}: 견적은 최대 8건(일반 5 + 지정 3)입니다.`);

    if (seed.status === MoveRequestStatus.WAITING) {
      if (seed.moveDateOffset <= 0) throw new Error(`${label}: 대기 중 요청은 이사일이 미래여야 합니다.`);
      if (seed.confirmedQuote || seed.declinedQuotes || seed.review) {
        throw new Error(`${label}: 대기 중 요청에는 확정 견적·리뷰를 둘 수 없습니다.`);
      }
    } else {
      if (!seed.confirmedQuote) throw new Error(`${label}: 확정·완료 요청에는 확정 견적이 필요합니다.`);
      if (seed.proposedQuotes) throw new Error(`${label}: 확정·완료 요청에는 대기 견적을 둘 수 없습니다.`);
    }
    if (seed.status === MoveRequestStatus.CONFIRMED && seed.moveDateOffset <= 0) {
      throw new Error(`${label}: 확정 후 이사 대기 요청은 이사일이 미래여야 합니다.`);
    }
    if (seed.status === MoveRequestStatus.COMPLETED && seed.moveDateOffset >= 0) {
      throw new Error(`${label}: 완료 요청은 이사일이 과거여야 합니다.`);
    }
    if (seed.review && seed.status !== MoveRequestStatus.COMPLETED) {
      throw new Error(`${label}: 리뷰는 완료된 이사에만 작성할 수 있습니다.`);
    }

    // 고객은 진행 중인 요청(대기, 또는 확정 후 이사일 전)을 동시에 하나만 가질 수 있습니다.
    if (seed.status !== MoveRequestStatus.COMPLETED) {
      const count = (activeRequestCount.get(seed.customer) ?? 0) + 1;
      if (count > 1) throw new Error(`${label}: 고객당 진행 중인 요청은 하나만 둘 수 있습니다.`);
      activeRequestCount.set(seed.customer, count);
    }
  }
}

async function createReferenceData(): Promise<{
  serviceTypeIdMap: Map<string, string>;
  regionIdMap: Map<string, string>;
}> {
  const serviceTypes = await Promise.all(
    SERVICE_TYPE_NAMES.map((name) =>
      prisma.serviceType.upsert({
        where: {
          name,
        },
        update: {},
        create: {
          name,
        },
      }),
    ),
  );

  const regions = await Promise.all(
    REGION_NAMES.map((name) =>
      prisma.region.upsert({
        where: {
          name,
        },
        update: {},
        create: {
          name,
        },
      }),
    ),
  );

  return {
    serviceTypeIdMap: new Map(
      serviceTypes.map((serviceType) => [serviceType.name, serviceType.id]),
    ),
    regionIdMap: new Map(regions.map((region) => [region.name, region.id])),
  };
}

/**
 * 이전에 만든 seed 계정과 그 계정에 딸린 데이터를 지웁니다.
 * RequestRejection은 MoveRequest·Mover 삭제 시 함께 지워지지 않는(onDelete 미지정) 관계라,
 * 사용자를 지우기 전에 seed 기사님이 남겼거나 seed 고객의 요청에 달린 반려 기록을 먼저 지웁니다.
 */
async function removePreviousSeedData(): Promise<void> {
  const isSeedEmail = { endsWith: SEED_EMAIL_DOMAIN };

  await prisma.requestRejection.deleteMany({
    where: {
      OR: [
        { mover: { user: { email: isSeedEmail } } },
        { moveRequest: { customer: { user: { email: isSeedEmail } } } },
      ],
    },
  });

  await prisma.user.deleteMany({
    where: {
      email: isSeedEmail,
    },
  });
}

async function createCustomers(
  passwordHash: string,
  serviceTypeIdMap: ReadonlyMap<string, string>,
  regionIdMap: ReadonlyMap<string, string>,
): Promise<Map<string, CreatedCustomer>> {
  const customers = new Map<string, CreatedCustomer>();

  for (const seed of CUSTOMER_SEEDS) {
    const user = await prisma.user.create({
      data: {
        role: UserRole.CUSTOMER,
        name: seed.name,
        email: seed.email,
        phone: seed.phone,
        passwordHash,
        customer: {
          create: {
            regionId: getRequiredId(regionIdMap, seed.region),
            serviceTypes: {
              create: seed.serviceTypes.map((serviceType) => ({
                serviceTypeId: getRequiredId(serviceTypeIdMap, serviceType),
              })),
            },
          },
        },
      },
      include: {
        customer: true,
      },
    });

    if (!user.customer) {
      throw new Error(`${seed.email}의 일반 유저 프로필 생성에 실패했습니다.`);
    }

    customers.set(seed.key, {
      userId: user.id,
      customerId: user.customer.id,
      name: user.name,
    });
  }

  return customers;
}

async function createMovers(
  passwordHash: string,
  serviceTypeIdMap: ReadonlyMap<string, string>,
  regionIdMap: ReadonlyMap<string, string>,
): Promise<Map<string, CreatedMover>> {
  const movers = new Map<string, CreatedMover>();

  for (const seed of MOVER_SEEDS) {
    const user = await prisma.user.create({
      data: {
        role: UserRole.MOVER,
        name: seed.name,
        email: seed.email,
        phone: seed.phone,
        passwordHash,
        mover: {
          create: {
            nickname: seed.nickname,
            careerYears: seed.careerYears,
            shortIntroduction: seed.shortIntroduction,
            description: seed.description,
            serviceTypes: {
              create: seed.serviceTypes.map((serviceType) => ({
                serviceTypeId: getRequiredId(serviceTypeIdMap, serviceType),
              })),
            },
            regions: {
              create: seed.regions.map((region) => ({
                regionId: getRequiredId(regionIdMap, region),
              })),
            },
          },
        },
      },
      include: {
        mover: true,
      },
    });

    if (!user.mover) {
      throw new Error(`${seed.email}의 기사님 프로필 생성에 실패했습니다.`);
    }

    movers.set(seed.key, {
      userId: user.id,
      moverId: user.mover.id,
      name: user.name,
      nickname: user.mover.nickname,
    });
  }

  return movers;
}

function getRequired<T>(map: ReadonlyMap<string, T>, key: string, label: string): T {
  const value = map.get(key);
  if (!value) throw new Error(`${label}(${key})을 찾을 수 없습니다.`);
  return value;
}

/**
 * 요청 한 건과 그 요청의 지정 기사님·견적·반려·리뷰·알림을 만듭니다.
 * 알림은 앱이 실제로 보내는 제목·문구·params 형식을 따르고, 지난 일의 알림은 읽음 처리합니다.
 *
 * @returns 이 요청에서 만든 행 개수
 * @sideeffect MoveRequest, DesignatedRequest, Quote, RequestRejection, Review, Notification을 생성합니다.
 */
async function createMoveRequest(
  seed: MoveRequestSeed,
  customers: ReadonlyMap<string, CreatedCustomer>,
  movers: ReadonlyMap<string, CreatedMover>,
  serviceTypeIdMap: ReadonlyMap<string, string>,
): Promise<SeedSummary> {
  const customer = getRequired(customers, seed.customer, "고객");
  const requestCreatedAt = createDateFromNow(-seed.createdDaysAgo, 9);
  const moveDate = createDateFromNow(seed.moveDateOffset);
  const isPast = seed.status === MoveRequestStatus.COMPLETED;
  const serviceTypeLabel = SERVICE_TYPE_LABELS[seed.serviceType];
  const notifications: Prisma.NotificationCreateManyInput[] = [];
  const summary: SeedSummary = { moveRequests: 1, quotes: 0, rejections: 0, reviews: 0, notifications: 0 };

  const moveRequest = await prisma.moveRequest.create({
    data: {
      customerId: customer.customerId,
      serviceTypeId: getRequiredId(serviceTypeIdMap, seed.serviceType),
      moveDate,
      fromAddress: seed.fromAddress,
      toAddress: seed.toAddress,
      status: seed.status,
      createdAt: requestCreatedAt,
    },
  });

  for (const moverKey of seed.designatedMovers ?? []) {
    const mover = getRequired(movers, moverKey, "지정 기사님");

    // 앱도 지정 요청을 만들 때는 별도 알림을 보내지 않으므로 지정 기록만 남깁니다.
    await prisma.designatedRequest.create({
      data: { moveRequestId: moveRequest.id, moverId: mover.moverId, createdAt: requestCreatedAt },
    });
  }

  // 앱(move-request.service의 요청 생성)처럼 고객 지역과 서비스 유형이 모두 맞는 기사님 전원에게
  // 새 요청 알림을 보냅니다. 이미 견적을 보냈거나 반려한 기사님, 지난 요청의 알림은 읽음으로 둡니다.
  const actedMoverKeys = new Set([
    ...[...(seed.proposedQuotes ?? []), ...(seed.declinedQuotes ?? []), ...(seed.confirmedQuote ? [seed.confirmedQuote] : [])].map((quote) => quote.mover),
    ...(seed.rejections ?? []).map((rejection) => rejection.mover),
  ]);
  const customerRegion = getRequired(new Map(CUSTOMER_SEEDS.map((customerSeed) => [customerSeed.key, customerSeed])), seed.customer, "고객").region;

  for (const moverSeed of MOVER_SEEDS) {
    if (!moverSeed.regions.includes(customerRegion) || !moverSeed.serviceTypes.includes(seed.serviceType)) continue;

    const mover = getRequired(movers, moverSeed.key, "알림 기사님");
    const isRead = seed.status !== MoveRequestStatus.WAITING || actedMoverKeys.has(moverSeed.key);

    notifications.push({
      userId: mover.userId,
      moveRequestId: moveRequest.id,
      type: NotificationType.NEW_MOVE_REQUEST,
      title: "새로운 이사 견적 요청이 도착했습니다.",
      content: "고객님이 새로운 이사 견적을 요청했습니다.",
      readAt: isRead ? addHours(requestCreatedAt, 1) : null,
      createdAt: requestCreatedAt,
    });
  }

  // 대기 중 요청에서 가장 최근에 도착한 견적입니다. 이 견적의 알림만 안 읽음으로 둡니다.
  const latestProposedHours = Math.max(...(seed.proposedQuotes ?? []).map((quote) => quote.hoursAfterRequest));

  const createQuote = async (quote: QuoteSeed, status: QuoteStatus) => {
    const mover = getRequired(movers, quote.mover, "견적 기사님");
    const createdAt = addHours(requestCreatedAt, quote.hoursAfterRequest);
    const created = await prisma.quote.create({
      data: {
        moveRequestId: moveRequest.id,
        moverId: mover.moverId,
        price: quote.price,
        comment: quote.comment,
        status,
        createdAt,
      },
    });

    summary.quotes += 1;
    notifications.push({
      userId: customer.userId,
      moveRequestId: moveRequest.id,
      quoteId: created.id,
      type: NotificationType.NEW_QUOTE,
      title: "새로운 견적이 도착했습니다.",
      content: `${mover.nickname} 기사님의 ${serviceTypeLabel} 견적이 도착했어요`,
      params: { moverNickname: mover.nickname, serviceType: seed.serviceType },
      // 대기 중 요청의 가장 최근 견적만 안 읽은 상태로 두어 알림 배지를 확인할 수 있게 합니다.
      readAt:
        status === QuoteStatus.PROPOSED && quote.hoursAfterRequest === latestProposedHours
          ? null
          : addHours(createdAt, 2),
      createdAt,
    });

    return { created, mover, createdAt };
  };

  for (const quote of seed.proposedQuotes ?? []) await createQuote(quote, QuoteStatus.PROPOSED);
  for (const quote of seed.declinedQuotes ?? []) await createQuote(quote, QuoteStatus.REJECTED);

  if (seed.confirmedQuote) {
    const { created, mover, createdAt } = await createQuote(seed.confirmedQuote, QuoteStatus.CONFIRMED);
    // 고객이 견적들을 비교한 뒤 확정했다고 보고, 마지막 견적 도착 하루 뒤를 확정 시점으로 둡니다.
    const lastQuoteHours = Math.max(
      seed.confirmedQuote.hoursAfterRequest,
      ...(seed.declinedQuotes ?? []).map((quote) => quote.hoursAfterRequest),
    );
    const confirmedAt = addHours(requestCreatedAt, lastQuoteHours + 24);

    notifications.push(
      {
        userId: customer.userId,
        moveRequestId: moveRequest.id,
        quoteId: created.id,
        type: NotificationType.QUOTE_CONFIRMED,
        title: "견적이 확정되었습니다.",
        content: `${mover.nickname} 기사님의 견적이 확정되었습니다.`,
        params: { moverNickname: mover.nickname },
        readAt: addHours(confirmedAt, 1),
        createdAt: confirmedAt < createdAt ? createdAt : confirmedAt,
      },
      {
        userId: mover.userId,
        moveRequestId: moveRequest.id,
        quoteId: created.id,
        type: NotificationType.QUOTE_CONFIRMED,
        title: "고객님이 견적을 확정했습니다.",
        content: `${customer.name} 고객님이 견적을 확정했습니다.`,
        params: { customerName: customer.name },
        readAt: isPast ? addHours(confirmedAt, 3) : null,
        createdAt: confirmedAt < createdAt ? createdAt : confirmedAt,
      },
    );

    if (seed.review) {
      await prisma.review.create({
        data: {
          customerId: customer.customerId,
          moveRequestId: moveRequest.id,
          moverId: mover.moverId,
          rating: seed.review.rating,
          content: seed.review.content,
          createdAt: createDateFromNow(seed.moveDateOffset + seed.review.daysAfterMove, 21),
        },
      });
      summary.reviews += 1;
    }
  }

  for (const rejection of seed.rejections ?? []) {
    const mover = getRequired(movers, rejection.mover, "반려 기사님");

    await prisma.requestRejection.create({
      data: {
        moveRequestId: moveRequest.id,
        moverId: mover.moverId,
        reason: rejection.reason,
        createdAt: addHours(requestCreatedAt, rejection.hoursAfterRequest),
      },
    });
    summary.rejections += 1;
  }

  if (notifications.length > 0) {
    await prisma.notification.createMany({ data: notifications });
    summary.notifications += notifications.length;
  }

  return summary;
}

async function createFavorites(
  customers: ReadonlyMap<string, CreatedCustomer>,
  movers: ReadonlyMap<string, CreatedMover>,
): Promise<number> {
  let favoriteCount = 0;

  for (const [customerKey, moverKeys] of Object.entries(FAVORITE_SEEDS)) {
    const customer = getRequired(customers, customerKey, "찜 고객");

    for (const moverKey of moverKeys) {
      await prisma.favorite.create({
        data: {
          customerId: customer.customerId,
          moverId: getRequired(movers, moverKey, "찜 기사님").moverId,
        },
      });
      favoriteCount += 1;
    }
  }

  return favoriteCount;
}

/**
 * 리뷰 테스트용 고객을 조회하거나 생성합니다.
 *
 * 기존 aaa123@test.com 계정이 있으면 비밀번호와 사용자 정보는 변경하지
 * 않습니다. 고객 프로필이 없을 때만 프로필을 추가합니다.
 *
 * @param serviceTypeIdMap 서비스 유형 이름과 UUID 매핑
 * @param regionIdMap 지역 이름과 UUID 매핑
 * @returns 리뷰 테스트용 고객 식별자
 * @throws Error 같은 이메일이 기사님 계정으로 등록된 경우
 * @sideeffect 계정 또는 고객 프로필이 없는 경우 새 행을 생성합니다.
 */
async function ensureReviewTestCustomer(
  serviceTypeIdMap: ReadonlyMap<string, string>,
  regionIdMap: ReadonlyMap<string, string>,
): Promise<CreatedCustomer> {
  const passwordHash = await hashPassword(SEED_PASSWORD);

  const user = await prisma.user.upsert({
    where: {
      email: REVIEW_TEST_CUSTOMER_EMAIL,
    },
    update: {},
    create: {
      role: UserRole.CUSTOMER,
      name: "조은비",
      email: REVIEW_TEST_CUSTOMER_EMAIL,
      passwordHash,
    },
    include: {
      customer: true,
    },
  });

  if (user.role !== UserRole.CUSTOMER) {
    throw new Error(
      `${REVIEW_TEST_CUSTOMER_EMAIL} 계정은 CUSTOMER 역할이어야 합니다.`,
    );
  }

  const customer =
    user.customer ??
    (await prisma.customer.create({
      data: {
        userId: user.id,
        regionId: getRequiredId(regionIdMap, "SEOUL"),
      },
    }));

  /**
   * 새로 만든 고객뿐 아니라 기존 고객도 리뷰 테스트 화면에서 서비스
   * 유형 관련 데이터가 비어 있지 않도록 모든 유형을 연결합니다.
   */
  await prisma.customerServiceType.createMany({
    data: SERVICE_TYPE_NAMES.map((serviceType) => ({
      customerId: customer.id,
      serviceTypeId: getRequiredId(serviceTypeIdMap, serviceType),
    })),
    skipDuplicates: true,
  });

  return {
    userId: user.id,
    customerId: customer.id,
    name: user.name,
  };
}

/**
 * aaa123@test.com 고객에게 완료된 이사 4건을 생성합니다.
 *
 * 모든 요청에는 CONFIRMED 견적을 한 건씩 연결합니다.
 * 리뷰가 있는 2건은 WRITTEN 목록에, 리뷰가 없는 2건은 WRITABLE 목록에
 * 표시됩니다.
 *
 * @param movers 완료 이사를 담당한 seed 기사님 목록
 * @param serviceTypeIdMap 서비스 유형 이름과 UUID 매핑
 * @param regionIdMap 지역 이름과 UUID 매핑
 * @returns 추가된 완료 요청·견적·리뷰 개수
 * @sideeffect MoveRequest, Quote, Review 행을 생성하거나 갱신합니다.
 */
async function createReviewTestFixtures(
  movers: CreatedMover[],
  serviceTypeIdMap: ReadonlyMap<string, string>,
  regionIdMap: ReadonlyMap<string, string>,
): Promise<ReviewTestFixtureSummary> {
  const customer = await ensureReviewTestCustomer(
    serviceTypeIdMap,
    regionIdMap,
  );

  let writtenReviews = 0;
  let writableReviews = 0;

  await prisma.$transaction(async (transaction) => {
    for (const seed of REVIEW_TEST_FIXTURE_SEEDS) {
      const mover = movers[seed.moverIndex];

      if (!mover) {
        throw new Error(
          `${seed.moverIndex}번 리뷰 fixture 기사님을 찾지 못했습니다.`,
        );
      }

      const moveDate = createDateFromNow(seed.moveDateOffset);
      const requestCreatedAt = createDateFromNow(seed.moveDateOffset - 14, 9);
      const quoteCreatedAt = createDateFromNow(seed.moveDateOffset - 10, 11);

      /**
       * 고정 UUID로 upsert하여 seed를 재실행해도 완료 요청이 계속
       * 늘어나지 않도록 합니다.
       */
      await transaction.moveRequest.upsert({
        where: {
          id: seed.moveRequestId,
        },
        update: {
          customerId: customer.customerId,
          serviceTypeId: getRequiredId(serviceTypeIdMap, seed.serviceType),
          moveDate,
          fromAddress: seed.fromAddress,
          toAddress: seed.toAddress,
          status: MoveRequestStatus.COMPLETED,
        },
        create: {
          id: seed.moveRequestId,
          customerId: customer.customerId,
          serviceTypeId: getRequiredId(serviceTypeIdMap, seed.serviceType),
          moveDate,
          fromAddress: seed.fromAddress,
          toAddress: seed.toAddress,
          status: MoveRequestStatus.COMPLETED,
          createdAt: requestCreatedAt,
        },
      });

      /**
       * 리뷰 작성 가능 조건을 충족하려면 완료 요청에 CONFIRMED 견적이
       * 반드시 존재해야 합니다.
       */
      await transaction.quote.upsert({
        where: {
          id: seed.quoteId,
        },
        update: {
          moveRequestId: seed.moveRequestId,
          moverId: mover.moverId,
          price: seed.price,
          comment: seed.comment,
          status: QuoteStatus.CONFIRMED,
        },
        create: {
          id: seed.quoteId,
          moveRequestId: seed.moveRequestId,
          moverId: mover.moverId,
          price: seed.price,
          comment: seed.comment,
          status: QuoteStatus.CONFIRMED,
          createdAt: quoteCreatedAt,
        },
      });

      if (seed.review) {
        /**
         * 리뷰가 있는 요청은 고객의 WRITTEN 목록과 기사님의 받은 리뷰
         * 목록에 표시됩니다.
         */
        await transaction.review.upsert({
          where: {
            id: seed.review.id,
          },
          update: {
            customerId: customer.customerId,
            moveRequestId: seed.moveRequestId,
            moverId: mover.moverId,
            rating: seed.review.rating,
            content: seed.review.content,
          },
          create: {
            id: seed.review.id,
            customerId: customer.customerId,
            moveRequestId: seed.moveRequestId,
            moverId: mover.moverId,
            rating: seed.review.rating,
            content: seed.review.content,
            createdAt: createDateFromNow(seed.review.createdAtOffset, 14),
          },
        });

        writtenReviews += 1;
        continue;
      }

      /**
       * 리뷰가 없어야 WRITABLE 목록에 표시됩니다.
       * 이전 seed 실행이나 수동 테스트에서 생성된 리뷰가 있으면 제거하여
       * 테스트 상태를 항상 동일하게 유지합니다.
       */
      await transaction.review.deleteMany({
        where: {
          moveRequestId: seed.moveRequestId,
        },
      });

      writableReviews += 1;
    }
  });

  return {
    moveRequests: REVIEW_TEST_FIXTURE_SEEDS.length,
    quotes: REVIEW_TEST_FIXTURE_SEEDS.length,
    writtenReviews,
    writableReviews,
  };
}

async function main(): Promise<void> {
  console.log("개발용 seed 데이터 생성을 시작합니다.");

  validateSeeds();

  await removePreviousSeedData();

  const { serviceTypeIdMap, regionIdMap } = await createReferenceData();

  // 모든 seed 계정이 같은 비밀번호를 쓰므로 bcrypt 해시는 한 번만 계산합니다.
  const passwordHash = await hashPassword(SEED_PASSWORD);

  const customers = await createCustomers(passwordHash, serviceTypeIdMap, regionIdMap);
  const movers = await createMovers(passwordHash, serviceTypeIdMap, regionIdMap);

  const total: SeedSummary = { moveRequests: 0, quotes: 0, rejections: 0, reviews: 0, notifications: 0 };

  for (const seed of MOVE_REQUEST_SEEDS) {
    const summary = await createMoveRequest(seed, customers, movers, serviceTypeIdMap);
    for (const key of Object.keys(total) as (keyof SeedSummary)[]) total[key] += summary[key];
  }

  const favoriteCount = await createFavorites(customers, movers);

  const reviewTestSummary = await createReviewTestFixtures(
    [...movers.values()],
    serviceTypeIdMap,
    regionIdMap,
  );

  console.log("개발용 seed 데이터 생성이 완료되었습니다.");
  console.log({
    users: customers.size + movers.size + 1,
    customers: customers.size + 1,
    movers: movers.size,
    moveRequests: total.moveRequests + reviewTestSummary.moveRequests,
    quotes: total.quotes + reviewTestSummary.quotes,
    rejections: total.rejections,
    favorites: favoriteCount,
    reviews: total.reviews + reviewTestSummary.writtenReviews,
    notifications: total.notifications,
    reviewTestAccount: REVIEW_TEST_CUSTOMER_EMAIL,
    reviewTestWritable: reviewTestSummary.writableReviews,
    reviewTestWritten: reviewTestSummary.writtenReviews,
  });

  console.log(`\n로그인 계정 (비밀번호는 모두 이 파일의 SEED_PASSWORD)`);
  console.table([
    ...CUSTOMER_SEEDS.map((seed) => ({ 역할: "일반 유저", 이메일: seed.email, 이름: seed.name, 확인용: seed.scenario })),
    ...MOVER_SEEDS.map((seed) => ({ 역할: "기사님", 이메일: seed.email, 이름: `${seed.name} (${seed.nickname})`, 확인용: seed.scenario })),
  ]);
}

main()
  .catch((error: unknown) => {
    console.error("개발용 seed 데이터 생성에 실패했습니다.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
