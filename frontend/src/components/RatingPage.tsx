import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  getRatingSession,
  submitRating,
  type PublicRatingSession,
  type RatingAnswer,
  type RatingQuestion,
  type SubmitResponse,
} from '../lib/ratingApi';

type DraftValue = number | string | null;

function StarsField({
  question,
  value,
  onChange,
}: {
  question: RatingQuestion;
  value: number | null;
  onChange: (v: number) => void;
}) {
  const max = question.maxValue ?? 5;
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => {
        const active = value != null && n <= value;
        return (
          <button
            key={n}
            type="button"
            aria-label={`${n} von ${max} Sternen`}
            onClick={() => onChange(n)}
            className={`text-3xl leading-none transition-colors ${
              active ? 'text-amber-500' : 'text-gray-300 hover:text-amber-300'
            }`}
          >
            ★
          </button>
        );
      })}
    </div>
  );
}

function ScaleField({
  question,
  value,
  onChange,
}: {
  question: RatingQuestion;
  value: number | null;
  onChange: (v: number) => void;
}) {
  const min = question.minValue ?? 1;
  const max = question.maxValue ?? 10;
  const items: number[] = [];
  for (let i = min; i <= max; i++) items.push(i);
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`min-w-[2.5rem] h-10 rounded border px-3 text-sm font-medium transition-colors ${
            value === n
              ? 'border-primary bg-primary text-white'
              : 'border-gray-300 bg-white text-gray-700 hover:border-primary'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function YesNoField({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => onChange(1)}
        className={`px-4 py-2 rounded border text-sm font-medium transition-colors ${
          value === 1
            ? 'border-primary bg-primary text-white'
            : 'border-gray-300 bg-white text-gray-700 hover:border-primary'
        }`}
      >
        Ja
      </button>
      <button
        type="button"
        onClick={() => onChange(0)}
        className={`px-4 py-2 rounded border text-sm font-medium transition-colors ${
          value === 0
            ? 'border-primary bg-primary text-white'
            : 'border-gray-300 bg-white text-gray-700 hover:border-primary'
        }`}
      >
        Nein
      </button>
    </div>
  );
}

function TextField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <textarea
      className="w-full min-h-[100px] rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Ihre Anmerkungen ..."
    />
  );
}

export function RatingPage() {
  const { token } = useParams<{ token: string }>();
  const [session, setSession] = useState<PublicRatingSession | null>(null);
  const [draft, setDraft] = useState<Record<string, DraftValue>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [thanks, setThanks] = useState<SubmitResponse | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    getRatingSession(token)
      .then((sess) => {
        if (cancelled) return;
        setSession(sess);
        if (sess.status === 'submitted') {
          setThanks({
            submittedAt: sess.submittedAt,
            overallScore: sess.overallScore,
            thanksText: sess.thanksText ?? 'Vielen Dank für Ihre Rückmeldung.',
            thanksLink:
              sess.thresholdScore != null &&
              sess.overallScore != null &&
              sess.overallScore >= sess.thresholdScore &&
              sess.thanksLinkUrl
                ? { label: sess.thanksLinkLabel ?? 'Mehr erfahren', url: sess.thanksLinkUrl }
                : null,
          });
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-400">Bewertungsbogen wird geladen …</p>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded shadow p-6 text-center">
          <h1 className="text-lg font-semibold text-gray-800 mb-2">
            Bewertungsbogen nicht verfügbar
          </h1>
          <p className="text-sm text-gray-600">
            {error ?? 'Der Bewertungsbogen wurde nicht gefunden oder ist abgelaufen.'}
          </p>
        </div>
      </div>
    );
  }

  if (thanks) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded shadow p-8 text-center">
          <div className="text-4xl mb-3">✓</div>
          <h1 className="text-lg font-semibold text-gray-800 mb-3">Vielen Dank!</h1>
          <p className="text-sm text-gray-700 whitespace-pre-line mb-4">{thanks.thanksText}</p>
          {thanks.thanksLink && (
            <a
              href={thanks.thanksLink.url}
              target="_blank"
              rel="noreferrer"
              className="inline-block bg-primary text-white text-sm font-medium px-4 py-2 rounded hover:opacity-90"
            >
              {thanks.thanksLink.label}
            </a>
          )}
        </div>
      </div>
    );
  }

  const sortedQuestions = [...session.questions].sort(
    (a, b) => (a.orderNo ?? 0) - (b.orderNo ?? 0),
  );

  function setAnswer(question: RatingQuestion, value: DraftValue) {
    setDraft((prev) => ({ ...prev, [String(question.id)]: value }));
  }

  function isComplete(): boolean {
    for (const q of sortedQuestions) {
      if (q.isRequired === false) continue;
      const v = draft[String(q.id)];
      if (q.type === 'text') {
        if (typeof v !== 'string' || v.trim() === '') return false;
      } else {
        if (v == null) return false;
      }
    }
    return true;
  }

  async function handleSubmit() {
    if (!session || !token) return;
    setSubmitting(true);
    try {
      const answers: RatingAnswer[] = sortedQuestions.map((q) => {
        const v = draft[String(q.id)];
        if (q.type === 'text') {
          return {
            idRatingFormQuestion: q.id,
            AnswerNumeric: null,
            AnswerText: typeof v === 'string' ? v : null,
          };
        }
        return {
          idRatingFormQuestion: q.id,
          AnswerNumeric: typeof v === 'number' ? v : null,
          AnswerText: null,
        };
      });
      const result = await submitRating(token, answers);
      setThanks(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const greeting =
    session.recipient.firstName || session.recipient.lastName
      ? `Sehr geehrte/r ${[session.recipient.firstName, session.recipient.lastName]
          .filter(Boolean)
          .join(' ')}`
      : 'Sehr geehrte Damen und Herren';

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded shadow">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-xl font-semibold text-gray-800">{session.formTitle}</h1>
          <p className="text-sm text-gray-600 mt-2">{greeting},</p>
          <p className="text-sm text-gray-600 mt-1">
            Ihre Rückmeldung hilft uns, unsere Arbeit weiter zu verbessern. Vielen Dank, dass Sie
            sich kurz Zeit nehmen.
          </p>
        </div>
        <div className="p-6 space-y-6">
          {sortedQuestions.map((q) => {
            const v = draft[String(q.id)];
            return (
              <div key={String(q.id)}>
                <label className="block text-sm font-medium text-gray-800 mb-2">
                  {q.label}
                  {q.isRequired === false && (
                    <span className="text-xs text-gray-400 ml-2">(optional)</span>
                  )}
                </label>
                {q.type === 'stars' && (
                  <StarsField
                    question={q}
                    value={typeof v === 'number' ? v : null}
                    onChange={(n) => setAnswer(q, n)}
                  />
                )}
                {q.type === 'scale' && (
                  <ScaleField
                    question={q}
                    value={typeof v === 'number' ? v : null}
                    onChange={(n) => setAnswer(q, n)}
                  />
                )}
                {q.type === 'yesno' && (
                  <YesNoField
                    value={typeof v === 'number' ? v : null}
                    onChange={(n) => setAnswer(q, n)}
                  />
                )}
                {q.type === 'text' && (
                  <TextField
                    value={typeof v === 'string' ? v : ''}
                    onChange={(t) => setAnswer(q, t)}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="p-6 border-t border-gray-200 flex justify-end">
          <button
            type="button"
            disabled={!isComplete() || submitting}
            onClick={handleSubmit}
            className="bg-primary text-white text-sm font-medium px-6 py-2 rounded hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Wird gesendet …' : 'Bewertung absenden'}
          </button>
        </div>
      </div>
    </div>
  );
}
