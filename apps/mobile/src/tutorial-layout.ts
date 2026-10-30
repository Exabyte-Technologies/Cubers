/** Reserve space for the phone header, checkpoint, cube and action row. Long
 * teaching copy scrolls inside its own area instead of moving the controls. */
export function tutorialLayout(
  width: number,
  height: number,
  top = 0,
  bottom = 0,
  fontScale = 1,
) {
  const compact = width < 700;
  const available = Math.max(260, height - top - bottom - 248);
  const cubeHeight = Math.max(120, Math.min(280, Math.floor(available * 0.48)));
  const coachingHeight = Math.max(140, Math.min(280, available - cubeHeight));
  return { compact, cubeHeight, coachingHeight, largeText: fontScale > 1.3 };
}
