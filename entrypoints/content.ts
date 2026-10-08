import { startSummaries } from '../utils/fairgrit';

export default defineContentScript({
  matches: ['https://gigooo.fairgrit.com/*'],
  world: 'MAIN',
  runAt: 'document_idle',
  main: startSummaries,
});
