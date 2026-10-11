const SESSION_KEY = 'liuyao_analytics_session';

function getSessionId(): string {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function trackEvent(eventName: string, path = window.location.pathname) {
  if (window.location.hostname === 'data.liuyao.win' || path.startsWith('/data')) return;
  const payload = JSON.stringify({
    eventName,
    path,
    sessionId: getSessionId(),
    referrer: document.referrer,
  });
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/analytics/event', new Blob([payload], { type: 'application/json' }));
    return;
  }
  void fetch('/api/analytics/event', {
    method: 'POST', credentials: 'same-origin', keepalive: true,
    headers: { 'Content-Type': 'application/json' }, body: payload,
  });
}
