// Full-screen overlay shown while a form submission is in flight. The
// backend doesn't stream progress, so we cycle through plausible status
// messages on a timer to make the wait feel less like nothing-is-happening.

import { useEffect, useState } from 'react';

const STAGES: { delay: number; text: string }[] = [
  { delay: 0,    text: 'Ihre Daten werden übermittelt …' },
  { delay: 2500, text: 'Dokumente werden erstellt …' },
  { delay: 6000, text: 'E-Mail wird versendet …' },
  { delay: 10000, text: 'Fast fertig …' },
];

interface Props {
  visible: boolean;
  error?: string | null;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export function SubmitOverlay({ visible, error, onRetry, onDismiss }: Props) {
  const [stageIdx, setStageIdx] = useState(0);

  useEffect(() => {
    if (!visible || error) {
      setStageIdx(0);
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    STAGES.forEach((stage, i) => {
      if (i === 0) return;
      timers.push(setTimeout(() => setStageIdx(i), stage.delay));
    });
    return () => timers.forEach(clearTimeout);
  }, [visible, error]);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-live="polite"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm px-4"
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 text-center hyphens-de">
        {error ? (
          <ErrorState error={error} onRetry={onRetry} onDismiss={onDismiss} />
        ) : (
          <ActiveState stage={stageIdx} />
        )}
      </div>
    </div>
  );
}

function ActiveState({ stage }: { stage: number }) {
  return (
    <>
      <div className="relative mx-auto mb-6 w-20 h-20">
        {/* Outer ring */}
        <div className="absolute inset-0 rounded-full border-4 border-primary/15"></div>
        {/* Spinning arc */}
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary border-r-primary animate-spin" />
        {/* Inner pulse dot */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-3 h-3 rounded-full bg-primary animate-pulse" />
        </div>
      </div>

      <h2 className="text-lg font-semibold text-gray-800 mb-3">
        Anfrage wird übermittelt
      </h2>

      <ul className="space-y-1.5 text-sm text-left max-w-xs mx-auto">
        {STAGES.map((s, i) => {
          const done = i < stage;
          const active = i === stage;
          return (
            <li
              key={i}
              className={`flex items-center gap-2 transition-colors ${
                done ? 'text-emerald-700' : active ? 'text-primary font-medium' : 'text-gray-400'
              }`}
            >
              <span className="w-4 h-4 shrink-0 flex items-center justify-center">
                {done ? (
                  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : active ? (
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-gray-300" />
                )}
              </span>
              <span>{s.text}</span>
            </li>
          );
        })}
      </ul>

      <p className="mt-6 text-xs text-gray-400">
        Bitte schließen Sie das Fenster nicht.
      </p>
    </>
  );
}

function ErrorState({
  error, onRetry, onDismiss,
}: { error: string; onRetry?: () => void; onDismiss?: () => void }) {
  return (
    <>
      <div className="mx-auto mb-5 w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
        <svg className="w-8 h-8 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-gray-800 mb-2">
        Übermittlung fehlgeschlagen
      </h2>
      <p className="text-sm text-gray-600 mb-6">
        {error}
      </p>
      <div className="flex gap-2 justify-center">
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            Schließen
          </button>
        )}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-md transition-colors"
          >
            Erneut versuchen
          </button>
        )}
      </div>
    </>
  );
}
