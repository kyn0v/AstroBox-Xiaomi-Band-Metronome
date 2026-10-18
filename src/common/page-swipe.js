// Vela touch events bubble; swipe only recognizes quick flicks and does not bubble.
// Listen on the page, not an overlay. Native buttons still own taps and the native
// picker explicitly excludes its touch stream. No speed threshold for navigation.
function createPageSwipe(now) {
  now = now || (() => Date.now())
  let active = null
  let excluded = false
  let blockedUntil = 0

  function point(touch) {
    if (!touch || typeof touch.clientX !== 'number' || !isFinite(touch.clientX) ||
        typeof touch.clientY !== 'number' || !isFinite(touch.clientY)) return null
    return { x: touch.clientX, y: touch.clientY, id: touch.identifier }
  }
  function update(touch) {
    const p = point(touch)
    if (!active || !p || p.id !== active.start.id) return false
    active.last = p
    const dx = p.x - active.start.x
    const dy = p.y - active.start.y
    if (dx * dx + dy * dy > 12 * 12) active.moved = true
    if (!active.axis) {
      if (Math.abs(dx) >= 32 && Math.abs(dx) > Math.abs(dy) * 1.5) active.axis = 'x'
      else if (Math.abs(dy) >= 32 && Math.abs(dy) > Math.abs(dx) * 1.5) active.axis = 'y'
    }
    return true
  }
  return {
    exclude() { excluded = true; active = null },
    start(event) {
      active = null
      if (excluded) return
      const touches = event && event.touches
      if (!touches || touches.length !== 1) { excluded = true; return }
      const p = point(touches[0])
      if (p) active = { start: p, last: p, moved: false, axis: null }
    },
    move(event) {
      const touches = event && event.touches
      if (!touches || touches.length !== 1) { excluded = true; active = null; return }
      update(touches[0])
    },
    end(event) {
      const touches = event && event.changedTouches
      // An unrelated finger ending must never complete the primary gesture.
      if (active && touches && touches.length === 1 && touches[0].identifier !== active.start.id) return null
      const validEnd = touches && touches.length === 1 && update(touches[0])
      const gesture = active
      active = null
      if (excluded || (gesture && gesture.moved)) blockedUntil = now() + 350
      if (excluded) {
        if (!event || !event.touches || event.touches.length === 0) excluded = false
        return null
      }
      if (!validEnd || !gesture) return null
      const dx = gesture.last.x - gesture.start.x
      const dy = gesture.last.y - gesture.start.y
      if (gesture.axis === 'x' && Math.abs(dx) >= 36 && Math.abs(dx) > Math.abs(dy) * 1.5) return dx < 0 ? 'left' : 'right'
      if (gesture.axis === 'y' && Math.abs(dy) >= 36 && Math.abs(dy) > Math.abs(dx) * 1.5) return dy < 0 ? 'up' : 'down'
      return null
    },
    canClick() { return !excluded && !(active && active.moved) && now() >= blockedUntil },
    blockClicks() { blockedUntil = Math.max(blockedUntil, now() + 350) },
    cancel() { active = null; excluded = false; blockedUntil = 0 }
  }
}

module.exports = { createPageSwipe }
