interface Props {
  currentStep: number;
  totalSteps: number;
  isSubmitting: boolean;
  onBack: () => void;
  onNext: () => void;
  onJumpToStart: () => void;
}

export function Navigation({ currentStep, totalSteps, isSubmitting, onBack, onNext, onJumpToStart }: Props) {
  const isLast = currentStep === totalSteps - 1;
  const showBack = currentStep > 0;

  return (
    <div className="flex flex-col gap-3 pt-6 mt-6 border-t border-gray-200 sm:flex-row sm:justify-between sm:items-center">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={onBack}
          disabled={!showBack}
          className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          ← Zurück
        </button>
        <button
          type="button"
          onClick={onJumpToStart}
          disabled={!showBack}
          className="px-3 py-2 text-xs font-medium text-gray-500 border border-gray-200 rounded-md hover:bg-gray-50 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          ⇤ Zurück zum Anfang
        </button>
      </div>

      <span className="text-xs text-gray-400 order-first sm:order-none text-center">
        Schritt {currentStep + 1} von {totalSteps}
      </span>

      <button
        type="button"
        onClick={onNext}
        disabled={isSubmitting}
        className="px-5 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isSubmitting ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Wird gesendet…
          </span>
        ) : isLast ? (
          'Absenden →'
        ) : (
          'Weiter →'
        )}
      </button>
    </div>
  );
}
