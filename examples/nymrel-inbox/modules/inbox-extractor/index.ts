import { requireOptionalNativeModule } from 'expo-modules-core';

export type ExtractedSegment = {
  text: string;
  page?: number;
  startMs?: number;
  endMs?: number;
};
export type ExtractionResult = { segments: ExtractedSegment[]; truncated: boolean };
export type ExtractionCapabilities = { ocr: boolean; pdf: boolean; audio: boolean; reason?: string };
export type SharedInboxItem = {
  id: string;
  uri?: string;
  text?: string;
  url?: string;
  name?: string;
  mimeType?: string;
};
export interface InboxExtractor {
  capabilities(): ExtractionCapabilities;
  extract(uri: string, mimeType: string, locale: string): Promise<ExtractionResult>;
  getSharedItems(): Promise<SharedInboxItem[]>;
  acknowledgeShared(id: string): Promise<void>;
}

export default requireOptionalNativeModule<InboxExtractor>('InboxExtractor');
