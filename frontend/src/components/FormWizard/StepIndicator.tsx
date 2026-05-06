import { Fragment } from 'react';
import type { FormStep } from '../../types/schema';

interface Props {
  steps: FormStep[];
  currentStep: number;
  // Highest step the user has reached so far. Forward navigation via the
  // indicator is only allowed up to this index (validation already passed).
  furthestStep: number;
  onNavigate: (index: number) => void;
}

export function StepIndicator({ steps, currentStep, furthestStep, onNavigate }: Props) {
  return (
    <div className="mb-8 px-2">
      {/* Outer container has horizontal padding so the active-state ring
          (-inset-1) never gets clipped by the parent bounds. */}
      <div className="flex items-start overflow-x-auto pb-2">
        {steps.map((step, index) => {
          const done = index < currentStep;
          const active = index === currentStep;
          const reachable = index <= furthestStep;
          const isLast = index === steps.length - 1;

          const circleClass = done
            ? 'bg-primary text-white hover:bg-primary-dark cursor-pointer'
            : active
            ? 'bg-primary text-white cursor-pointer'
            : reachable
            ? 'bg-gray-200 text-gray-500 hover:bg-gray-300 cursor-pointer'
            : 'bg-gray-200 text-gray-400 cursor-not-allowed';

          return (
            <Fragment key={step.id}>
              <div className="flex flex-col items-center min-w-[88px] flex-1 px-2">
                {/* Circle row: fixed height keeps every circle on the same
                    baseline regardless of title wrapping. */}
                <div className="h-10 flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => reachable && onNavigate(index)}
                    disabled={!reachable}
                    aria-current={active ? 'step' : undefined}
                    aria-label={`Schritt ${index + 1}: ${step.title}`}
                    className={`relative w-8 h-8 rounded-full text-sm font-semibold transition-colors flex items-center justify-center shrink-0 ${circleClass}`}
                  >
                    {/* Ring rendered as an absolute overlay so it doesn't
                        change the button's layout box. */}
                    {active && (
                      <span className="absolute -inset-1 rounded-full ring-2 ring-primary/40 pointer-events-none" />
                    )}
                    <span className="leading-none">{done ? '✓' : index + 1}</span>
                  </button>
                </div>

                {/* Title: fixed min-height, centered, max two lines so the
                    indicator never "jumps" when titles differ in length. */}
                <button
                  type="button"
                  onClick={() => reachable && onNavigate(index)}
                  disabled={!reachable}
                  className={`mt-1 px-1 text-xs leading-tight text-center min-h-[2.4rem] flex items-start justify-center w-full transition-colors ${
                    active
                      ? 'text-primary font-medium'
                      : reachable
                      ? 'text-gray-500 hover:text-primary cursor-pointer'
                      : 'text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <span className="line-clamp-2">{step.title}</span>
                </button>
              </div>

              {/* Connecting line as a sibling between two columns. Aligned
                  via mt to sit at the vertical centre of the circle row
                  (h-10 → centre at 20px → mt-5 = 1.25rem on a 0.5px line). */}
              {!isLast && (
                <div
                  className={`h-0.5 flex-shrink-0 self-start mt-[19px] transition-colors ${
                    done ? 'bg-primary' : 'bg-gray-200'
                  }`}
                  style={{ width: '24px', minWidth: '12px' }}
                />
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
