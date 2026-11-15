import { HeartPulse, Siren } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { HelpResponse } from '../../../shared/api';
import { MOODS, type CheckIn, type Mood } from '../../../shared/types';
import { api, messageOf } from '../api/client';
import { usePreferences } from '../hooks/usePreferences';
import { useI18n } from '../i18n';
import { formatTime } from '../lib/format';
import { FormError } from './ui';

/** How long the help button must be held, so it is never pressed by accident. */
export const HOLD_MS = 2000;

const MOOD_FACE: Record<Mood, string> = { great: '😄', good: '🙂', okay: '😐', low: '😔', unwell: '🤒' };

/**
 * "I need help": press and hold for two seconds (mouse, touch, or Space/Enter)
 * to alert family and caretakers. Holding guards against accidental taps.
 */
export function HelpButton({ onSent }: { onSent: () => void }) {
  const { t } = useI18n();
  const { announce } = usePreferences();
  const hintId = useId();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [holding, setHolding] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const send = async () => {
    setHolding(false);
    try {
      const { notified } = await api.post<HelpResponse>('/help', {});
      const message = notified > 0 ? t('help.sent', { count: notified }) : t('help.sentNone');
      setResult(message);
      announce(message);
      onSent();
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const start = () => {
    if (holding) return;
    setError(null);
    setHolding(true);
    timer.current = setTimeout(() => void send(), HOLD_MS);
  };

  const cancel = () => {
    clearTimeout(timer.current);
    setHolding(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
      event.preventDefault();
      start();
    }
  };

  const onKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === ' ' || event.key === 'Enter') cancel();
  };

  return (
    <section className="card help-card" aria-labelledby={`${hintId}-title`}>
      <div className="help-card-text">
        <h2 id={`${hintId}-title`}>{t('help.title')}</h2>
        <p id={hintId} className="muted">
          {t('help.hint')}
        </p>
      </div>
      <button
        type="button"
        className="help-button"
        data-holding={holding}
        aria-describedby={hintId}
        onPointerDown={start}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className="help-button-fill" aria-hidden="true" />
        <Siren aria-hidden="true" />
        <span>{holding ? t('help.holding') : t('help.button')}</span>
      </button>
      {result && (
        <p className="help-result" role="status">
          {result}
        </p>
      )}
      <FormError message={error} />
    </section>
  );
}

interface CheckInProps {
  checkIn: CheckIn | null;
  elderView: boolean;
  elderName: string;
  timeZone: string;
  onSaved: () => void;
}

/** The elder's daily "How are you feeling?" check-in; family see the answer. */
export function CheckInCard({ checkIn, elderView, elderName, timeZone, onSaved }: CheckInProps) {
  const { t, locale, language } = useI18n();
  const { announce } = usePreferences();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const noteId = useId();
  const moodWord = (mood: Mood) => (language === 'en' ? t(`mood.${mood}`).toLowerCase() : t(`mood.${mood}`));

  const save = async (mood: Mood) => {
    setError(null);
    try {
      await api.post('/checkin', { mood, note });
      announce(t('checkin.saved', { mood: moodWord(mood) }));
      setEditing(false);
      setNote('');
      onSaved();
    } catch (err) {
      setError(messageOf(err));
    }
  };

  if (!elderView) {
    return (
      <section className="card checkin-card" aria-labelledby="checkin-title">
        <div className="card-head">
          <h2 id="checkin-title">{t('checkin.familyTitle', { name: elderName })}</h2>
          <HeartPulse aria-hidden="true" />
        </div>
        {checkIn ? (
          <p className="checkin-answer" data-mood={checkIn.mood}>
            <span className="checkin-face" aria-hidden="true">
              {MOOD_FACE[checkIn.mood]}
            </span>
            <span>
              {t('checkin.familySaid', {
                name: elderName,
                mood: moodWord(checkIn.mood),
                time: formatTime(checkIn.at, timeZone, locale),
              })}
              {checkIn.note && <span className="checkin-note">“{checkIn.note}”</span>}
            </span>
          </p>
        ) : (
          <p className="muted">{t('checkin.familyNone', { name: elderName })}</p>
        )}
      </section>
    );
  }

  const showPicker = editing || !checkIn;
  return (
    <section className="card checkin-card" aria-labelledby="checkin-title">
      <div className="card-head">
        <h2 id="checkin-title">{t('checkin.title')}</h2>
        <HeartPulse aria-hidden="true" />
      </div>
      {showPicker ? (
        <>
          <p className="muted">{t('checkin.lede')}</p>
          <div className="mood-grid" role="group" aria-label={t('checkin.title')}>
            {MOODS.map((mood) => (
              <button
                key={mood}
                type="button"
                className="mood-button"
                data-mood={mood}
                onClick={() => void save(mood)}
              >
                <span className="mood-face" aria-hidden="true">
                  {MOOD_FACE[mood]}
                </span>
                {t(`mood.${mood}`)}
              </button>
            ))}
          </div>
          <div className="field">
            <label htmlFor={noteId}>
              {t('checkin.note')} <span className="muted">({t('common.optional')})</span>
            </label>
            <input
              id={noteId}
              type="text"
              maxLength={200}
              value={note}
              placeholder={t('checkin.notePlaceholder')}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </>
      ) : (
        <div className="row">
          <p className="checkin-answer" data-mood={checkIn.mood}>
            <span className="checkin-face" aria-hidden="true">
              {MOOD_FACE[checkIn.mood]}
            </span>
            {t('checkin.youSaid', {
              mood: moodWord(checkIn.mood),
              time: formatTime(checkIn.at, timeZone, locale),
            })}
          </p>
          <button type="button" className="btn btn-ghost" onClick={() => setEditing(true)}>
            {t('checkin.change')}
          </button>
        </div>
      )}
      <FormError message={error} />
    </section>
  );
}
