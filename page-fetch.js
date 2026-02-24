/**
 * MAIN world script — runs in YouTube's JS context.
 *
 * Extracts the transcript params token from window.ytInitialData,
 * then fetches the actual segments via the InnerTube get_transcript API.
 */

function getTranscriptParams() {
  const panels = window.ytInitialData?.engagementPanels ?? [];

  for (const panel of panels) {
    const renderer = panel?.engagementPanelSectionListRenderer;
    if (!renderer) continue;

    // The params token is inside a continuationItemRenderer
    const params = renderer
      ?.content
      ?.continuationItemRenderer
      ?.continuationEndpoint
      ?.getTranscriptEndpoint
      ?.params;

    if (params) return params;
  }

  return null;
}

async function fetchTranscriptSegments(params) {
  // URL-decode the params token before sending (it may contain %3D etc.)
  const decodedParams = decodeURIComponent(params);

  const res = await fetch(
    'https://www.youtube.com/youtubei/v1/get_transcript?prettyPrint=false',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'ANDROID',
            clientVersion: '19.09.37',
            hl: 'en',
            gl: 'US'
          }
        },
        params: decodedParams
      })
    }
  );

  if (!res.ok) throw new Error('get_transcript API failed: HTTP ' + res.status);

  const data = await res.json();

  // New response path (YouTube changed from updateEngagementPanelAction to elementsCommand)
  const segments =
    data
      ?.actions?.[0]
      ?.elementsCommand
      ?.transformEntityCommand
      ?.arguments
      ?.transformTranscriptSegmentListArguments
      ?.overwrite
      ?.initialSegments ?? [];

  if (segments.length === 0) throw new Error('No transcript segments returned.');

  return segments
    .map(s => s?.transcriptSegmentRenderer?.snippet?.elementsAttributedString?.content ?? '')
    .filter(Boolean)
    .join(' ');
}

async function getTranscript() {
  const params = getTranscriptParams();
  if (!params) throw new Error('Transcript not available for this video.');
  return await fetchTranscriptSegments(params);
}

// Listen for requests from the ISOLATED world content script
window.addEventListener('message', async (event) => {
  if (!event.data || event.data.type !== 'yts-get-transcript') return;

  const { msgId } = event.data;
  try {
    const text = await getTranscript();
    window.postMessage(
      { type: 'yts-transcript-response', msgId, method: 'innertube', text },
      '*'
    );
  } catch (e) {
    window.postMessage(
      { type: 'yts-transcript-response', msgId, error: e.message },
      '*'
    );
  }
});
