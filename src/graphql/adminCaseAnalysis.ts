import {gql} from "@apollo/client";
import type {BankTransaction} from "../types";

export const ADMIN_ANALYSIS_CASES = gql`
  query AdminAnalysisCases { caseFiles { id caseId caseName status } }
`;
export const ADMIN_CASE_ANALYSIS = gql`
  query AdminCaseAnalysis($caseFileIds: [Int!]!) {
    adminCaseAnalysis(caseFileIds: $caseFileIds) {
      cases { id caseId caseName status }
      accounts {
        caseFileIds statementCaseFileIds
        account { id accountNumber bankName suspectId accountHolderName iban }
      }
      people {
        caseFileIds
        person { id fullName nationalId riskLevel organization photoData offender }
      }
      transactions {
        caseFileIds relationKey
        transaction {
          id bankAccountId timestamp amount type counterpartyAccount
          counterpartyName counterpartyNationalId description category channel
          referenceNumber location runningBalance currency flagStatus
        }
      }
      relations {
        caseFileIds
        relation { key name account nationalId txnCount creditTotal debitTotal }
      }
      links {
        id sourceSuspectId targetSuspectId linkType description strength
        totalFinancialValue contributingTxnIds
      }
    }
  }
`;
export interface AnalysisCase {id: number; caseId: string; caseName: string; status: string}
export interface AnalysisAccount {
  account: {id: number; accountNumber: string; bankName: string | null;
    suspectId: number | null; accountHolderName: string | null; iban: string | null};
  caseFileIds: number[]; statementCaseFileIds: number[];
}
export interface AnalysisPerson {
  person: {id: number; fullName: string; nationalId: string | null; riskLevel: string;
    organization: string | null; photoData: string | null; offender: boolean};
  caseFileIds: number[];
}
export interface AnalysisTxn {transaction: BankTransaction; caseFileIds: number[]; relationKey: string | null}
export interface AnalysisRelation {
  relation: {key: string; name: string; account: string | null; nationalId: string | null;
    txnCount: number; creditTotal: number; debitTotal: number}; caseFileIds: number[];
}
export interface CaseAnalysis {
  cases: AnalysisCase[]; accounts: AnalysisAccount[]; people: AnalysisPerson[];
  transactions: AnalysisTxn[]; relations: AnalysisRelation[];
  links: {id: number; sourceSuspectId: number; targetSuspectId: number; linkType: string;
    description: string | null; strength: number; totalFinancialValue: number | null;
    contributingTxnIds: number[]}[];
}
