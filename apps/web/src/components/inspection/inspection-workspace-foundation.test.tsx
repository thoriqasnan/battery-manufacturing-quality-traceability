import { NextIntlClientProvider } from "next-intl";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import englishMessages from "../../../messages/en.json";
import indonesianMessages from "../../../messages/id.json";
import { InspectionApiError, type InspectionSpecificationDetail } from "@/lib/api/inspection-entry";
import { TraceabilityApiError } from "@/lib/api/traceability";
import { InspectionWorkspaceFoundation } from "./inspection-workspace-foundation";
import { prepareInspectionLocaleHandoff } from "@/lib/inspection-locale-handoff";
import { createInspectionSubmission, inspectionRecoveryAccountBinding, INSPECTION_RECOVERY_STORAGE_KEY, saveUncertainInspectionRecovery } from "@/lib/inspection-entry-state";
import { INSPECTION_WORKSPACE_DRAFT_KEY } from "@/lib/inspection-workspace-draft";

const mocks = vi.hoisted(() => ({
  unit: vi.fn(),
  discovery: vi.fn(),
  detail: vi.fn(),
  history: vi.fn(),
  submit: vi.fn(),
}));

vi.mock("@/lib/api/traceability-detail", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/api/traceability-detail")>(),
  getTraceableUnitDetail: mocks.unit,
}));
vi.mock("@/lib/api/inspection-entry", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/api/inspection-entry")>(),
  discoverInspectionSpecifications: mocks.discovery,
  getInspectionSpecificationDetail: mocks.detail,
  submitInspection: mocks.submit,
}));
vi.mock("@/lib/api/traceability-history", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/api/traceability-history")>(),
  fetchProcessHistory: mocks.history,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a>,
}));

const unit = (traceCode = "PACK-DEMO-001") => ({
  unit: {
    traceCode,
    unitType: "PACK" as const,
    productModel: { code: "MODEL_ALPHA", name: "Model Alpha" },
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-02T00:00:00.000Z",
  },
  sections: {
    genealogy: { hasRecords: true, directRelationCount: 2 },
    processHistory: { hasRecords: true, recordCount: 14 },
    qualityHistory: { hasRecords: true, recordCount: 8 },
    nonconformance: { hasRecords: false, recordCount: 0 },
  },
});

const summary = (code: string, version: number, resultType: "NUMERIC" | "BOOLEAN" | "CATEGORICAL" | "VISUAL" | "TEXT" = "NUMERIC") => ({
  code,
  version,
  name: `${resultType} inspection`,
  resultType,
  targetUnitType: "PACK" as const,
  process: { code: "EOL_TEST", name: "End of line test" },
  routeStep: { productModelCode: "MODEL_ALPHA", routeCode: "PACK_ROUTE", routeVersion: 1, stepOrder: 8 },
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-02T00:00:00.000Z",
});

const configurations = {
  NUMERIC: { type: "NUMERIC", lowerBound: "10", upperBound: "15.5", unitCode: "V" },
  BOOLEAN: { type: "BOOLEAN", expectedValue: true },
  CATEGORICAL: { type: "CATEGORICAL", options: [{ code: "ACCEPT", description: "Within standard", isAcceptable: true }, { code: "REJECT", description: null, isAcceptable: false }] },
  VISUAL: { type: "VISUAL", options: [{ code: "CLEAR", description: "No damage", isAcceptable: true }] },
  TEXT: { type: "TEXT" },
} as const;

function detail(type: keyof typeof configurations, code = `QC_${type}`): InspectionSpecificationDetail {
  const item = summary(code, 1, type);
  return {
    code: item.code,
    version: item.version,
    name: item.name,
    description: "Canonical inspection description",
    targetUnitType: item.targetUnitType,
    process: item.process,
    routeStep: item.routeStep,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    configuration: configurations[type],
  } as InspectionSpecificationDetail;
}

const page = (items = [summary("QC_NUMERIC", 1), summary("QC_NUMERIC", 2)]) => ({
  items,
  page: { number: 1, size: 10, totalItems: items.length, totalPages: items.length ? 1 : 0 },
});

const history = (number = 1, totalPages = 1) => ({
  items: [{
    recordId: `exec_demo_${number}`,
    process: { code: "EOL_TEST", name: "End of line test" },
    route: { code: "PACK_ROUTE", version: 1, stepOrder: 8 },
    attemptNumber: number + 3,
    status: "COMPLETED" as const,
    executionMethod: "MANUAL" as const,
    startedAt: "2026-10-01T08:00:00.000Z",
    finishedAt: "2026-10-01T08:10:00.000Z",
  }, {
    recordId: `exec_other_${number}`,
    process: { code: "CELL_ASSEMBLY", name: "Cell assembly" },
    route: null,
    attemptNumber: 99,
    status: "COMPLETED" as const,
    executionMethod: "MANUAL" as const,
    startedAt: "2026-10-01T07:00:00.000Z",
    finishedAt: "2026-10-01T07:10:00.000Z",
  }],
  page: { number, size: 10, totalItems: totalPages * 10, totalPages },
});

function renderWorkspace(locale = "en", direction: "ltr" | "rtl" = "ltr", onUnauthenticated = vi.fn()) {
  return render(<div dir={direction} data-testid="locale-root"><NextIntlClientProvider locale={locale} messages={locale === "id" ? indonesianMessages : englishMessages}><InspectionWorkspaceFoundation onUnauthenticated={onUnauthenticated} accountUserId="00000000-0000-4000-8000-000000000001" csrfToken="csrf-test-token" /></NextIntlClientProvider></div>);
}

async function confirm(code = "pack-demo-001") {
  const user = userEvent.setup();
  const input = screen.getByLabelText(/trace code|kode lacak/i);
  await user.type(input, code);
  expect(input).toHaveValue(code.toUpperCase());
  await user.click(screen.getByRole("button", { name: /confirm unit|konfirmasi unit/i }));
  await screen.findByText("MODEL_ALPHA · Model Alpha");
  return user;
}

function setInspectionTime({ year = "2026", month = "01", day = "11", hour = "15", minute = "30" } = {}) {
  fireEvent.change(screen.getByRole("textbox", { name: "Year" }), { target: { value: year } });
  fireEvent.change(screen.getByRole("textbox", { name: "Month" }), { target: { value: month } });
  fireEvent.change(screen.getByRole("textbox", { name: "Day" }), { target: { value: day } });
  fireEvent.change(screen.getByRole("textbox", { name: "Hour" }), { target: { value: hour } });
  fireEvent.change(screen.getByRole("textbox", { name: "Minute" }), { target: { value: minute } });
}

async function completeNumericReview() {
  const user = await confirm();
  await user.click(screen.getByRole("radio", { name: /QC_NUMERIC · v1/ }));
  fireEvent.change(await screen.findByLabelText("Measured value (V)"), { target: { value: "12.500000" } });
  setInspectionTime();
  await user.click(screen.getByRole("button", { name: "Review inspection draft" }));
  await screen.findByRole("heading", { name: "Review inspection draft" });
  return user;
}

describe("inspection unit and specification selection", () => {
  beforeEach(() => {
    mocks.unit.mockReset().mockResolvedValue(unit());
    mocks.discovery.mockReset().mockResolvedValue(page());
    mocks.detail.mockReset().mockResolvedValue(detail("NUMERIC"));
    mocks.history.mockReset().mockResolvedValue(history());
    mocks.submit.mockReset().mockResolvedValue({
      traceCode: "PACK-DEMO-001",
      specification: { code: "QC_NUMERIC", version: 1 },
      processCode: "EOL_TEST",
      execution: null,
      attemptNumber: 9,
      inspectedAt: "2026-01-11T08:30:00.000Z",
      createdAt: "2026-01-11T08:31:00.000Z",
      evidence: { type: "NUMERIC", value: "12.500000", unitCode: "V" },
      outcome: "PASS",
    });
    sessionStorage.clear();
  });

  it("normalizes trace codes, rejects invalid input, confirms public unit data, and filters discovery by unit type", async () => {
    renderWorkspace();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Trace code"), "bad code");
    await user.click(screen.getByRole("button", { name: "Confirm unit" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid trace code");
    expect(mocks.unit).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText("Trace code"));
    await confirm();
    expect(mocks.unit).toHaveBeenCalledWith("PACK-DEMO-001", expect.any(AbortSignal));
    expect(mocks.discovery).toHaveBeenCalledWith({ targetUnitType: "PACK", page: 1, pageSize: 10 }, expect.any(AbortSignal));
    expect(screen.getByText("14 process · 8 quality")).toBeVisible();
  });

  it("isolates technical trace codes and adds hyphen-only preferred wrap opportunities", async () => {
    const traceCode = "PACK-DEMO-ALPHA-RETEST";
    mocks.unit.mockResolvedValueOnce(unit(traceCode));
    renderWorkspace("ar", "rtl");

    await confirm(traceCode);

    const identifier = screen.getByLabelText(traceCode);
    expect(identifier).toHaveAttribute("dir", "ltr");
    expect(identifier).toHaveClass("max-w-full", "break-words", "[word-break:normal]");
    expect(identifier.textContent).toBe(traceCode);
    expect(identifier.querySelectorAll("wbr")).toHaveLength(3);
    expect(identifier.closest("div")).toHaveClass("min-w-0");
  });

  it("preserves the entered trace on not-found and renders safe lookup failures", async () => {
    mocks.unit.mockRejectedValueOnce(new TraceabilityApiError("notFound"));
    renderWorkspace();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Trace code"), "missing-pack");
    await user.click(screen.getByRole("button", { name: "Confirm unit" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unit not found");
    expect(screen.getByLabelText("Trace code")).toHaveValue("MISSING-PACK");
  });

  it("resets downstream selection on unit change and ignores an older unit response", async () => {
    let resolveOld!: (value: ReturnType<typeof unit>) => void;
    const oldRequest = new Promise<ReturnType<typeof unit>>((resolve) => { resolveOld = resolve; });
    mocks.unit.mockReset().mockReturnValueOnce(oldRequest).mockResolvedValueOnce(unit("PACK-NEW-002"));
    renderWorkspace();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Trace code"), "PACK-OLD-001");
    await user.click(screen.getByRole("button", { name: /confirm unit/i }));
    await user.clear(screen.getByLabelText("Trace code"));
    await user.type(screen.getByLabelText("Trace code"), "PACK-NEW-002");
    await user.click(screen.getByRole("button", { name: /confirm unit/i }));
    expect(await screen.findByLabelText("PACK-NEW-002")).toBeVisible();
    resolveOld(unit("PACK-OLD-001"));
    await Promise.resolve();
    expect(screen.queryByLabelText("PACK-OLD-001")).not.toBeInTheDocument();
  });

  it("keeps multiple versions explicit and sends supported search, result, process, and pagination filters", async () => {
    const combinedFilterResult = {
      ...summary("DEMO_NUMERIC_LEVEL", 1),
      process: { code: "DEMO_VERIFY", name: "Demo verification" },
    };
    mocks.discovery.mockResolvedValueOnce({ ...page(), page: { number: 1, size: 10, totalItems: 20, totalPages: 2 } }).mockResolvedValueOnce({ items: [summary("QC_NUMERIC", 3)], page: { number: 2, size: 10, totalItems: 20, totalPages: 2 } }).mockResolvedValueOnce(page([combinedFilterResult]));
    renderWorkspace();
    const user = await confirm();
    expect(screen.getByText("QC_NUMERIC · v1")).toBeVisible();
    expect(screen.getByText("QC_NUMERIC · v2")).toBeVisible();
    expect(screen.getAllByRole("radio", { name: /QC_NUMERIC/ })).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("QC_NUMERIC · v3")).toBeVisible();
    await user.type(screen.getByLabelText("Code or name"), "level");
    await user.selectOptions(screen.getByLabelText("Result type"), "NUMERIC");
    await user.type(screen.getByLabelText("Process code"), "demo_verify");
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(mocks.discovery).toHaveBeenLastCalledWith({ targetUnitType: "PACK", page: 1, pageSize: 10, query: "level", resultType: "NUMERIC", processCode: "DEMO_VERIFY" }, expect.any(AbortSignal));
    expect(await screen.findByText("DEMO_NUMERIC_LEVEL · v1")).toBeVisible();
    expect(screen.queryByText("QC_NUMERIC · v3")).not.toBeInTheDocument();
  });

  it("gives Result type a strong focus indicator without changing its fixed control dimensions", async () => {
    renderWorkspace();
    await confirm();
    const resultType = screen.getByLabelText("Result type");

    resultType.focus();

    expect(resultType).toHaveFocus();
    expect(resultType).toHaveClass("h-11", "min-h-11", "max-h-11", "box-border", "py-0", "text-sm", "leading-5");
    expect(resultType).toHaveClass("outline-none", "focus-visible:border-blue-600", "focus-visible:ring-2", "focus-visible:ring-blue-600");
    expect(resultType).not.toHaveClass("focus-visible:ring-blue-700/25");
  });

  it("keeps focus on the selected specification while exact criteria update", async () => {
    mocks.discovery.mockResolvedValue(page([
      summary("QC_BOOLEAN", 1, "BOOLEAN"),
      summary("QC_CATEGORY", 1, "CATEGORICAL"),
      summary("QC_NUMERIC", 1, "NUMERIC"),
    ]));
    mocks.detail.mockImplementation(async (code: string) => {
      if (code === "QC_BOOLEAN") return detail("BOOLEAN", code);
      if (code === "QC_CATEGORY") return detail("CATEGORICAL", code);
      return detail("NUMERIC", code);
    });
    renderWorkspace();
    const user = await confirm();
    const categoryOption = screen.getByRole("radio", { name: /QC_CATEGORY/ });
    const numericOption = screen.getByRole("radio", { name: /QC_NUMERIC/ });

    await user.click(categoryOption);

    expect(categoryOption).toBeChecked();
    expect(categoryOption).toHaveFocus();
    expect(await screen.findByText("Categorical options")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Exact-version inspection criteria" })).not.toHaveFocus();

    await user.click(numericOption);
    expect(numericOption).toBeChecked();
    expect(numericOption).toHaveFocus();
    expect(await screen.findByText("Numeric acceptance criteria")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Exact-version inspection criteria" })).not.toHaveFocus();
  });

  it.each([
    ["NUMERIC", "Numeric acceptance criteria", "Configured lower and upper bounds are inclusive."],
    ["BOOLEAN", "Boolean acceptance criteria", "Expected observation: true"],
    ["CATEGORICAL", "Categorical options", "ACCEPT"],
    ["VISUAL", "Visual options", "no image upload is required"],
    ["TEXT", "Text evidence", "explicit inspector PASS/NG outcome"],
  ] as const)("displays exact %s criteria without calculating an outcome", async (type, heading, evidence) => {
    mocks.discovery.mockResolvedValue(page([summary(`QC_${type}`, 1, type)]));
    mocks.detail.mockResolvedValue(detail(type));
    renderWorkspace();
    const user = await confirm();
    await user.click(screen.getByRole("radio", { name: new RegExp(`QC_${type}`) }));
    expect((await screen.findAllByText(heading))[0]).toBeVisible();
    expect(screen.getAllByText(new RegExp(evidence))[0]).toBeVisible();
    expect(screen.queryByRole("button", { name: /submit inspection/i })).not.toBeInTheDocument();
  });

  it("defaults execution to none, filters by process/route, distinguishes process attempts, and loads another page", async () => {
    mocks.history.mockResolvedValueOnce(history(1, 2)).mockResolvedValueOnce(history(2, 2));
    renderWorkspace();
    const user = await confirm();
    await user.click(screen.getByRole("radio", { name: /QC_NUMERIC · v1/ }));
    const none = await screen.findByRole("radio", { name: "No execution selected" });
    expect(none).toBeChecked();
    expect(screen.getByText(/Process attempt 4/)).toBeVisible();
    expect(screen.queryByText(/Process attempt 99/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load more process history" }));
    expect(await screen.findByText(/Process attempt 5/)).toBeVisible();
    expect(mocks.history).toHaveBeenLastCalledWith("PACK-DEMO-001", { page: 2, pageSize: 10 }, expect.any(AbortSignal));
  });

  it("handles unavailable exact detail safely", async () => {
    mocks.detail.mockRejectedValueOnce(new InspectionApiError("public", 404, "INSPECTION_SPECIFICATION_NOT_FOUND"));
    renderWorkspace();
    const user = await confirm();
    await user.click(screen.getByRole("radio", { name: /QC_NUMERIC · v1/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Exact specification version unavailable");
  });

  it("preserves an exact numeric string, serializes occurrence time, and produces review without a predicted outcome", async () => {
    mocks.discovery.mockResolvedValue(page([summary("QC_NUMERIC", 1)]));
    renderWorkspace();
    const user = await confirm();
    await user.click(screen.getByRole("radio", { name: /QC_NUMERIC · v1/ }));
    const measurement = await screen.findByLabelText("Measured value (V)");
    fireEvent.change(measurement, { target: { value: "+0012.500000" } });
    setInspectionTime();
    expect(document.querySelector('input[type="datetime-local"]')).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Inspection occurrence time" })).toHaveAttribute("dir", "ltr");
    await user.click(screen.getByRole("button", { name: "Choose date and time" }));
    expect(screen.getByRole("group", { name: "Choose inspection occurrence date and time" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Year" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Review inspection draft" }));
    expect(await screen.findByRole("heading", { name: "Review inspection draft" })).toHaveFocus();
    expect(screen.getAllByText("+0012.500000").length).toBeGreaterThan(0);
    expect(screen.getByText(/No PASS\/NG prediction/)).toBeVisible();
    expect(screen.getByText(/Z$/)).toBeVisible();
    expect(screen.getByRole("button", { name: /submit inspection/i })).toBeVisible();
    fireEvent.change(measurement, { target: { value: "13.0" } });
    expect(screen.queryByRole("heading", { name: "Review inspection draft" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Review inspection draft" }));
    expect(await screen.findByRole("heading", { name: "Review inspection draft" })).toBeVisible();
    setInspectionTime({ minute: "31" });
    expect(screen.queryByRole("heading", { name: "Review inspection draft" })).not.toBeInTheDocument();
  });

  it("blocks a cleared occurrence time and accepts a corrected picker value", async () => {
    mocks.discovery.mockResolvedValue(page([summary("QC_NUMERIC", 1)]));
    renderWorkspace();
    const user = await confirm();
    await user.click(screen.getByRole("radio", { name: /QC_NUMERIC · v1/ }));
    fireEvent.change(await screen.findByLabelText("Measured value (V)"), { target: { value: "12.5" } });
    setInspectionTime();

    fireEvent.change(screen.getByRole("textbox", { name: "Year" }), { target: { value: "" } });
    expect(screen.getByText("Enter a complete valid date and time as DD/MM/YYYY, HH:mm.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Review inspection draft" }));
    expect(screen.queryByRole("heading", { name: "Review inspection draft" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Year" }), { target: { value: "2026" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Minute" }), { target: { value: "31" } });
    await user.click(screen.getByRole("button", { name: "Review inspection draft" }));
    expect(await screen.findByRole("heading", { name: "Review inspection draft" })).toBeVisible();
    expect(screen.getByText(new Date(2026, 0, 11, 15, 31).toISOString())).toBeVisible();
  });

  it("blocks empty and invalid decimal review with linked accessible errors", async () => {
    mocks.discovery.mockResolvedValue(page([summary("QC_NUMERIC", 1)]));
    renderWorkspace();
    const user = await confirm();
    await user.click(screen.getByRole("radio", { name: /QC_NUMERIC · v1/ }));
    await screen.findByLabelText("Measured value (V)");
    await user.click(screen.getByRole("button", { name: "Review inspection draft" }));
    expect(screen.getByText("Evidence is required.")).toBeVisible();
    expect(screen.getByText("Enter a complete valid date and time as DD/MM/YYYY, HH:mm.")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Measured value (V)"), { target: { value: "1e2" } });
    setInspectionTime();
    await user.click(screen.getByRole("button", { name: "Review inspection draft" }));
    expect(screen.getByText(/plain decimal string/)).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Review inspection draft" })).not.toBeInTheDocument();
  });

  it("requires an explicit Boolean while preserving false as evidence", async () => {
    mocks.discovery.mockResolvedValue(page([summary("QC_BOOLEAN", 1, "BOOLEAN")]));
    mocks.detail.mockResolvedValue(detail("BOOLEAN"));
    renderWorkspace();
    const user = await confirm();
    await user.click(screen.getByRole("radio", { name: /QC_BOOLEAN/ }));
    await screen.findByRole("radio", { name: "False" });
    expect(screen.getByRole("radio", { name: "True" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "False" })).not.toBeChecked();
    await user.click(screen.getByRole("radio", { name: "False" }));
    setInspectionTime();
    await user.click(screen.getByRole("button", { name: "Review inspection draft" }));
    expect(await screen.findByRole("heading", { name: "Review inspection draft" })).toBeVisible();
    expect(screen.getAllByText("false").length).toBeGreaterThan(0);
  });

  it.each([["CATEGORICAL", "ACCEPT"], ["VISUAL", "CLEAR"]] as const)("uses only configured textual %s options without upload or outcome", async (type, option) => {
    mocks.discovery.mockResolvedValue(page([summary(`QC_${type}`, 1, type)]));
    mocks.detail.mockResolvedValue(detail(type));
    renderWorkspace();
    const user = await confirm();
    await user.click(screen.getByRole("radio", { name: new RegExp(`QC_${type}`) }));
    const optionControl = await screen.findByRole("radio", { name: new RegExp(option) });
    await user.click(optionControl);
    expect(optionControl).toBeChecked();
    expect(screen.queryByLabelText(/Inspector-provided TEXT outcome/)).not.toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).not.toBeInTheDocument();
  });

  it("trims TEXT evidence, requires explicit outcome, and labels it as inspector input", async () => {
    mocks.discovery.mockResolvedValue(page([summary("QC_TEXT", 1, "TEXT")]));
    mocks.detail.mockResolvedValue(detail("TEXT"));
    renderWorkspace();
    const user = await confirm();
    await user.click(screen.getByRole("radio", { name: /QC_TEXT/ }));
    const text = await screen.findByLabelText("Text evidence");
    await user.type(text, "  observed scratch  ");
    expect(screen.getByText(/20 of 4000 Unicode characters/)).toBeVisible();
    setInspectionTime();
    await user.click(screen.getByRole("button", { name: "Review inspection draft" }));
    expect(screen.getByText("Choose PASS or NG for TEXT evidence.")).toBeVisible();
    await user.click(screen.getByRole("radio", { name: "NG" }));
    await user.click(screen.getByRole("button", { name: "Review inspection draft" }));
    expect(await screen.findByText(/Inspector-provided TEXT outcome: NG/)).toBeVisible();
    expect(screen.getAllByText("observed scratch").length).toBeGreaterThan(0);
  });

  it("invalidates review on execution change while preserving evidence", async () => {
    mocks.discovery.mockResolvedValue(page([summary("QC_NUMERIC", 1)]));
    renderWorkspace();
    const user = await confirm();
    await user.click(screen.getByRole("radio", { name: /QC_NUMERIC · v1/ }));
    fireEvent.change(await screen.findByLabelText("Measured value (V)"), { target: { value: "12.5" } });
    setInspectionTime();
    await user.click(screen.getByRole("button", { name: "Review inspection draft" }));
    expect(await screen.findByRole("heading", { name: "Review inspection draft" })).toBeVisible();
    await user.click(screen.getByRole("radio", { name: /EOL_TEST · Process attempt 4/ }));
    expect(screen.queryByRole("heading", { name: "Review inspection draft" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Measured value (V)")).toHaveValue("12.5");
  });

  it("clears evidence and review when the exact specification changes", async () => {
    renderWorkspace();
    const user = await confirm();
    await user.click(screen.getByRole("radio", { name: /QC_NUMERIC · v1/ }));
    fireEvent.change(await screen.findByLabelText("Measured value (V)"), { target: { value: "12.5" } });
    await user.click(screen.getByRole("radio", { name: /QC_NUMERIC · v2/ }));
    expect(await screen.findByLabelText("Measured value (V)")).toHaveValue("");
    expect(screen.queryByRole("heading", { name: "Review inspection draft" })).not.toBeInTheDocument();
  });

  it("restores a validated unsent public draft across locale remount for the same account", async () => {
    mocks.discovery.mockResolvedValue(page([summary("QC_TEXT", 1, "TEXT")]));
    mocks.detail.mockResolvedValue(detail("TEXT"));
    const first = renderWorkspace();
    const user = await confirm();
    await user.click(screen.getByRole("radio", { name: /QC_TEXT/ }));
    await user.type(await screen.findByLabelText("Text evidence"), "Unsent locale draft");
    await user.click(screen.getByRole("radio", { name: "NG" }));
    setInspectionTime();
    await waitFor(() => expect(screen.getByLabelText("Text evidence")).toHaveValue("Unsent locale draft"));
    await new Promise((resolve) => window.setTimeout(resolve, 10));
    prepareInspectionLocaleHandoff();
    first.unmount();
    renderWorkspace("id");
    expect(await screen.findByDisplayValue("Unsent locale draft")).toBeVisible();
    expect(screen.getByRole("radio", { name: "NG" })).toBeChecked();
    expect(screen.getByRole("textbox", { name: "Tahun" })).toHaveValue("2026");
    expect(screen.getByRole("textbox", { name: "Bulan" })).toHaveValue("01");
    expect(screen.getByRole("textbox", { name: "Hari" })).toHaveValue("11");
    expect(screen.getByRole("textbox", { name: "Jam" })).toHaveValue("15");
    expect(screen.getByRole("textbox", { name: "Menit" })).toHaveValue("30");
    expect(screen.getByText("Spesifikasi terpublikasi yang cocok")).toBeVisible();
  });

  it("restores an unsent workspace after top-level navigation without submitting or replacing recovery", async () => {
    mocks.discovery.mockResolvedValue(page([summary("QC_NUMERIC", 1)]));
    const first = renderWorkspace();
    await completeNumericReview();
    fireEvent.change(screen.getByLabelText("Code or name"), { target: { value: "numeric" } });
    await userEvent.selectOptions(screen.getByLabelText("Result type"), "NUMERIC");
    fireEvent.change(screen.getByLabelText("Process code"), { target: { value: "eol_test" } });
    const recoveryBinding = await inspectionRecoveryAccountBinding("00000000-0000-4000-8000-000000000001");
    const recovery = createInspectionSubmission({ traceCode: "PACK-DEMO-001", specification: { code: "QC_NUMERIC", version: 1 }, execution: null, inspectedAt: "2026-01-11T08:30:00.000Z", evidence: { type: "NUMERIC", value: "12.500000" } }, () => "0123456789abcdef");
    saveUncertainInspectionRecovery(recovery, recoveryBinding);
    const storedRecovery = sessionStorage.getItem(INSPECTION_RECOVERY_STORAGE_KEY);
    await waitFor(() => expect(sessionStorage.getItem(INSPECTION_WORKSPACE_DRAFT_KEY)).toContain("PACK-DEMO-001"));
    first.unmount();

    renderWorkspace();
    expect(await screen.findByLabelText("Measured value (V)")).toHaveValue("12.500000");
    expect(screen.getByRole("textbox", { name: "Year" })).toHaveValue("2026");
    expect(screen.getByLabelText("Code or name")).toHaveValue("numeric");
    expect(screen.getByLabelText("Result type")).toHaveValue("NUMERIC");
    expect(screen.getByLabelText("Process code")).toHaveValue("EOL_TEST");
    expect(screen.getByRole("heading", { name: "Review inspection draft" })).toBeVisible();
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(INSPECTION_RECOVERY_STORAGE_KEY)).toBe(storedRecovery);
  });

  it("submits the frozen reviewed envelope once and renders only the authoritative result", async () => {
    mocks.discovery.mockResolvedValue(page([summary("QC_NUMERIC", 1)]));
    renderWorkspace();
    const user = await completeNumericReview();
    const submit = screen.getByRole("button", { name: "Submit inspection" });
    await user.dblClick(submit);
    expect(mocks.submit).toHaveBeenCalledOnce();
    const [request, options] = mocks.submit.mock.calls[0];
    expect(request).toMatchObject({ traceCode: "PACK-DEMO-001", specification: { code: "QC_NUMERIC", version: 1 }, execution: null, evidence: { type: "NUMERIC", value: "12.500000" } });
    expect(request.inspectedAt).toMatch(/Z$/);
    expect(options).toMatchObject({ csrfToken: "csrf-test-token", idempotencyKey: expect.stringMatching(/^[A-Za-z0-9._:-]{16,128}$/) });
    expect(await screen.findByRole("heading", { name: "Authoritative result" })).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Inspection result: PASS");
    expect(screen.getByText("9", { selector: "dd" })).toBeVisible();
    expect(screen.getByRole("link", { name: "View quality history" })).toHaveAttribute("href", "/traceability/PACK-DEMO-001#quality-history-title");
    expect(sessionStorage.getItem(INSPECTION_RECOVERY_STORAGE_KEY)).toBeNull();
  });

  it("retains an uncertain network outcome and retries the identical envelope with the same key", async () => {
    mocks.discovery.mockResolvedValue(page([summary("QC_NUMERIC", 1)]));
    mocks.submit.mockRejectedValueOnce(new InspectionApiError("network"));
    renderWorkspace();
    const user = await completeNumericReview();
    await user.click(screen.getByRole("button", { name: "Submit inspection" }));
    expect(await screen.findByRole("heading", { name: "Unresolved inspection submission" })).toBeVisible();
    expect(sessionStorage.getItem(INSPECTION_RECOVERY_STORAGE_KEY)).not.toBeNull();
    const [firstRequest, firstOptions] = mocks.submit.mock.calls[0];
    await user.click(screen.getByRole("button", { name: "Retry the same submission" }));
    expect(await screen.findByRole("heading", { name: "Authoritative result" })).toBeVisible();
    const [retryRequest, retryOptions] = mocks.submit.mock.calls[1];
    expect(retryRequest).toEqual(firstRequest);
    expect(retryOptions.idempotencyKey).toBe(firstOptions.idempotencyKey);
    expect(sessionStorage.getItem(INSPECTION_RECOVERY_STORAGE_KEY)).toBeNull();
  });

  it("restores an unresolved submission after refresh and requires explicit same-key retry or abandonment", async () => {
    const request = { traceCode: "PACK-DEMO-001", specification: { code: "QC_NUMERIC", version: 1 }, execution: null, inspectedAt: "2026-01-11T08:30:00.000Z", evidence: { type: "NUMERIC" as const, value: "12.500000" } };
    const binding = await inspectionRecoveryAccountBinding("00000000-0000-4000-8000-000000000001");
    const pending = createInspectionSubmission(request, () => "0123456789abcdef");
    saveUncertainInspectionRecovery(pending, binding);
    renderWorkspace();
    expect(await screen.findByRole("heading", { name: "Unresolved inspection submission" })).toBeVisible();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Retry the same submission" }));
    await screen.findByRole("heading", { name: "Authoritative result" });
    expect(mocks.submit.mock.calls[0][1].idempotencyKey).toBe("0123456789abcdef");
  });

  it("starts Inspect Again as a fresh logical request with a new key", async () => {
    mocks.discovery.mockResolvedValue(page([summary("QC_NUMERIC", 1)]));
    renderWorkspace();
    const user = await completeNumericReview();
    await user.click(screen.getByRole("button", { name: "Submit inspection" }));
    await screen.findByRole("heading", { name: "Authoritative result" });
    const firstKey = mocks.submit.mock.calls[0][1].idempotencyKey;
    await user.click(screen.getByRole("button", { name: "Inspect again" }));
    expect(screen.getByLabelText("Measured value (V)")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Measured value (V)"), { target: { value: "13.0" } });
    setInspectionTime({ minute: "31" });
    await user.click(screen.getByRole("button", { name: "Review inspection draft" }));
    await user.click(screen.getByRole("button", { name: "Submit inspection" }));
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(2));
    expect(mocks.submit.mock.calls[1][1].idempotencyKey).not.toBe(firstKey);
  });

  it("clears recovery for a deterministic stale-specification failure but treats malformed success as uncertain", async () => {
    mocks.discovery.mockResolvedValue(page([summary("QC_NUMERIC", 1)]));
    mocks.submit.mockRejectedValueOnce(new InspectionApiError("public", 409, "INSPECTION_SPECIFICATION_NOT_PUBLISHED"));
    renderWorkspace();
    const user = await completeNumericReview();
    await user.click(screen.getByRole("button", { name: "Submit inspection" }));
    expect(await screen.findByRole("heading", { name: "Inspection was not submitted" })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("no longer published");
    expect(sessionStorage.getItem(INSPECTION_RECOVERY_STORAGE_KEY)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Return to review" }));
    mocks.submit.mockRejectedValueOnce(new InspectionApiError("malformed-response"));
    await user.click(screen.getByRole("button", { name: "Submit inspection" }));
    expect(await screen.findByRole("heading", { name: "Unresolved inspection submission" })).toBeVisible();
    expect(sessionStorage.getItem(INSPECTION_RECOVERY_STORAGE_KEY)).not.toBeNull();
  });

  it("retains a recognized write conflict and retries the frozen submission with the same key", async () => {
    mocks.discovery.mockResolvedValue(page([summary("QC_NUMERIC", 1)]));
    mocks.submit.mockRejectedValueOnce(new InspectionApiError("public", 409, "INSPECTION_WRITE_CONFLICT"));
    renderWorkspace();
    const user = await completeNumericReview();
    await user.click(screen.getByRole("button", { name: "Submit inspection" }));
    expect(await screen.findByRole("heading", { name: "Inspection was not submitted" })).toBeVisible();
    expect(sessionStorage.getItem(INSPECTION_RECOVERY_STORAGE_KEY)).not.toBeNull();
    const firstKey = mocks.submit.mock.calls[0][1].idempotencyKey;
    await user.click(screen.getByRole("button", { name: "Retry the same submission" }));
    expect(await screen.findByRole("heading", { name: "Authoritative result" })).toBeVisible();
    expect(mocks.submit.mock.calls[1][1].idempotencyKey).toBe(firstKey);
    expect(sessionStorage.getItem(INSPECTION_RECOVERY_STORAGE_KEY)).toBeNull();
  });

  it("distinguishes inspector-entered TEXT outcome from the server-confirmed result", async () => {
    mocks.discovery.mockResolvedValue(page([summary("QC_TEXT", 1, "TEXT")]));
    mocks.detail.mockResolvedValue(detail("TEXT"));
    mocks.submit.mockResolvedValue({ traceCode: "PACK-DEMO-001", specification: { code: "QC_TEXT", version: 1 }, processCode: "EOL_TEST", execution: null, attemptNumber: 10, inspectedAt: "2026-01-11T08:30:00.000Z", createdAt: "2026-01-11T08:31:00.000Z", evidence: { type: "TEXT", value: "Observed scratch" }, outcome: "NG" });
    renderWorkspace();
    const user = await confirm();
    await user.click(screen.getByRole("radio", { name: /QC_TEXT/ }));
    await user.type(await screen.findByLabelText("Text evidence"), "Observed scratch");
    await user.click(screen.getByRole("radio", { name: "NG" }));
    setInspectionTime();
    await user.click(screen.getByRole("button", { name: "Review inspection draft" }));
    await user.click(screen.getByRole("button", { name: "Submit inspection" }));
    expect(await screen.findByText("Inspector-entered TEXT outcome: NG. Server-confirmed result: NG.")).toBeVisible();
  });

  it("provides localized Indonesian controls and RTL-safe technical identifiers", async () => {
    renderWorkspace("id", "rtl");
    const user = await confirm();
    expect(screen.getByTestId("locale-root")).toHaveAttribute("dir", "rtl");
    expect(screen.getByRole("heading", { name: "Spesifikasi terpublikasi yang cocok" })).toBeVisible();
    const identity = screen.getByText("QC_NUMERIC · v1");
    expect(identity).toHaveAttribute("dir", "ltr");
    await user.tab();
    expect(document.activeElement).not.toBe(document.body);
  });
});
