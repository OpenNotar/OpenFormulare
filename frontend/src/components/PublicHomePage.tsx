import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTheme } from "../hooks/useTheme";
import { listDialogs, type DialogRecord } from "../lib/dialogsApi";
import { getCategories } from "../types/schema";

const categoryColors: Record<string, string> = {
  Beglaubigung: "bg-blue-100 text-blue-700",
  Gesellschaft: "bg-purple-100 text-purple-700",
  Vermögen: "bg-yellow-100 text-yellow-800",
  Erbrecht: "bg-orange-100 text-orange-700",
  Vorsorge: "bg-teal-100 text-teal-700",
  Familie: "bg-pink-100 text-pink-700",
  Immobilien: "bg-green-100 text-green-700",
};

export function PublicHomePage() {
  useTheme();
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

  const allCategories = useMemo(() => {
    const set = new Set<string>();
    for (const dialog of dialogs) {
      const cats = getCategories(dialog);
      if (cats.length === 0) set.add("Allgemein");
      for (const c of cats) set.add(c);
    }
    return [
      "Alle",
      ...Array.from(set).sort((a, b) => a.localeCompare(b, "de")),
    ];
  }, [dialogs]);

  const filtered = dialogs.filter((d) => {
    const matchesSearch =
      d.title.toLowerCase().includes(search.toLowerCase()) ||
      (d.description || "").toLowerCase().includes(search.toLowerCase());
    const cats = getCategories(d);
    const effective = cats.length > 0 ? cats : ["Allgemein"];
    const matchesCategory =
      activeCategory === "Alle" || effective.includes(activeCategory);
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="hyphens-de min-h-screen bg-gray-50">
      <div className="bg-primary text-white py-10 px-4 text-center">
        <h1 className="text-3xl font-bold mb-2">OpenFormulare</h1>
        <p className="text-white/75 text-sm max-w-xl mx-auto">
          Wählen Sie den passenden Dialog aus, um Ihre notarielle Angelegenheit
          vorzubereiten.
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
          <Link
            to="/admin/login"
            className="flex items-center justify-center gap-1.5 px-4 py-3 text-sm font-medium border border-gray-300 text-gray-600 bg-white rounded-lg hover:bg-gray-50 transition-colors"
          >
            Admin
          </Link>
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
              const cats = getCategories(dialog);
              const display = cats.length > 0 ? cats : ["Allgemein"];

              return (
                <Link
                  key={dialog.id}
                  to={`/${dialog.id}`}
                  className="bg-white rounded-xl border p-5 shadow-sm transition-all flex flex-col gap-3 border-gray-200 hover:shadow-md hover:border-primary"
                >
                  <div className="flex flex-col gap-2">
                    <h2 className="text-base font-semibold text-gray-800">
                      {dialog.title}
                    </h2>
                    <div className="flex flex-wrap gap-1">
                      {display.map((cat) => (
                        <span
                          key={cat}
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            categoryColors[cat] || "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {cat}
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="text-sm text-gray-500 leading-relaxed flex-1">
                    {dialog.description || "Keine Beschreibung hinterlegt."}
                  </p>
                  <span className="text-xs font-medium text-primary">
                    Formular öffnen →
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
