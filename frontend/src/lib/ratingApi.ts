/**
 * Public Rating-API (kein Auth, Token in der URL).
 */

const apiUrl = (import.meta.env.VITE_API_URL ?? '') as string;

export type RatingQuestionType = 'stars' | 'scale' | 'yesno' | 'text';

export interface RatingQuestion {
  id: number | string;
  label: string;
  type: RatingQuestionType;
  minValue?: number | null;
  maxValue?: number | null;
  isRequired?: boolean;
  orderNo?: number;
  countsForOverall?: boolean;
}

export interface PublicRatingSession {
  token: string;
  status: 'pending' | 'submitted' | 'expired';
  formTitle: string;
  questions: RatingQuestion[];
  thresholdScore: number | null;
  thanksText: string | null;
  thanksLinkLabel: string | null;
  thanksLinkUrl: string | null;
  recipient: {
    firstName: string | null;
    lastName: string | null;
  };
  submittedAt: string | null;
  overallScore: number | null;
  expiresAt: string | null;
}

export interface RatingAnswer {
  idRatingFormQuestion: number | string;
  AnswerNumeric?: number | null;
  AnswerText?: string | null;
}

export interface SubmitResponse {
  submittedAt: string | null;
  overallScore: number | null;
  thanksText: string;
  thanksLink: { label: string; url: string } | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    let message = `Anfrage fehlgeschlagen (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      /* nichts */
    }
    const err = new Error(message) as Error & { status?: number };
    err.status = response.status;
    throw err;
  }
  return response.json() as Promise<T>;
}

export function getRatingSession(token: string): Promise<PublicRatingSession> {
  return request(`/api/rating/${encodeURIComponent(token)}`);
}

export function submitRating(token: string, answers: RatingAnswer[]): Promise<SubmitResponse> {
  return request(`/api/rating/${encodeURIComponent(token)}/submit`, {
    method: 'POST',
    body: JSON.stringify({ answers }),
  });
}
