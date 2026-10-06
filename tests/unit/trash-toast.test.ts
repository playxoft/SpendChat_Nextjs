import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/actions/trash", () => ({ restoreFromTrash: vi.fn() }));

import { toast } from "sonner";
import { restoreFromTrash } from "@/actions/trash";
import { toastMovedToTrash, undoTrash } from "@/components/app/trash/trash-toast";

const restore = vi.mocked(restoreFromTrash);
const counts = (transactions: number) => ({ transactions, files: 0, folders: 0, profiles: 0 });

beforeEach(() => {
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.info).mockClear();
  restore.mockReset();
});

describe("C7: the Undo says what really happened", () => {
  it("says Restored, with the count, and hands back what came back", async () => {
    restore.mockResolvedValue({ ok: true, counts: counts(2), skipped: 0, transactionIds: ["a", "b"] });
    const onRestored = vi.fn();
    await undoTrash({ transactionIds: ["a", "b"] }, { onRestored });
    expect(toast.success).toHaveBeenCalledWith("Restored 2 transactions", undefined);
    expect(onRestored).toHaveBeenCalledWith({ counts: counts(2), transactionIds: ["a", "b"] });
  });

  it("never says Restored when nothing came back", async () => {
    restore.mockResolvedValue({ ok: true, counts: counts(0), skipped: 1, transactionIds: [] });
    const onRestored = vi.fn();
    await undoTrash({ transactionIds: ["gone"] }, { onRestored });
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
    expect(onRestored).not.toHaveBeenCalled();
  });

  it("names a partial restore", async () => {
    restore.mockResolvedValue({ ok: true, counts: counts(1), skipped: 1, transactionIds: ["a"] });
    await undoTrash({ transactionIds: ["a", "gone"] });
    expect(toast.success).toHaveBeenCalledWith(
      "Restored 1 transaction",
      expect.objectContaining({ description: expect.stringContaining("1 couldn't be restored") }),
    );
  });

  it("restores a big selection in chunks the server takes", async () => {
    restore.mockImplementation(async (sel) => ({
      ok: true,
      counts: counts(sel.transactionIds!.length),
      skipped: 0,
      transactionIds: sel.transactionIds!,
    }));
    const ids = Array.from({ length: 1_200 }, (_, i) => `id-${i}`);
    await undoTrash({ transactionIds: ids });
    expect(restore).toHaveBeenCalledTimes(3);
    expect(toast.success).toHaveBeenCalledWith("Restored 1,200 transactions", undefined);
  });

  it("offers no Undo when nothing moved", () => {
    toastMovedToTrash("Nothing was deleted", { transactionIds: [] });
    expect(toast.info).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    toastMovedToTrash("Moved to trash", { transactionIds: ["a"] });
    expect(toast.success).toHaveBeenCalledWith(
      "Moved to trash",
      expect.objectContaining({ action: expect.objectContaining({ label: "Undo" }) }),
    );
  });
});
