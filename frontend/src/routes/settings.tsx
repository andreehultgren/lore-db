import { createFileRoute } from "@tanstack/react-router";

function SettingsPage(): JSX.Element {
  return (
    <div className="p-6">
      <h2 className="mb-6 text-xl font-semibold text-kb-ink">Settings</h2>
      <div className="max-w-[900px] text-sm text-kb-soft">
        Settings is reserved for upcoming features.
      </div>
    </div>
  );
}

export const Route = createFileRoute("/settings")({
  component: SettingsPage
});
