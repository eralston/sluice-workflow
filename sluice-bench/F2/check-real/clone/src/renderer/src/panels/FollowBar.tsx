// Follow mode (05 §6) and the frame-the-action camera (slice 3b): what the camera is doing on its own,
// and how to take it back. "Following" is perspective, never an assignment (INV-07, INV-08).
import { resumeFollow, toggleFraming, unfollow } from '../playback';
import { useChart } from '../store';

export function FollowBar() {
  const follow = useChart((s) => s.follow);
  const framing = useChart((s) => s.framing);
  const playing = useChart((s) => s.playback?.status === 'playing');
  if (!follow && !(framing === 'suspended' && playing)) return null;
  return (
    <div className="follow-bar" role="status" aria-live="polite">
      {follow && (
        <div className="follow-bar__row">
          <span className="follow-bar__label">
            Following <b>{follow.callSign}</b>{follow.text ? <>: <span className="follow-bar__event">{follow.text}</span></> : null}
          </span>
          {follow.suspended && <button type="button" className="follow-bar__btn follow-bar__btn--resume" onClick={resumeFollow}>Resume Follow</button>}
          <button type="button" className="follow-bar__btn" onClick={unfollow}>Unfollow</button>
        </div>
      )}
      {follow?.note && <div className="follow-bar__note">{follow.note}</div>}
      {framing === 'suspended' && playing && (
        <button type="button" className="follow-bar__btn follow-bar__chip" onClick={toggleFraming} title="Pan or zoom out to keep each big moment in view (Z)">
          Keep in view (Z)
        </button>
      )}
    </div>
  );
}
