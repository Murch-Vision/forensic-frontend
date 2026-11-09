import {makeVar} from "@apollo/client";

export interface ReportGraphDraft {
  ownerUserId: number;
  caseFileId: number;
  title: string;
  imageBase64: string;
  width: number;
  height: number;
  capturedAt: string;
}

// Unsaved report attachment, held only while this tab is open. Never put an
// evidence image in localStorage, a URL, or the single-case Apollo cache.
export const reportGraphDraft = makeVar<ReportGraphDraft | null>(null);
