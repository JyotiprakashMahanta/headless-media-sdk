import { useState } from 'react';
import { useMediaActivity } from 'media-react';

/**
 * Proof that the app can track activity independently of the SDK's own console
 * listener.
 *
 * Both are attached at once: `logEvents` on the provider prints every event to
 * the console, and this panel subscribes separately. Neither knows about the
 * other, which is the property the emitter design is meant to give you.
 */
export function ActivityPanel(): JSX.Element {
  const [open, setOpen] = useState(false);
  const events = useMediaActivity({ limit: 30 });

  return (
    <aside className={`activity ${open ? 'open' : ''}`}>
      <button type="button" className="activity-toggle" onClick={() => setOpen((value) => !value)}>
        Activity ({events.length}){open ? ' ▾' : ' ▴'}
      </button>

      {open && (
        <ul className="activity-list">
          {events.length === 0 && <li className="activity-empty">Scroll or open an item…</li>}
          {events.map((event) => (
            <li key={`${event.type}-${event.at}-${Math.random()}`}>
              <code>{event.type}</code>{' '}
              {event.type === 'search' && `“${event.query}” · ${event.resultCount} results`}
              {event.type === 'view' && `${event.item.id} · ${event.surface}`}
              {event.type === 'download' && `${event.item.id} · ${event.surface}`}
              {event.type === 'error' && `${event.code}: ${event.message}`}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
