export interface DocumentSource {
  value: string;
  label: string;
}

export const DOCUMENT_SOURCES: readonly DocumentSource[] = [
  { value: "suva", label: "SUVA" },
  { value: "otconst", label: "OTConst" },
  { value: "sia", label: "SIA" },
  { value: "oibt", label: "OIBT" },
  { value: "co", label: "CO" },
  { value: "rpac", label: "RPAC" },
  { value: "autre", label: "Autre" },
];

export const DOCUMENT_SOURCE_LABELS: Record<string, string> = Object.fromEntries(
  DOCUMENT_SOURCES.map((s) => [s.value, s.label]),
);
