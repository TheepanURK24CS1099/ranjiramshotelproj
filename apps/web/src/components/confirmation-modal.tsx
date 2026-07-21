"use client";

interface ConfirmationModalProps {
  open: boolean;
  recordName: string;
  title?: string;
  message?: string;
  confirmLabel?: string;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmationModal({
  open,
  recordName,
  title,
  message,
  confirmLabel,
  pending = false,
  onCancel,
  onConfirm,
}: ConfirmationModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onCancel();
      }}
    >
      <div
        aria-labelledby="permanent-delete-title"
        aria-modal="true"
        className="w-full max-w-md rounded bg-white p-6 shadow-xl"
        role="dialog"
      >
        <h2 id="permanent-delete-title" className="text-xl font-semibold text-gray-900">
          {title ?? `Delete ${recordName} permanently?`}
        </h2>
        <p className="mt-3 text-sm text-gray-600">
          {message ?? "Permanent deletion cannot be undone. Historical records may prevent this record from being deleted."}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={onCancel}
            className="rounded border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className="rounded bg-[#DC2626] px-4 py-2 text-white hover:bg-[#B91C1C] disabled:opacity-60"
          >
            {pending ? "Saving..." : (confirmLabel ?? "Delete Permanently")}
          </button>
        </div>
      </div>
    </div>
  );
}
