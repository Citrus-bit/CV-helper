import "server-only";

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const ID_NUMBER_PATTERN = /(?<!\d)\d{17}[\dX](?!\d)/giu;
const PHONE_PATTERN = /(?<!\d)(?:\+?86[-\s]?)?1[3-9]\d{9}(?!\d)|(?<!\d)(?:\+?\d{1,3}[-\s]?)?(?:\d[-\s]?){7,12}(?!\d)/g;
const URL_PATTERN = /\bhttps?:\/\/[^\s<>{}\[\]"']+|\bwww\.[^\s<>{}\[\]"']+/giu;
const LABELED_ADDRESS_PATTERN = /(?:地址|住址|现居地|所在地|address|location)\s*[：:]\s*["']?[^\n,，;；"']{2,120}/giu;
const LABELED_NAME_PATTERN = /(?:姓名|名字|full\s+name|candidate\s+name)\s*[：:]\s*["']?(?:[\p{Script=Han}·]{2,12}|[\p{Script=Latin}][\p{Script=Latin}'-]{1,30}(?:\s+[\p{Script=Latin}][\p{Script=Latin}'-]{1,30}){0,2})(?=[,，。.;；!?\n"']|$)/giu;
const CHINESE_SELF_NAME_PATTERN = /我叫\s*[\p{Script=Han}·]{2,12}(?=[,，。.;；!?\s"']|$)/gu;
const ENGLISH_SELF_NAME_PATTERN = /\bmy\s+name\s+is\s+[\p{Script=Latin}][\p{Script=Latin}'-]{1,30}(?:\s+[\p{Script=Latin}][\p{Script=Latin}'-]{1,30}){0,2}(?=[,，。.;；!?\n"']|$)/giu;

const CHINESE_TOP_LEVEL_REGION = [
  "北京市", "天津市", "上海市", "重庆市",
  "河北省", "山西省", "辽宁省", "吉林省", "黑龙江省", "江苏省", "浙江省", "安徽省",
  "福建省", "江西省", "山东省", "河南省", "湖北省", "湖南省", "广东省", "海南省",
  "四川省", "贵州省", "云南省", "陕西省", "甘肃省", "青海省", "台湾省",
  "内蒙古自治区", "广西壮族自治区", "西藏自治区", "宁夏回族自治区", "新疆维吾尔自治区",
  "香港特别行政区", "澳门特别行政区",
].join("|");
const CHINESE_ADMIN_ADDRESS_PATTERN = new RegExp(
  `(?:${CHINESE_TOP_LEVEL_REGION})(?:\\s*[\\p{Script=Han}]{1,12}(?:市|自治州|地区|盟))?(?:\\s*[\\p{Script=Han}]{1,12}(?:自治县|区|县|旗))?(?:\\s*[\\p{Script=Han}\\p{N}A-Za-z-]{1,30}(?:街道|镇|乡|路|街|巷|弄|号|栋|幢|单元|室))?`,
  "gu",
);
const CHINESE_LOCAL_ADDRESS_PATTERN = /[\p{Script=Han}]{2,10}(?:自治县|区|县|旗)[\p{Script=Han}\p{N}A-Za-z-]{1,30}(?:街道|镇|乡|路|街|巷|弄|号|栋|幢|单元|室)/gu;
const ENGLISH_STREET_ADDRESS_PATTERN = /\b\d{1,6}(?:-\d{1,6})?\s+[\p{L}\p{N}.'’-]+(?:\s+[\p{L}\p{N}.'’-]+){0,7}\s+(?:street|st\.?|road|rd\.?|avenue|ave\.?|boulevard|blvd\.?|lane|ln\.?|drive|dr\.?|court|ct\.?|way|parkway|pkwy\.?)\b(?:\s*,\s*[\p{L} .'-]{2,40})?(?:\s*,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?)?/giu;
const ENGLISH_PO_BOX_PATTERN = /\bP\.?\s*O\.?\s+Box\s+\d{1,10}\b/giu;

const COMPOUND_CHINESE_SURNAMES = "欧阳|司马|上官|诸葛|夏侯|东方|皇甫|尉迟|公孙|慕容|长孙|宇文|司徒|司空|令狐|轩辕|端木|独孤|南宫|万俟|闻人|百里|东郭|南门|呼延";
const COMMON_CHINESE_SURNAMES = "赵钱孙李周吴郑王冯陈蒋沈韩杨朱秦许何吕张孔曹严华金魏陶姜谢邹苏潘葛范彭鲁韦马方任袁柳鲍史唐薛雷贺倪汤罗郝安常于傅齐康余顾孟黄萧姚邵汪毛戴宋庞熊纪舒项董梁杜蓝季贾江郭林钟徐邱高夏蔡田樊胡霍万卢莫房解应丁邓洪包左石崔龚程邢裴陆翁牛侯段刘龙叶白廖曾关谭温庄阎连向易聂辛简饶翟赖乔文欧阳";
const CHINESE_PERSON_NAME = `(?:(?:${COMPOUND_CHINESE_SURNAMES})[\\p{Script=Han}]{1,2}|[${COMMON_CHINESE_SURNAMES}][\\p{Script=Han}]{1,2})(?:·[\\p{Script=Han}]{1,8})?`;
const SHORT_CHINESE_PERSON_NAME = `(?:(?:${COMPOUND_CHINESE_SURNAMES})[\\p{Script=Han}]{1,2}|[${COMMON_CHINESE_SURNAMES}][\\p{Script=Han}])`;
const CHINESE_CONTEXT_NAME_PATTERN = new RegExp(
  `((?:我(?:曾)?(?:与|和|跟)|(?:曾)?(?:与|和|跟)|同事|导师|主管|经理|推荐人|联系人|合作伙伴|汇报给)\\s*(?:是|为|叫|名为)?\\s*)(${CHINESE_PERSON_NAME})(?=(?:在|于|共同|一起|合作|协作|负责|担任|带领|讨论|完成|推进|[，,。；;！？!?\\s]|$))`,
  "gu",
);
const CHINESE_PLAIN_NAME_PATTERN = new RegExp(
  `(?<![\\p{Script=Han}])(${SHORT_CHINESE_PERSON_NAME})(?=(?:在|于|曾|负责|担任|参与|加入|主导|带领|协助|合作|共同|表示|完成|推进))`,
  "gu",
);
const ENGLISH_CONTEXT_NAME_PATTERN = /\b((?:I\s+(?:worked|collaborated|partnered)\s+(?:with|alongside)|(?:my\s+)?(?:manager|colleague|mentor|referrer|supervisor)(?:\s+(?:was|is|named))?|reported\s+to|contact(?:\s+person)?(?:\s+is)?)[\s:]+)((?:[A-Z][\p{Script=Latin}'’-]{1,30})(?:\s+[A-Z][\p{Script=Latin}'’-]{1,30}){1,3})\b/gu;

const POTENTIAL_LABELED_PII_PATTERN = /(?:姓名|名字|full\s+name|candidate\s+name|地址|住址|现居地|所在地|address|location)\s*[：:]\s*(?!\[(?:NAME|ADDRESS)\])[^\n,，;；"']{1,120}/giu;
const POTENTIAL_CHINESE_ADDRESS_PATTERN = /[\p{Script=Han}]{1,12}(?:省|自治区|特别行政区)(?:[\p{Script=Han}\p{N}-]{1,50})|[\p{Script=Han}]{2,12}市[\p{Script=Han}]{1,12}(?:自治县|区|县|旗)/gu;
const POTENTIAL_CHINESE_CONTEXT_NAME_PATTERN = /(?:我(?:曾)?(?:与|和|跟)|同事|导师|主管|经理|推荐人|联系人|合作伙伴|汇报给)\s*(?:是|为|叫|名为)?\s*([\p{Script=Han}·]{2,12})(?=(?:在|于|共同|一起|合作|协作|负责|担任|带领|讨论|完成|推进|[，,。；;！？!?]|$))/gu;
const NON_PERSON_CONTEXT_TERMS = /(?:客户|用户|团队|公司|部门|业务方|供应商|合作方|项目组|组织|机构|社区|平台|系统|产品|市场|岗位|职位)$/u;

export type PiiProjectionHints = Readonly<{
  names?: readonly string[];
  addresses?: readonly string[];
}>;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function flexibleKnownValuePattern(value: string): RegExp | undefined {
  const compact = value.normalize("NFKC").replace(/[\s._-]+/g, "").trim();
  if (compact.length < 2) return undefined;
  const flexible = Array.from(compact).map(escapeRegExp).join("[\\s._-]*");
  const latinOrNumber = /^[\p{Script=Latin}\p{N}]+$/u.test(compact);
  return new RegExp(
    latinOrNumber ? `(?<![\\p{L}\\p{N}])${flexible}(?![\\p{L}\\p{N}])` : flexible,
    "giu",
  );
}

function flexibleKnownNamePatterns(value: string): RegExp[] {
  const primary = flexibleKnownValuePattern(value);
  if (!primary) return [];
  const normalized = value.normalize("NFKC").trim();
  const tokens = normalized.split(/[\s,._-]+/u).filter(Boolean);
  if (
    tokens.length < 2 ||
    !tokens.every((token) => /^[\p{Script=Latin}][\p{Script=Latin}'’-]{0,30}$/u.test(token))
  ) {
    return [primary];
  }
  const reversed = [tokens.at(-1)!, ...tokens.slice(0, -1)]
    .map((token) => Array.from(token).map(escapeRegExp).join("[\\s._-]*"))
    .join("[\\s,._-]*");
  return [
    primary,
    new RegExp(`(?<![\\p{L}\\p{N}])${reversed}(?![\\p{L}\\p{N}])`, "giu"),
  ];
}

function patternMatches(pattern: RegExp, value: string): boolean {
  pattern.lastIndex = 0;
  const matched = pattern.test(value);
  pattern.lastIndex = 0;
  return matched;
}

function containsAmbiguousContextualName(value: string): boolean {
  POTENTIAL_CHINESE_CONTEXT_NAME_PATTERN.lastIndex = 0;
  for (const match of value.matchAll(POTENTIAL_CHINESE_CONTEXT_NAME_PATTERN)) {
    const candidate = match[1]?.trim();
    if (candidate && !NON_PERSON_CONTEXT_TERMS.test(candidate)) {
      POTENTIAL_CHINESE_CONTEXT_NAME_PATTERN.lastIndex = 0;
      return true;
    }
  }
  POTENTIAL_CHINESE_CONTEXT_NAME_PATTERN.lastIndex = 0;
  return false;
}

export class PiiProjector {
  private readonly namePatterns: readonly RegExp[];
  private readonly addressPatterns: readonly RegExp[];

  constructor(hints: PiiProjectionHints = {}) {
    this.namePatterns = (hints.names ?? [])
      .flatMap(flexibleKnownNamePatterns);
    this.addressPatterns = (hints.addresses ?? [])
      .map(flexibleKnownValuePattern)
      .filter((pattern): pattern is RegExp => Boolean(pattern));
  }

  redact(value: string): string {
    let projected = value
      .normalize("NFKC")
      .replace(EMAIL_PATTERN, "[EMAIL]")
      .replace(ID_NUMBER_PATTERN, "[ID_NUMBER]")
      .replace(PHONE_PATTERN, "[PHONE]")
      .replace(URL_PATTERN, "[LINK]")
      .replace(LABELED_ADDRESS_PATTERN, "[ADDRESS]")
      .replace(LABELED_NAME_PATTERN, "姓名：[NAME]")
      .replace(CHINESE_SELF_NAME_PATTERN, "我叫[NAME]")
      .replace(ENGLISH_SELF_NAME_PATTERN, "my name is [NAME]")
      .replace(CHINESE_ADMIN_ADDRESS_PATTERN, "[ADDRESS]")
      .replace(CHINESE_LOCAL_ADDRESS_PATTERN, "[ADDRESS]")
      .replace(ENGLISH_STREET_ADDRESS_PATTERN, "[ADDRESS]")
      .replace(ENGLISH_PO_BOX_PATTERN, "[ADDRESS]")
      .replace(CHINESE_CONTEXT_NAME_PATTERN, "$1[NAME]")
      .replace(CHINESE_PLAIN_NAME_PATTERN, "[NAME]")
      .replace(ENGLISH_CONTEXT_NAME_PATTERN, "$1[NAME]");
    for (const pattern of this.namePatterns) projected = projected.replace(pattern, "[NAME]");
    for (const pattern of this.addressPatterns) projected = projected.replace(pattern, "[ADDRESS]");
    return projected.trim();
  }

  containsSensitiveValue(value: string): boolean {
    const normalized = value.normalize("NFKC");
    return [
      EMAIL_PATTERN,
      ID_NUMBER_PATTERN,
      PHONE_PATTERN,
      URL_PATTERN,
      LABELED_ADDRESS_PATTERN,
      LABELED_NAME_PATTERN,
      CHINESE_SELF_NAME_PATTERN,
      ENGLISH_SELF_NAME_PATTERN,
      CHINESE_ADMIN_ADDRESS_PATTERN,
      CHINESE_LOCAL_ADDRESS_PATTERN,
      ENGLISH_STREET_ADDRESS_PATTERN,
      ENGLISH_PO_BOX_PATTERN,
      CHINESE_CONTEXT_NAME_PATTERN,
      CHINESE_PLAIN_NAME_PATTERN,
      ENGLISH_CONTEXT_NAME_PATTERN,
    ]
      .some((pattern) => patternMatches(pattern, normalized)) ||
      [...this.namePatterns, ...this.addressPatterns].some((pattern) => patternMatches(pattern, normalized));
  }

  assertSafe(
    value: unknown,
    options: { checkAmbiguousContextNames?: boolean } = {},
  ): void {
    const serialized = JSON.stringify(value) ?? "";
    if (this.containsSensitiveValue(serialized)) {
      throw new Error("DIRECT_PII_PATTERN");
    }
    if (patternMatches(POTENTIAL_LABELED_PII_PATTERN, serialized)) {
      throw new Error("LABELED_PII_PATTERN");
    }
    if (patternMatches(POTENTIAL_CHINESE_ADDRESS_PATTERN, serialized)) {
      throw new Error("ADMIN_ADDRESS_PATTERN");
    }
    if (
      options.checkAmbiguousContextNames !== false &&
      containsAmbiguousContextualName(serialized)
    ) {
      throw new Error("AMBIGUOUS_CONTEXT_NAME_PATTERN");
    }
  }
}
