import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTheme } from "../hooks/useTheme";
import {
  listDialogs,
  removeDialog,
  toggleDialogActive,
  type DialogRecord,
} from "../lib/dialogsApi";

const categoryColors: Record<string, string> = {
  Beglaubigung: "bg-blue-100 text-blue-700",
  Gesellschaft: "bg-purple-100 text-purple-700",
  Vermögen: "bg-yellow-100 text-yellow-800",
  Erbrecht: "bg-orange-100 text-orange-700",
  Vorsorge: "bg-teal-100 text-teal-700",
  Familie: "bg-pink-100 text-pink-700",
  Immobilien: "bg-green-100 text-green-700",
};

export function HomePage() {
  useTheme();
  const navigate = useNavigate();
  const [dialogs, setDialogs] = useState<DialogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("Alle");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    listDialogs()
      .then((items) => {
        if (!cancelled) {
          setDialogs(items);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const allCategories = useMemo(
    () => [
      "Alle",
      ...Array.from(
        new Set(dialogs.map((dialog) => dialog.category || "Allgemein")),
      ),
    ],
    [dialogs],
  );

  const filtered = dialogs.filter((d) => {
    const matchesSearch =
      d.title.toLowerCase().includes(search.toLowerCase()) ||
      (d.description || "").toLowerCase().includes(search.toLowerCase());
    const matchesCategory =
      activeCategory === "Alle" ||
      (d.category || "Allgemein") === activeCategory;
    return matchesSearch && matchesCategory;
  });

  async function handleDelete(dialog: DialogRecord) {
    if (!confirm(`„${dialog.title}" wirklich löschen?`)) {
      return;
    }

    try {
      await removeDialog(dialog.id);
      setDialogs((current) => current.filter((item) => item.id !== dialog.id));
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Dialog konnte nicht gelöscht werden.",
      );
    }
  }

  async function handleToggle(dialog: DialogRecord) {
    try {
      const updated = await toggleDialogActive(dialog.id);
      setDialogs((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Dialogstatus konnte nicht geändert werden.",
      );
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-primary text-white py-10 px-4 text-center">
        <h1 className="text-3xl font-bold mb-2">OpenFormulare</h1>
        <p className="text-white/75 text-sm max-w-xl mx-auto">
          Alle Dialoge werden zentral aus der Datenbank geladen und können
          direkt verwaltet werden.
        </p>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <input
            type="text"
            placeholder="Formular suchen …"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:max-w-xl border border-gray-300 rounded-lg px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            onClick={() => navigate("/editor")}
            className="flex items-center justify-center gap-1.5 px-4 py-3 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4v16m8-8H4"
              />
            </svg>
            Neuen Dialog erstellen
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-8">
          {allCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                activeCategory === cat
                  ? "bg-primary text-white border-primary"
                  : "bg-white text-gray-600 border-gray-300 hover:border-primary hover:text-primary"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {error ? (
          <p className="text-center text-red-500 text-sm py-16">{error}</p>
        ) : loading ? (
          <p className="text-center text-gray-400 text-sm py-16">
            Dialoge werden geladen …
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-16">
            Keine Dialoge gefunden.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((dialog) => {
              const category = dialog.category || "Allgemein";
              const isActive = dialog.isActive !== false;

              return (
                <div
                  key={dialog.id}
                  className={`bg-white rounded-xl border p-5 shadow-sm transition-all flex flex-col gap-3 ${
                    isActive
                      ? "border-gray-200 hover:shadow-md hover:border-primary"
                      : "border-gray-200 opacity-70"
                  }`}
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-base font-semibold text-gray-800">
                        {dialog.title}
                      </h2>
                      <span className="text-[11px] text-gray-400 font-mono shrink-0">
                        /{dialog.id}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span
                        className={`self-start text-xs px-2 py-0.5 rounded-full font-medium ${
                          categoryColors[category] ||
                          "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {category}
                      </span>
                      <span className="self-start text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600">
                        {dialog.isSystem ? "Standarddialog" : "Eigener Dialog"}
                      </span>
                      <span
                        className={`self-start text-xs px-2 py-0.5 rounded-full font-medium ${
                          isActive
                            ? "bg-green-100 text-green-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {isActive ? "Aktiv" : "Deaktiviert"}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-gray-500 leading-relaxed flex-1">
                    {dialog.description || "Keine Beschreibung hinterlegt."}
                  </p>
                  <div className="flex gap-2 mt-auto pt-2">
                    {isActive ? (
                      <Link
                        to={`/${dialog.id}`}
                        className="flex-1 text-center text-xs font-medium text-primary border border-primary/30 rounded py-1.5 hover:bg-primary/5 transition-colors"
                      >
                        Öffnen →
                      </Link>
                    ) : (
                      <span className="flex-1 text-center text-xs font-medium text-gray-400 border border-gray-200 rounded py-1.5">
                        Deaktiviert
                      </span>
                    )}
                    <Link
                      to={`/editor/${dialog.id}`}
                      className="text-xs font-medium text-gray-500 border border-gray-200 rounded px-3 py-1.5 hover:bg-gray-50 transition-colors"
                    >
                      Bearbeiten
                    </Link>
                    <button
                      onClick={() => void handleToggle(dialog)}
                      className="text-xs font-medium text-gray-500 border border-gray-200 rounded px-3 py-1.5 hover:bg-gray-50 transition-colors"
                    >
                      {isActive ? "Deaktivieren" : "Aktivieren"}
                    </button>
                    <button
                      onClick={() => void handleDelete(dialog)}
                      className="text-xs text-gray-400 hover:text-red-500 border border-gray-200 rounded px-2 py-1.5 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
