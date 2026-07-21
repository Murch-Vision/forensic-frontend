/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : queries.ts
 * Created at  : 2026-06-23
 * Updated at  : 2026-06-30
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {gql} from "@apollo/client";

// Dashboard, no active case: light launchpad data — global tallies + the
// case list (row click activates a case).
export const DASHBOARD_OVERVIEW_QUERY = gql`
  query DashboardOverview {
    dashboardStats {
      totalSuspects totalTransactions totalCallRecords openCases
      highRiskSuspects totalTransactionVolume
    }
    caseFiles { id caseId caseName status priority leadInvestigator }
  }
`;

// Dashboard, active case: the evidence queries are case-scoped server-side,
// so these lists ARE the case; patterns stay global and are filtered against
// the case's accounts/phones client-side.
export const DASHBOARD_CASE_QUERY = gql`
  query DashboardCase {
    activeCase {
      id caseId caseName description status priority leadInvestigator createdAt
    }
    suspects {
      id suspectId fullName riskLevel occupation initials
      bankAccounts { id }
      phoneNumbers { id number }
    }
    bankAccounts { id bankName maskedNumber suspectId }
    transactions { id bankAccountId timestamp amount type flagStatus }
    callRecords { id startTime }
    suspectLinks { id }
    patterns { alertType severity description timestamp relatedAccountId }
  }
`;

export const TRANSACTIONS_QUERY = gql`
  query Transactions {
    bankAccounts { id accountNumber bankName maskedNumber suspectId }
    transactions(includeRemoved: true) {
      id bankAccountId timestamp amount type category description
      counterpartyAccount counterpartyName channel runningBalance flagStatus
      currency
    }
  }
`;

export const CALL_RECORDS_QUERY = gql`
  query CallRecords {
    callRecords {
      id callerNumber calledNumber startTime durationSeconds callType
      direction location flagStatus suspectId
    }
    suspects {
      id fullName riskLevel
      phoneNumbers { id number }
    }
  }
`;

export const TIMELINE_QUERY = gql`
  query Timeline($suspectId: Int) {
    suspects { id fullName }
    transactions {
      id bankAccountId timestamp amount type description
    }
    callRecords {
      id callerNumber calledNumber startTime durationSeconds callType
      direction location
    }
    correlations(suspectId: $suspectId) {
      suspectId suspectName date transactionTime transactionAmount
      transactionType callTime callerNumber calledNumber callDuration
      timeDifferenceMinutes severity
    }
  }
`;

export const LINKCHART_QUERY = gql`
  query LinkChart {
    suspects {
      id suspectId fullName riskLevel organization initials photoData
    }
    suspectLinks {
      id sourceSuspectId targetSuspectId linkType description strength
      totalFinancialValue totalCallCount confidenceLevel contributingTxnIds
      caseGraphId
    }
  }
`;

export const NETWORK_FLOW_QUERY = gql`
  query NetworkFlow {
    networkFlow {
      nodeLabels nodeColors sourceIndices targetIndices values linkColors
    }
  }
`;

export const GENERATE_LINKS = gql`
  mutation GenerateLinks {
    generateLinks {
      id sourceSuspectId targetSuspectId linkType description strength
      confidenceLevel
    }
  }
`;

// --- Analyst-drawn manual connections (family / friends / etc.) -------------
export const CREATE_MANUAL_LINK = gql`
  mutation CreateManualLink($input: ManualLinkInput!) {
    createManualLink(input: $input) {
      id sourceSuspectId targetSuspectId linkType description strength
      confidenceLevel
    }
  }
`;

export const UPDATE_MANUAL_LINK = gql`
  mutation UpdateManualLink(
    $id: Int!, $description: String!, $confidenceLevel: LinkConfidence
  ) {
    updateManualLink(
      id: $id, description: $description, confidenceLevel: $confidenceLevel
    ) {
      id description confidenceLevel
    }
  }
`;

export const DELETE_MANUAL_LINK = gql`
  mutation DeleteManualLink($id: Int!) {
    deleteManualLink(id: $id)
  }
`;

// Set/clear ONLY a suspect's photo (used from the link-chart node panel).
export const SET_SUSPECT_PHOTO = gql`
  mutation SetSuspectPhoto($id: Int!, $photoData: String) {
    setSuspectPhoto(id: $id, photoData: $photoData) {
      id photoData
    }
  }
`;

// --- Saved connection-graph boards -----------------------------------------
export const CASE_GRAPHS_QUERY = gql`
  query CaseGraphs {
    caseGraphs { id name state createdAt updatedAt }
  }
`;

export const CREATE_CASE_GRAPH = gql`
  mutation CreateCaseGraph(
    $name: String!, $state: String!, $claimUnassignedLinks: Boolean
  ) {
    createCaseGraph(
      name: $name, state: $state, claimUnassignedLinks: $claimUnassignedLinks
    ) {
      id name state createdAt updatedAt
    }
  }
`;

export const UPDATE_CASE_GRAPH = gql`
  mutation UpdateCaseGraph($id: Int!, $name: String, $state: String) {
    updateCaseGraph(id: $id, name: $name, state: $state) {
      id name state updatedAt
    }
  }
`;

export const DELETE_CASE_GRAPH = gql`
  mutation DeleteCaseGraph($id: Int!) {
    deleteCaseGraph(id: $id)
  }
`;

export const INTELBOARD_QUERY = gql`
  query IntelBoard {
    dashboardStats {
      totalSuspects highRiskSuspects totalLinks flaggedTransactions
      totalTransactionVolume openCases
    }
    suspects { id suspectId fullName riskLevel occupation organization city }
    suspectLinks {
      id sourceSuspectId targetSuspectId linkType strength confidenceLevel
    }
    caseFiles { id caseId caseName status priority }
  }
`;

export const ASSOCIATION_MATRIX = gql`
  query AssociationMatrix {
    associationMatrix {
      rowLabel colLabel linkCount totalFinancialValue totalCallCount
      strongestLinkType strength
    }
  }
`;

export const GENERATE_ANB = gql`
  mutation GenerateAnb {
    generateAnbChart { entities links }
  }
`;

export const ANB_CHART_DATA = gql`
  query AnbChartData {
    chartEntities {
      id entityId entityType label description gradeOfInformation attributes
    }
    chartEvents {
      id timestamp eventType title description severity amount location
    }
  }
`;

export const MAP_QUERY = gql`
  query MapData {
    suspectLocations { suspectId fullName displayName lat lng resolvedFrom }
    suspects { id fullName riskLevel city country }
  }
`;

export const DWELL_ZONES = gql`
  query DwellZones($suspectId: Int!) {
    dwellZones(suspectId: $suspectId) {
      displayName lat lng hits hoursDistribution
    }
  }
`;

export const SUSPECT_ACCESS_LOGS = gql`
  query SuspectAccessLogs($suspectId: Int!) {
    accessLogEntries(suspectId: $suspectId) {
      id timestamp accountOrUserId ipAddress deviceModel os source
    }
  }
`;

export const LOCATION_DENSITY = gql`
  query LocationDensity($windowDays: Int) {
    locationDensity(windowDays: $windowDays) {
      lat lng count displayName
    }
  }
`;

export const AUDIT_SEARCH = gql`
  query AuditSearch($fromUtc: String, $toUtc: String, $actor: String,
    $action: String) {
    auditSearch(fromUtc: $fromUtc, toUtc: $toUtc, actor: $actor,
      action: $action) {
      id timestampUtc actor action target detail severity
    }
  }
`;

export const ANALYSIS_QUERY = gql`
  query Analysis {
    bankAccounts {
      id accountNumber bankName accountHolderName maskedNumber
    }
    analysisResults {
      id bankAccountId analyzedAt benfordPasses nearThresholdPercentage
      roundNumberPercentage offHoursPercentage overallRisk riskLevel verdict
    }
    patterns { alertType severity description timestamp }
  }
`;

export const RUN_ANALYSIS = gql`
  mutation RunAnalysis($bankAccountId: Int!) {
    runAccountAnalysis(bankAccountId: $bankAccountId) {
      id bankAccountId overallRisk riskLevel verdict benfordPasses
      nearThresholdPercentage roundNumberPercentage offHoursPercentage
    }
  }
`;

export const TRANSACTION_DRILLDOWN = gql`
  query TransactionDrillDown($transactionId: Int!) {
    transactionDrillDown(transactionId: $transactionId) {
      target {
        id timestamp amount type description counterpartyAccount
        counterpartyName runningBalance flagStatus
      }
      relatedWindow { id timestamp amount type description }
      ruleResult {
        finalScore finalAction finalRisk criticalFlags highFlags
        violations { ruleId ruleName severity description }
      }
    }
  }
`;

export const REPORT_BUNDLE = gql`
  query ReportBundle {
    reportBundle { filename mimeType base64 }
  }
`;

export const ANB_EXPORT = gql`
  query AnbExport {
    anbExport { entitiesCsv linksCsv anx }
  }
`;

export const RULE_ENGINE_QUERY = gql`
  query RuleEngine($bankAccountId: Int!) {
    ruleEngine(bankAccountId: $bankAccountId) {
      bankAccountId finalScore finalAction finalRisk baseScore ruleBoost
      criticalFlags highFlags modelScore modelAction
      violations { ruleId ruleName severity description score timestamp }
    }
  }
`;

export const AUDIT_QUERY = gql`
  query Audit {
    auditEvents { id timestampUtc actor action target detail severity }
    auditVerify { valid brokenAt }
  }
`;

export const OSINT_QUERY = gql`
  query Osint {
    suspects { id suspectId fullName riskLevel nationalId country }
    accessLogEntries {
      id timestamp accountOrUserId fullName ipAddress deviceModel os source
    }
    sanctionsStatus { loaded entryCount loadedFrom }
    sanctionsRefreshLogs(take: 10) {
      id fetchedAtUtc sourceUrl entryCount byteCount success note sha256Hex
    }
  }
`;

export const SCREEN_SUSPECT = gql`
  query ScreenSuspect($id: Int!) {
    screenSuspect(id: $id) {
      score reason
      entry { id caption country programs schema }
    }
  }
`;

export const REFRESH_SANCTIONS = gql`
  mutation RefreshSanctions($url: String) {
    refreshSanctions(url: $url) {
      id fetchedAtUtc sourceUrl entryCount byteCount success note
    }
  }
`;

export const REPORTS_QUERY = gql`
  query Reports {
    dashboardStats {
      totalSuspects totalBankAccounts totalTransactions totalCallRecords
      totalLinks highRiskSuspects flaggedTransactions totalTransactionVolume
    }
    patterns { alertType severity description }
    caseFiles { id caseId caseName status priority leadInvestigator }
  }
`;

export const SETTINGS_QUERY = gql`
  query Settings {
    amlConfig {
      cashReportingThreshold nearThresholdRangeLow nearThresholdRangeHigh
      roundNumberMinAmount roundNumberModulus nightHoursStart nightHoursEnd
      highValueTxnFloor muleDailyInflowMin muleOutflowRatio smurfingUnitMax
      smurfingDailyTotalMin currencySymbol currencyFormat
    }
  }
`;

// Chunked upload for large import files — the preview proxy caps a single
// request body at ~1 MB, so big workbooks travel as sub-MB chunks and are
// referenced afterwards by uploadId.
export const UPLOAD_START = gql`
  mutation UploadStart {
    uploadStart
  }
`;

export const UPLOAD_APPEND = gql`
  mutation UploadAppend($uploadId: String!, $chunk: String!) {
    uploadAppend(uploadId: $uploadId, chunk: $chunk)
  }
`;

// Populate the active case with a lifelike demo call/device network so the
// analytics charts and connection graph are meaningful.
export const GENERATE_SAMPLE_DATA = gql`
  mutation GenerateSampleData {
    generateSampleData {
      enrichedCalls networkCalls phonesEnsured linksCreated
    }
  }
`;

// Case-scoped suspects, for the CDR "subject" picker on the Import page.
export const IMPORT_SUSPECTS = gql`
  query ImportSuspects {
    suspects { id fullName phoneNumbers { number } }
  }
`;

export const EXCEL_SHEETS = gql`
  query ExcelSheets($content: String!, $filename: String!, $uploadId: String) {
    excelSheets(content: $content, filename: $filename, uploadId: $uploadId)
  }
`;

export const PREVIEW_IMPORT = gql`
  query PreviewImport(
    $content: String!
    $filename: String
    $sheetName: String
    $uploadId: String
  ) {
    previewImport(
      content: $content
      filename: $filename
      sheetName: $sheetName
      uploadId: $uploadId
    ) {
      headers sampleRows totalRows detectedProfile domain confidence
      mapping { field column }
    }
  }
`;

export const IMPORT_DATA = gql`
  mutation ImportData(
    $content: String!
    $kind: ImportKind!
    $bankAccountId: Int
    $filename: String
    $sheetName: String
    $subjectSuspectId: Int
    $subjectNumber: String
    $mapping: [ColumnMapInput!]
    $uploadId: String
  ) {
    importData(
      content: $content
      kind: $kind
      bankAccountId: $bankAccountId
      filename: $filename
      sheetName: $sheetName
      subjectSuspectId: $subjectSuspectId
      subjectNumber: $subjectNumber
      mapping: $mapping
      uploadId: $uploadId
    ) {
      totalRows importedRows skippedRows errors messages detectedProfile domain
    }
  }
`;

export const REPORT_PDF = gql`
  query ReportPdf {
    reportPdf { filename mimeType base64 }
  }
`;

export const REPORT_EXCEL = gql`
  query ReportExcel {
    reportExcel { filename mimeType base64 }
  }
`;

export const REPORT_WORD = gql`
  query ReportWord {
    reportWord { filename mimeType base64 }
  }
`;

export const SETTINGS_FULL_QUERY = gql`
  query SettingsFull {
    settings {
      schemaVersion language theme auditRetentionDays telemetryEnabled
      aml {
        cashReportingThreshold nearThresholdRangeLow nearThresholdRangeHigh
        roundNumberMinAmount roundNumberModulus nightHoursStart nightHoursEnd
        highValueTxnFloor muleDailyInflowMin muleOutflowRatio smurfingUnitMax
        smurfingDailyTotalMin currencySymbol currencyFormat
      }
      osint { autoRefreshEnabled refreshUrl intervalHours }
    }
  }
`;

export const UPDATE_SETTINGS = gql`
  mutation UpdateSettings($input: SettingsInput!) {
    updateSettings(input: $input) {
      language theme auditRetentionDays telemetryEnabled
      aml { currencySymbol cashReportingThreshold }
    }
  }
`;

export const TRAVEL_QUERY = gql`
  query TravelCorrelations($suspectId: Int, $hourWindow: Float) {
    travelCorrelations(suspectId: $suspectId, hourWindow: $hourWindow) {
      suspectId suspectName eventTime transactionAmount transactionType
      transactionLocation callNumber callLocation timeDifferenceMinutes
    }
  }
`;

export const CREATE_BANK_ACCOUNT = gql`
  mutation CreateBankAccount($input: BankAccountInput!) {
    createBankAccount(input: $input) { id accountNumber }
  }
`;

export const CREATE_PHONE_NUMBER = gql`
  mutation CreatePhoneNumber($input: PhoneNumberInput!) {
    createPhoneNumber(input: $input) { id number }
  }
`;

export const CREATE_CASE_FILE = gql`
  mutation CreateCaseFile($input: CaseFileInput!) {
    createCaseFile(input: $input) { id caseId caseName }
  }
`;

export const CASE_FILES_QUERY = gql`
  query CaseFilesFull {
    caseFiles {
      id caseId caseName description status priority
      leadInvestigator createdAt closedAt
    }
  }
`;

export const UPDATE_CASE_FILE = gql`
  mutation UpdateCaseFile($caseFileId: Int!, $input: CaseFileUpdateInput!) {
    updateCaseFile(caseFileId: $caseFileId, input: $input) {
      id caseId caseName description status priority leadInvestigator
    }
  }
`;

export const ACTIVE_CASE_QUERY = gql`
  query ActiveCase {
    activeCase { id caseId caseName status priority }
    caseFiles { id caseId caseName status }
  }
`;

export const SET_ACTIVE_CASE = gql`
  mutation SetActiveCase($caseFileId: Int) {
    setActiveCase(caseFileId: $caseFileId) { id caseId caseName status }
  }
`;

export const MERGE_CASES = gql`
  mutation MergeCases($sourceCaseFileIds: [Int!]!, $targetCaseFileId: Int!) {
    mergeCases(
      sourceCaseFileIds: $sourceCaseFileIds
      targetCaseFileId: $targetCaseFileId
    ) {
      id caseId caseName status
    }
  }
`;

export const SET_CASE_STATUS = gql`
  mutation SetCaseStatus($caseFileId: Int!, $status: CaseStatus!) {
    setCaseStatus(caseFileId: $caseFileId, status: $status) {
      id caseId caseName status
    }
  }
`;

export const EVIDENCE_FOR_CASE = gql`
  query EvidenceForCase($caseFileId: Int!) {
    evidenceForCase(caseFileId: $caseFileId) {
      id exhibitNumber sourceType sourceId description severity taggedAtUtc
    }
  }
`;

export const TAG_EVIDENCE = gql`
  mutation TagEvidence(
    $caseFileId: Int!
    $sourceType: EvidenceSourceType!
    $sourceId: Int!
    $description: String
    $severity: AlertSeverity
  ) {
    tagEvidence(
      caseFileId: $caseFileId
      sourceType: $sourceType
      sourceId: $sourceId
      description: $description
      severity: $severity
    ) { id exhibitNumber }
  }
`;

export const SET_AML = gql`
  mutation SetAml($jurisdiction: String!) {
    setAmlJurisdiction(jurisdiction: $jurisdiction) {
      currencySymbol cashReportingThreshold nearThresholdRangeLow
      nearThresholdRangeHigh roundNumberMinAmount roundNumberModulus
      nightHoursStart nightHoursEnd highValueTxnFloor muleDailyInflowMin
      muleOutflowRatio smurfingUnitMax smurfingDailyTotalMin currencyFormat
    }
  }
`;

export const REPORT_SUSPECT_PDF = gql`
  query ReportSuspectPdf($suspectId: Int!) {
    reportSuspectPdf(suspectId: $suspectId) { filename mimeType base64 }
  }
`;

export const REPORT_MARKED_PDF = gql`
  query ReportMarkedSuspectsPdf {
    reportMarkedSuspectsPdf { filename mimeType base64 }
  }
`;

export const MARK_AS_SUSPECT = gql`
  mutation MarkAsSuspect($id: Int!, $marked: Boolean!) {
    markAsSuspect(id: $id, marked: $marked) { id suspectId status }
  }
`;

export const APP_VERSION_QUERY = gql`
  query AppVersion {
    appVersion { version commit branch }
  }
`;

export const SELF_UPDATE = gql`
  mutation SelfUpdate {
    selfUpdate {
      updated previousVersion newVersion previousCommit newCommit
      message restarting
    }
  }
`;

export const GLOBAL_PEOPLE_QUERY = gql`
  query GlobalPeople {
    globalPeople {
      key fullName aliases riskLevel photoData occupation nationalId
      matchedBy phoneNumbers accountNumbers transactionCount callRecordCount
      suspects {
        id suspectId fullName aliases nationalId passportNumber dateOfBirth
        gender address city country primaryPhone email occupation
        organization riskLevel notes photoData status createdAt age
      }
      cases {
        suspectId exhibitNumber severity taggedAtUtc
        caseFile { id caseId caseName status priority }
      }
    }
  }
`;
