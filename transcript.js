/**
 * Transcript fetching — ISOLATED world content script.
 * Sends a request to page-fetch.js (MAIN world) via postMessage,
 * then parses the response depending on which method was used.
 */

/**
 * Extract video ID from the current YouTube URL.
 * @returns {string|null}
 */
function getVideoId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('v');
}

/**
 * Parse caption XML text into plain transcript string.
 * Uses DOMParser — more robust than regex.
 * @param {string} xmlText
 * @returns {string}
 */
function parseTranscriptXml(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  const nodes = Array.from(doc.getElementsByTagName('text'));

  if (nodes.length === 0) {
    throw new Error('Could not parse captions. Preview: ' + xmlText.slice(0, 300));
  }

  return nodes
    .map(node =>
      node.textContent
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
        .replace(/<[^>]*>/g, '')
        .trim()
    )
    .filter(Boolean)
    .join(' ');
}

/**
 * Request the transcript from the MAIN world script (page-fetch.js).
 * Passes the videoId so page-fetch.js can handle pot token caching.
 * @param {string} videoId
 * @returns {Promise<{ method: 'json'|'xml', text: string }>}
 */
function requestTranscript(videoId) {
  return new Promise((resolve, reject) => {
    const msgId = 'yts-' + Date.now() + '-' + Math.random();

    function handler(event) {
      if (
        event.data &&
        event.data.type === 'yts-transcript-response' &&
        event.data.msgId === msgId
      ) {
        window.removeEventListener('message', handler);
        if (event.data.error) {
          reject(new Error(event.data.error));
        } else {
          resolve({ method: event.data.method, text: event.data.text });
        }
      }
    }

    window.addEventListener('message', handler);
    window.postMessage({ type: 'yts-get-transcript', msgId, videoId }, '*');

    setTimeout(() => {
      window.removeEventListener('message', handler);
      reject(new Error('Transcript request timed out after 15 seconds.'));
    }, 15000);
  });
}

/**
 * Fetch and return the plain-text transcript for the current video.
 * @returns {Promise<string>}
 */
async function fetchTranscript() {
  const videoId = getVideoId();
  if (!videoId) throw new Error('Could not determine video ID from URL.');

  const { method, text } = await requestTranscript(videoId);

  if (!text || text.trim().length === 0) {
    throw new Error('Transcript data was empty.');
  }

  // All methods return plain text — use directly
  return text;
}
