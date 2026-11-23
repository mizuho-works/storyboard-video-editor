import type { ProjectPlaybackEngine } from '../rendering/useProjectPlaybackEngine';

const SPEEDS = [1, 1.5, 2, 0.5];

/** プレビュー再生の倍速(最大2倍)を切り替えるボタン。書き出しの動画の速度には影響しない。 */
export function PlaybackSpeedButton({ engine, className }: { engine: ProjectPlaybackEngine; className?: string }) {
  function cycle() {
    const i = SPEEDS.indexOf(engine.playbackRate);
    engine.setPlaybackRate(SPEEDS[(i + 1) % SPEEDS.length]);
  }
  return (
    <button
      type="button"
      className={className}
      onClick={cycle}
      title="プレビューの再生速度（書き出しには影響しません）"
      aria-label="プレビューの再生速度"
    >
      {engine.playbackRate}×
    </button>
  );
}
