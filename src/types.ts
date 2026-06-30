/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : types.ts
 * Created at  : 2026-06-23
 * Updated at  : 2026-06-23
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/

// Mirrors the backend GraphQL Suspect types (the vertical slice).

export type RiskLevel =
  | "UNKNOWN"
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "CRITICAL";

export type SuspectStatus =
  | "UNKNOWN"
  | "ACTIVE"
  | "UNDER_INVESTIGATION"
  | "CLOSED"
  | "CLEARED";

export interface BankAccount {
  id            : number;
  accountNumber : string;
  bankName      : string | null;
  accountType   : string;
  currency      : string;
  currentBalance : number;
  status        : string;
  maskedNumber  : string;
}

export interface PhoneNumber {
  id        : number;
  number    : string;
  provider  : string | null;
  phoneType : string;
  status    : string;
}

export interface SuspectTag {
  id    : number;
  tag   : string;
  color : string;
}

export interface SuspectRecordCounts {
  transactionCount : number;
  callRecordCount  : number;
}

export interface Suspect {
  id           : number;
  suspectId    : string;
  fullName     : string;
  aliases      : string | null;
  nationalId   : string | null;
  passportNumber : string | null;
  dateOfBirth  : string | null;
  gender       : string | null;
  address      : string | null;
  city         : string | null;
  country      : string | null;
  primaryPhone : string | null;
  email        : string | null;
  occupation   : string | null;
  organization : string | null;
  riskLevel    : RiskLevel;
  notes        : string | null;
  photoData    : string | null;
  status       : SuspectStatus;
  createdAt    : string;
  updatedAt    : string;
  initials     : string;
  age          : number;
}

export interface SuspectDetail extends Suspect {
  bankAccounts : BankAccount[];
  phoneNumbers : PhoneNumber[];
  tags         : SuspectTag[];
  recordCounts : SuspectRecordCounts;
}

export type AlertSeverity =
  | "UNKNOWN" | "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type SuspectLinkType =
  | "UNKNOWN" | "FINANCIAL_TRANSFER" | "PHONE_CONTACT" | "SHARED_ADDRESS"
  | "SHARED_DEVICE" | "SHARED_IP" | "MANUAL";

export type FlagStatus = "UNKNOWN" | "NORMAL" | "SUSPICIOUS" | "FLAGGED";

export interface DashboardStats {
  totalSuspects        : number;
  activeSuspects       : number;
  totalBankAccounts    : number;
  totalTransactions    : number;
  totalPhoneNumbers    : number;
  totalCallRecords     : number;
  totalLinks           : number;
  openCases            : number;
  highRiskSuspects     : number;
  flaggedTransactions  : number;
  earliestTransaction  : string | null;
  latestTransaction    : string | null;
  totalTransactionVolume : number;
  earliestCall         : string | null;
  latestCall           : string | null;
}

export interface PatternAlert {
  alertType        : string;
  severity         : string;
  description      : string;
  timestamp        : string;
  relatedAccountId : number | null;
}

export interface BankTransaction {
  id                  : number;
  bankAccountId       : number;
  timestamp           : string;
  amount              : number;
  type                : string;
  category            : string | null;
  description         : string | null;
  referenceNumber     : string | null;
  counterpartyAccount : string | null;
  counterpartyName    : string | null;
  channel             : string | null;
  location            : string | null;
  runningBalance      : number;
  flagStatus          : FlagStatus;
}

export interface CallRecord {
  id            : number;
  callerNumber  : string;
  calledNumber  : string;
  startTime     : string;
  durationSeconds : number;
  callType      : string;
  direction     : string;
  cellTower     : string | null;
  location      : string | null;
  latitude      : number | null;
  longitude     : number | null;
  flagStatus    : string | null;
  phoneNumberId : number | null;
  suspectId     : number | null;
}

export interface SuspectLink {
  id                      : number;
  sourceSuspectId         : number;
  targetSuspectId         : number;
  linkType                : SuspectLinkType;
  description             : string | null;
  strength                : number;
  totalFinancialValue     : number | null;
  totalCallCount          : number | null;
  totalCallDurationSeconds : number | null;
  firstContact            : string | null;
  lastContact             : string | null;
  confidenceLevel         : string;
}

export interface CaseFile {
  id               : number;
  caseId           : string;
  caseName         : string;
  description      : string | null;
  status           : string;
  priority         : string;
  leadInvestigator : string | null;
  caseType         : string | null;
  createdAt        : string;
}

export interface AnalysisResult {
  id                     : number;
  bankAccountId          : number;
  analyzedAt             : string;
  benfordPasses          : boolean;
  benfordChiSquared      : number;
  benfordPValue          : number;
  nearThresholdCount     : number;
  nearThresholdPercentage : number;
  avgTransactionsPerDay  : number;
  maxTransactionsPerDay  : number;
  roundNumberPercentage  : number;
  offHoursPercentage     : number;
  overallRisk            : number;
  riskLevel              : RiskLevel;
  verdict                : string | null;
}

export interface AuditEvent {
  id           : number;
  timestampUtc : string;
  actor        : string;
  action       : string;
  target       : string | null;
  detail       : string | null;
  severity     : AlertSeverity;
}

export interface AccessLogEntry {
  id              : number;
  timestamp       : string;
  accountOrUserId : string;
  fullName        : string | null;
  ipAddress       : string | null;
  deviceModel     : string | null;
  os              : string | null;
  source          : string;
  suspectId       : number | null;
}

export interface CorrelationHit {
  suspectId             : number;
  suspectName           : string;
  date                  : string;
  transactionTime       : string;
  transactionAmount     : number;
  transactionType       : string;
  transactionDescription : string | null;
  callTime              : string;
  callerNumber          : string;
  calledNumber          : string;
  callDuration          : number;
  timeDifferenceMinutes : number;
  severity              : string;
}

export interface RuleViolation {
  ruleId      : number;
  ruleName    : string;
  severity    : string;
  description : string;
  score       : number;
  timestamp   : string | null;
}

export interface RuleEngineResult {
  bankAccountId : number;
  violations    : RuleViolation[];
  baseScore     : number;
  ruleBoost     : number;
  finalScore    : number;
  criticalFlags : number;
  highFlags     : number;
  finalAction   : string;
  finalRisk     : string;
  modelScore    : number | null;
  modelAction   : string;
}

export interface RecipientInfo {
  account: string;
  name: string;
  totalAmount: number;
  count: number;
}
export interface CategoryInfo {
  category: string;
  count: number;
  totalAmount: number;
}
export interface MonthlyTrend {
  label: string;
  credits: number;
  debits: number;
  count: number;
}

export interface AccountStatistics {
  bankAccountId         : number;
  totalTransactions     : number;
  totalAmount           : number;
  averageAmount         : number;
  medianAmount          : number;
  maxAmount             : number;
  minAmount             : number;
  stdDeviation          : number;
  totalDebits           : number;
  totalCredits          : number;
  debitCount            : number;
  creditCount           : number;
  netFlow               : number;
  peakHour              : number;
  peakDay               : string;
  hourlyDistribution    : number[];
  dayOfWeekDistribution : number[];
  topRecipients         : RecipientInfo[];
  categoryBreakdown     : CategoryInfo[];
  monthlyTrends         : MonthlyTrend[];
}

export interface NetworkFlowData {
  nodeLabels    : string[];
  nodeColors    : string[];
  sourceIndices : number[];
  targetIndices : number[];
  values        : number[];
  linkColors    : string[];
}

export interface SuspectLocation {
  suspectId    : number;
  fullName     : string;
  displayName  : string;
  lat          : number;
  lng          : number;
  resolvedFrom : string;
}

export interface AmlConfig {
  cashReportingThreshold : number;
  nearThresholdRangeLow  : number;
  nearThresholdRangeHigh : number;
  roundNumberMinAmount   : number;
  roundNumberModulus     : number;
  nightHoursStart        : number;
  nightHoursEnd          : number;
  highValueTxnFloor      : number;
  muleDailyInflowMin     : number;
  muleOutflowRatio       : number;
  smurfingUnitMax        : number;
  smurfingDailyTotalMin  : number;
  currencySymbol         : string;
  currencyFormat         : string;
}

export interface SuspectInput {
  fullName     : string;
  aliases?     : string | null;
  nationalId?  : string | null;
  passportNumber? : string | null;
  dateOfBirth? : string | null;
  gender?      : string | null;
  address?     : string | null;
  city?        : string | null;
  country?     : string | null;
  primaryPhone? : string | null;
  email?       : string | null;
  occupation?  : string | null;
  organization? : string | null;
  riskLevel?   : RiskLevel;
  notes?       : string | null;
  photoData?   : string | null;
  status?      : SuspectStatus;
}
