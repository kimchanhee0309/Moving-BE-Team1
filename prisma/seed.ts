/**
 * 로컬 개발용 사용자와 도메인 예시 데이터를 생성합니다.
 * Seed 계정도 실제 Auth와 같은 bcrypt 해시를 사용하며 실행 전 기존 seed 전용 데이터를 삭제합니다.
 */
import {
  MoveRequestStatus,
  NotificationType,
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
  name: string;
  email: string;
  phone: string;
  region: RegionName;
  serviceTypes: ServiceTypeName[];
}

interface MoverSeed {
  name: string;
  email: string;
  phone: string;
  nickname: string;
  careerYears: number;
  shortIntroduction: string;
  description: string;
  regions: RegionName[];
  serviceTypes: ServiceTypeName[];
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

interface CreatedMoveRequest {
  moveRequestId: string;
  customerId: string;
  customerUserId: string;
  customerName: string;
  status: MoveRequestStatus;
  selectedMoverIndex: number;
  moveDate: Date;
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
  {
    name: "김민서",
    email: `customer01${SEED_EMAIL_DOMAIN}`,
    phone: "010-1000-0001",
    region: "SEOUL",
    serviceTypes: ["SMALL", "HOME"],
  },
  {
    name: "이서준",
    email: `customer02${SEED_EMAIL_DOMAIN}`,
    phone: "010-1000-0002",
    region: "GYEONGGI",
    serviceTypes: ["HOME"],
  },
  {
    name: "박지우",
    email: `customer03${SEED_EMAIL_DOMAIN}`,
    phone: "010-1000-0003",
    region: "INCHEON",
    serviceTypes: ["SMALL", "OFFICE"],
  },
  {
    name: "최유진",
    email: `customer04${SEED_EMAIL_DOMAIN}`,
    phone: "010-1000-0004",
    region: "BUSAN",
    serviceTypes: ["HOME", "OFFICE"],
  },
  {
    name: "정도윤",
    email: `customer05${SEED_EMAIL_DOMAIN}`,
    phone: "010-1000-0005",
    region: "DAEGU",
    serviceTypes: ["SMALL"],
  },
  {
    name: "한수아",
    email: `customer06${SEED_EMAIL_DOMAIN}`,
    phone: "010-1000-0006",
    region: "DAEJEON",
    serviceTypes: ["HOME"],
  },
  {
    name: "오지호",
    email: `customer07${SEED_EMAIL_DOMAIN}`,
    phone: "010-1000-0007",
    region: "GWANGJU",
    serviceTypes: ["SMALL", "HOME"],
  },
  {
    name: "윤서연",
    email: `customer08${SEED_EMAIL_DOMAIN}`,
    phone: "010-1000-0008",
    region: "ULSAN",
    serviceTypes: ["OFFICE"],
  },
  {
    name: "강하준",
    email: `customer09${SEED_EMAIL_DOMAIN}`,
    phone: "010-1000-0009",
    region: "SEJONG",
    serviceTypes: ["SMALL", "OFFICE"],
  },
  {
    name: "임채원",
    email: `customer10${SEED_EMAIL_DOMAIN}`,
    phone: "010-1000-0010",
    region: "JEJU",
    serviceTypes: ["HOME", "OFFICE"],
  },
];

const MOVER_SEEDS: MoverSeed[] = [
  {
    name: "김동우",
    email: `mover01${SEED_EMAIL_DOMAIN}`,
    phone: "010-2000-0001",
    nickname: "김코드",
    careerYears: 8,
    shortIntroduction: "꼼꼼하고 안전한 이사를 도와드립니다.",
    description:
      "서울과 경기 지역을 중심으로 소형이사, 가정이사, 사무실이사를 진행합니다.",
    regions: ["SEOUL", "GYEONGGI", "INCHEON"],
    serviceTypes: ["SMALL", "HOME", "OFFICE"],
  },
  {
    name: "박준형",
    email: `mover02${SEED_EMAIL_DOMAIN}`,
    phone: "010-2000-0002",
    nickname: "안전이사",
    careerYears: 5,
    shortIntroduction: "고객님의 짐을 내 물건처럼 운반합니다.",
    description: "서울과 인천 지역의 원룸 및 가정이사를 전문으로 합니다.",
    regions: ["SEOUL", "INCHEON"],
    serviceTypes: ["SMALL", "HOME"],
  },
  {
    name: "이현우",
    email: `mover03${SEED_EMAIL_DOMAIN}`,
    phone: "010-2000-0003",
    nickname: "빠른손",
    careerYears: 7,
    shortIntroduction: "빠르고 정확한 이사 서비스를 제공합니다.",
    description: "경기 남부 지역을 중심으로 다양한 이사를 진행하고 있습니다.",
    regions: ["GYEONGGI", "SEOUL"],
    serviceTypes: ["SMALL", "HOME", "OFFICE"],
  },
  {
    name: "최동민",
    email: `mover04${SEED_EMAIL_DOMAIN}`,
    phone: "010-2000-0004",
    nickname: "부산무빙",
    careerYears: 10,
    shortIntroduction: "부산 지역 이사는 믿고 맡겨주세요.",
    description: "부산과 경남 지역에서 10년 동안 이사 서비스를 제공했습니다.",
    regions: ["BUSAN", "GYEONGNAM", "ULSAN"],
    serviceTypes: ["HOME", "OFFICE"],
  },
  {
    name: "정성훈",
    email: `mover05${SEED_EMAIL_DOMAIN}`,
    phone: "010-2000-0005",
    nickname: "대구이사왕",
    careerYears: 6,
    shortIntroduction: "합리적인 가격으로 안전하게 모십니다.",
    description: "대구와 경북 지역의 소형 및 가정이사를 담당합니다.",
    regions: ["DAEGU", "GYEONGBUK"],
    serviceTypes: ["SMALL", "HOME"],
  },
  {
    name: "한재민",
    email: `mover06${SEED_EMAIL_DOMAIN}`,
    phone: "010-2000-0006",
    nickname: "정직한이사",
    careerYears: 4,
    shortIntroduction: "정직한 견적과 친절한 서비스를 약속드립니다.",
    description: "대전, 세종, 충남 지역 이사를 전문적으로 진행합니다.",
    regions: ["DAEJEON", "SEJONG", "CHUNGNAM"],
    serviceTypes: ["SMALL", "HOME"],
  },
  {
    name: "오태양",
    email: `mover07${SEED_EMAIL_DOMAIN}`,
    phone: "010-2000-0007",
    nickname: "광주익스프레스",
    careerYears: 9,
    shortIntroduction: "숙련된 팀이 신속하게 작업합니다.",
    description: "광주와 전남 지역의 가정 및 사무실이사를 진행합니다.",
    regions: ["GWANGJU", "JEONNAM"],
    serviceTypes: ["HOME", "OFFICE"],
  },
  {
    name: "윤도현",
    email: `mover08${SEED_EMAIL_DOMAIN}`,
    phone: "010-2000-0008",
    nickname: "울산베테랑",
    careerYears: 12,
    shortIntroduction: "오랜 경력으로 안전한 이사를 제공합니다.",
    description: "울산과 부산 지역에서 가정이사와 사무실이사를 담당합니다.",
    regions: ["ULSAN", "BUSAN"],
    serviceTypes: ["HOME", "OFFICE"],
  },
  {
    name: "강민혁",
    email: `mover09${SEED_EMAIL_DOMAIN}`,
    phone: "010-2000-0009",
    nickname: "세종무빙",
    careerYears: 3,
    shortIntroduction: "젊고 활기찬 이사팀입니다.",
    description: "세종과 대전 지역의 소형 및 가정이사를 진행합니다.",
    regions: ["SEJONG", "DAEJEON"],
    serviceTypes: ["SMALL", "HOME"],
  },
  {
    name: "임재혁",
    email: `mover10${SEED_EMAIL_DOMAIN}`,
    phone: "010-2000-0010",
    nickname: "제주이사꾼",
    careerYears: 11,
    shortIntroduction: "제주 지역 이사는 편안하게 맡겨주세요.",
    description: "제주 전 지역의 가정이사와 사무실이사를 담당합니다.",
    regions: ["JEJU"],
    serviceTypes: ["SMALL", "HOME", "OFFICE"],
  },
];

const MOVE_REQUEST_SEEDS = [
  {
    serviceType: "SMALL",
    moveDateOffset: 5,
    fromAddress: "서울특별시 중구 세종대로 110",
    toAddress: "경기도 수원시 팔달구 효원로 241",
    status: MoveRequestStatus.WAITING,
  },
  {
    serviceType: "HOME",
    moveDateOffset: 8,
    fromAddress: "서울특별시 마포구 월드컵로 212",
    toAddress: "인천광역시 남동구 정각로 29",
    status: MoveRequestStatus.WAITING,
  },
  {
    serviceType: "OFFICE",
    moveDateOffset: 10,
    fromAddress: "인천광역시 연수구 센트럴로 123",
    toAddress: "서울특별시 강남구 테헤란로 152",
    status: MoveRequestStatus.WAITING,
  },
  {
    serviceType: "HOME",
    moveDateOffset: 12,
    fromAddress: "부산광역시 해운대구 센텀중앙로 55",
    toAddress: "부산광역시 수영구 광안해변로 219",
    status: MoveRequestStatus.WAITING,
  },
  {
    serviceType: "SMALL",
    moveDateOffset: 15,
    fromAddress: "대구광역시 중구 공평로 88",
    toAddress: "대구광역시 수성구 달구벌대로 2450",
    status: MoveRequestStatus.WAITING,
  },
  {
    serviceType: "HOME",
    moveDateOffset: 18,
    fromAddress: "대전광역시 서구 둔산로 100",
    toAddress: "세종특별자치시 한누리대로 2130",
    status: MoveRequestStatus.CONFIRMED,
  },
  {
    serviceType: "HOME",
    moveDateOffset: 20,
    fromAddress: "광주광역시 서구 내방로 111",
    toAddress: "전라남도 나주시 빛가람로 625",
    status: MoveRequestStatus.CONFIRMED,
  },
  {
    serviceType: "OFFICE",
    moveDateOffset: 25,
    fromAddress: "울산광역시 남구 중앙로 201",
    toAddress: "부산광역시 동구 중앙대로 206",
    status: MoveRequestStatus.CONFIRMED,
  },
  {
    serviceType: "SMALL",
    moveDateOffset: -7,
    fromAddress: "세종특별자치시 도움6로 42",
    toAddress: "대전광역시 유성구 대학로 99",
    status: MoveRequestStatus.COMPLETED,
  },
  {
    serviceType: "HOME",
    moveDateOffset: -14,
    fromAddress: "제주특별자치도 제주시 문연로 6",
    toAddress: "제주특별자치도 서귀포시 중앙로 105",
    status: MoveRequestStatus.COMPLETED,
  },
] satisfies {
  serviceType: ServiceTypeName;
  moveDateOffset: number;
  fromAddress: string;
  toAddress: string;
  status: MoveRequestStatus;
}[];

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
    fromAddress: "서울특별시 마포구 월드컵북로 120",
    toAddress: "경기도 고양시 일산동구 중앙로 1000",
    price: 180_000,
    comment: "소형이사 확정 견적입니다. 안전하고 신속하게 진행했습니다.",
    review: {
      id: "aa000003-0000-4000-8000-000000000001",
      rating: 5,
      content:
        "기사님이 시간 약속을 잘 지켜주셨고 짐도 정말 꼼꼼하게 옮겨주셨어요.",
      createdAtOffset: -39,
    },
  },
  {
    moveRequestId: "aa000001-0000-4000-8000-000000000002",
    quoteId: "aa000002-0000-4000-8000-000000000002",
    serviceType: "HOME",
    moverIndex: 1,
    moveDateOffset: -30,
    fromAddress: "서울특별시 송파구 올림픽로 300",
    toAddress: "인천광역시 연수구 센트럴로 160",
    price: 320_000,
    comment: "가정이사 확정 견적입니다. 포장부터 운반까지 진행했습니다.",
    review: {
      id: "aa000003-0000-4000-8000-000000000002",
      rating: 4,
      content:
        "전체적으로 친절하고 안전하게 이사를 진행해 주셔서 만족했습니다.",
      createdAtOffset: -29,
    },
  },
  {
    moveRequestId: "aa000001-0000-4000-8000-000000000003",
    quoteId: "aa000002-0000-4000-8000-000000000003",
    serviceType: "OFFICE",
    moverIndex: 2,
    moveDateOffset: -20,
    fromAddress: "경기도 성남시 분당구 판교역로 166",
    toAddress: "서울특별시 강남구 테헤란로 152",
    price: 550_000,
    comment: "사무실이사 확정 견적입니다. 사무용 집기 운반을 포함합니다.",
  },
  {
    moveRequestId: "aa000001-0000-4000-8000-000000000004",
    quoteId: "aa000002-0000-4000-8000-000000000004",
    serviceType: "HOME",
    moverIndex: 3,
    moveDateOffset: -10,
    fromAddress: "부산광역시 해운대구 센텀중앙로 90",
    toAddress: "부산광역시 수영구 광안해변로 219",
    price: 390_000,
    comment: "가정이사 확정 견적입니다. 포장과 가구 배치를 포함합니다.",
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

function getSelectedMoverIndex(
  requestIndex: number,
  status: MoveRequestStatus,
): number {
  if (status === MoveRequestStatus.WAITING) {
    return requestIndex;
  }

  // mover01 계정에서 확정·완료·반려 상태를 모두 확인할 수 있게 구성합니다.
  if (requestIndex === 5 || requestIndex === 8) {
    return 0;
  }

  return requestIndex;
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

async function removePreviousSeedData(): Promise<void> {
  await prisma.user.deleteMany({
    where: {
      email: {
        endsWith: SEED_EMAIL_DOMAIN,
      },
    },
  });
}

async function createCustomers(
  passwordHashes: string[],
  serviceTypeIdMap: ReadonlyMap<string, string>,
  regionIdMap: ReadonlyMap<string, string>,
): Promise<CreatedCustomer[]> {
  const customers: CreatedCustomer[] = [];

  for (const [index, seed] of CUSTOMER_SEEDS.entries()) {
    const user = await prisma.user.create({
      data: {
        role: UserRole.CUSTOMER,
        name: seed.name,
        email: seed.email,
        phone: seed.phone,
        passwordHash: passwordHashes[index],
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

    customers.push({
      userId: user.id,
      customerId: user.customer.id,
      name: user.name,
    });
  }

  return customers;
}

async function createMovers(
  passwordHashes: string[],
  serviceTypeIdMap: ReadonlyMap<string, string>,
  regionIdMap: ReadonlyMap<string, string>,
): Promise<CreatedMover[]> {
  const movers: CreatedMover[] = [];

  for (const [index, seed] of MOVER_SEEDS.entries()) {
    const user = await prisma.user.create({
      data: {
        role: UserRole.MOVER,
        name: seed.name,
        email: seed.email,
        phone: seed.phone,
        passwordHash: passwordHashes[index],
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

    movers.push({
      userId: user.id,
      moverId: user.mover.id,
      name: user.name,
      nickname: user.mover.nickname,
    });
  }

  return movers;
}

async function createMoveRequests(
  customers: CreatedCustomer[],
  movers: CreatedMover[],
  serviceTypeIdMap: ReadonlyMap<string, string>,
): Promise<CreatedMoveRequest[]> {
  const moveRequests: CreatedMoveRequest[] = [];

  for (const [index, seed] of MOVE_REQUEST_SEEDS.entries()) {
    const customer = customers[index];
    const selectedMoverIndex = getSelectedMoverIndex(index, seed.status);
    const selectedMover = movers[selectedMoverIndex];

    if (!customer || !selectedMover) {
      throw new Error("요청 생성에 필요한 seed 사용자를 찾지 못했습니다.");
    }

    const moveDate = createDateFromNow(seed.moveDateOffset);
    const moveRequest = await prisma.moveRequest.create({
      data: {
        customerId: customer.customerId,
        serviceTypeId: getRequiredId(serviceTypeIdMap, seed.serviceType),
        moveDate,
        fromAddress: seed.fromAddress,
        toAddress: seed.toAddress,
        status: seed.status,
        createdAt: createDateFromNow(-(10 - index), 9),
      },
    });

    if (index % 2 === 0) {
      await prisma.designatedRequest.create({
        data: {
          moveRequestId: moveRequest.id,
          moverId: selectedMover.moverId,
        },
      });

      await prisma.notification.create({
        data: {
          userId: selectedMover.userId,
          moveRequestId: moveRequest.id,
          type: NotificationType.NEW_MOVE_REQUEST,
          title: "새로운 지정 견적 요청이 도착했습니다.",
          content: `${customer.name} 고객님이 지정 견적을 요청했습니다.`,
        },
      });
    }

    moveRequests.push({
      moveRequestId: moveRequest.id,
      customerId: customer.customerId,
      customerUserId: customer.userId,
      customerName: customer.name,
      status: seed.status,
      selectedMoverIndex,
      moveDate,
    });
  }

  return moveRequests;
}

async function createQuotesAndNotifications(
  moveRequests: CreatedMoveRequest[],
  movers: CreatedMover[],
): Promise<number> {
  let quoteCount = 0;

  for (const [index, request] of moveRequests.entries()) {
    const selectedMover = movers[request.selectedMoverIndex];

    if (!selectedMover) {
      throw new Error("견적 생성에 필요한 기사님을 찾지 못했습니다.");
    }

    const price = 120_000 + index * 20_000;

    if (request.status === MoveRequestStatus.WAITING) {
      const proposedQuote = await prisma.quote.create({
        data: {
          moveRequestId: request.moveRequestId,
          moverId: selectedMover.moverId,
          price,
          comment: `${request.customerName} 고객님, 안전하고 꼼꼼하게 이사를 도와드리겠습니다.`,
          status: QuoteStatus.PROPOSED,
        },
      });

      quoteCount += 1;

      await prisma.notification.create({
        data: {
          userId: request.customerUserId,
          moveRequestId: request.moveRequestId,
          quoteId: proposedQuote.id,
          type: NotificationType.NEW_QUOTE,
          title: "새로운 견적이 도착했습니다.",
          content: `${selectedMover.nickname} 기사님이 견적을 보냈습니다.`,
        },
      });

      if (index % 2 === 1) {
        const rejectedMover = movers[(request.selectedMoverIndex + 1) % 10];

        if (!rejectedMover) {
          throw new Error("반려 견적 생성에 필요한 기사님을 찾지 못했습니다.");
        }

        await prisma.quote.create({
          data: {
            moveRequestId: request.moveRequestId,
            moverId: rejectedMover.moverId,
            price: null,
            comment:
              "해당 날짜에는 기존 일정이 있어 요청을 진행하기 어렵습니다.",
            status: QuoteStatus.REJECTED,
          },
        });

        quoteCount += 1;
      }

      continue;
    }

    const confirmedQuote = await prisma.quote.create({
      data: {
        moveRequestId: request.moveRequestId,
        moverId: selectedMover.moverId,
        price,
        comment: `${request.customerName} 고객님, 선택해 주셔서 감사합니다. 안전하게 진행하겠습니다.`,
        status: QuoteStatus.CONFIRMED,
      },
    });

    quoteCount += 1;

    const rejectedMoverIndex =
      request.selectedMoverIndex === index
        ? (index + 1) % movers.length
        : index;

    const rejectedMover = movers[rejectedMoverIndex];

    if (!rejectedMover) {
      throw new Error("반려 견적 생성에 필요한 기사님을 찾지 못했습니다.");
    }

    await prisma.quote.create({
      data: {
        moveRequestId: request.moveRequestId,
        moverId: rejectedMover.moverId,
        price: null,
        comment: "다른 일정으로 인해 해당 요청을 진행하기 어렵습니다.",
        status: QuoteStatus.REJECTED,
      },
    });

    quoteCount += 1;

    await prisma.notification.createMany({
      data: [
        {
          userId: request.customerUserId,
          moveRequestId: request.moveRequestId,
          quoteId: confirmedQuote.id,
          type: NotificationType.QUOTE_CONFIRMED,
          title: "견적이 확정되었습니다.",
          content: `${selectedMover.nickname} 기사님의 견적이 확정되었습니다.`,
        },
        {
          userId: selectedMover.userId,
          moveRequestId: request.moveRequestId,
          quoteId: confirmedQuote.id,
          type: NotificationType.QUOTE_CONFIRMED,
          title: "고객님이 견적을 확정했습니다.",
          content: `${request.customerName} 고객님이 견적을 확정했습니다.`,
        },
      ],
    });

    if (request.status === MoveRequestStatus.COMPLETED) {
      await prisma.notification.createMany({
        data: [
          {
            userId: request.customerUserId,
            moveRequestId: request.moveRequestId,
            quoteId: confirmedQuote.id,
            type: NotificationType.MOVE_DAY,
            title: "이사 완료 내역을 확인해 주세요.",
            content:
              "이사가 완료되었습니다. 기사님에 대한 리뷰를 작성해 주세요.",
          },
          {
            userId: selectedMover.userId,
            moveRequestId: request.moveRequestId,
            quoteId: confirmedQuote.id,
            type: NotificationType.MOVE_DAY,
            title: "이사 일정이 완료되었습니다.",
            content: `${request.customerName} 고객님의 이사 일정이 완료되었습니다.`,
          },
        ],
      });
    }
  }

  return quoteCount;
}

async function createFavorites(
  customers: CreatedCustomer[],
  movers: CreatedMover[],
): Promise<number> {
  let favoriteCount = 0;

  for (const [index, customer] of customers.entries()) {
    const favoriteMoverIndexes = new Set([0, (index + 2) % movers.length]);

    for (const moverIndex of favoriteMoverIndexes) {
      const mover = movers[moverIndex];

      if (!mover) {
        throw new Error("찜 생성에 필요한 기사님을 찾지 못했습니다.");
      }

      await prisma.favorite.create({
        data: {
          customerId: customer.customerId,
          moverId: mover.moverId,
        },
      });

      favoriteCount += 1;
    }
  }

  return favoriteCount;
}

async function createReviews(
  moveRequests: CreatedMoveRequest[],
  movers: CreatedMover[],
): Promise<number> {
  let reviewCount = 0;

  for (const request of moveRequests) {
    if (request.status !== MoveRequestStatus.COMPLETED) {
      continue;
    }

    const mover = movers[request.selectedMoverIndex];

    if (!mover) {
      throw new Error("리뷰 생성에 필요한 기사님을 찾지 못했습니다.");
    }

    await prisma.review.create({
      data: {
        customerId: request.customerId,
        moveRequestId: request.moveRequestId,
        moverId: mover.moverId,
        rating: reviewCount === 0 ? 5 : 4,
        content:
          reviewCount === 0
            ? "친절하고 꼼꼼하게 이사를 진행해 주셔서 만족했습니다."
            : "시간 약속을 잘 지켜주셨고 짐도 안전하게 운반해 주셨습니다.",
      },
    });

    reviewCount += 1;
  }

  return reviewCount;
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
      name: "리뷰테스트",
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

  await removePreviousSeedData();

  const { serviceTypeIdMap, regionIdMap } = await createReferenceData();

  const customerPasswordHashes = await Promise.all(
    CUSTOMER_SEEDS.map(() => hashPassword(SEED_PASSWORD)),
  );

  const moverPasswordHashes = await Promise.all(
    MOVER_SEEDS.map(() => hashPassword(SEED_PASSWORD)),
  );

  const customers = await createCustomers(
    customerPasswordHashes,
    serviceTypeIdMap,
    regionIdMap,
  );

  const movers = await createMovers(
    moverPasswordHashes,
    serviceTypeIdMap,
    regionIdMap,
  );

  const moveRequests = await createMoveRequests(
    customers,
    movers,
    serviceTypeIdMap,
  );

  const quoteCount = await createQuotesAndNotifications(moveRequests, movers);

  const favoriteCount = await createFavorites(customers, movers);
  const reviewCount = await createReviews(moveRequests, movers);

  const reviewTestSummary = await createReviewTestFixtures(
    movers,
    serviceTypeIdMap,
    regionIdMap,
  );

  console.log("개발용 seed 데이터 생성이 완료되었습니다.");
  console.log({
    users: customers.length + movers.length + 1,
    customers: customers.length + 1,
    movers: movers.length,
    moveRequests: moveRequests.length + reviewTestSummary.moveRequests,
    quotes: quoteCount + reviewTestSummary.quotes,
    favorites: favoriteCount,
    reviews: reviewCount + reviewTestSummary.writtenReviews,
    reviewTestAccount: REVIEW_TEST_CUSTOMER_EMAIL,
    reviewTestWritable: reviewTestSummary.writableReviews,
    reviewTestWritten: reviewTestSummary.writtenReviews,
  });
}

main()
  .catch((error: unknown) => {
    console.error("개발용 seed 데이터 생성에 실패했습니다.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
