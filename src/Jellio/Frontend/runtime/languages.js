// Real ISO 639-2/B codes, what MediaStream.Language actually carries
// (confirmed against Jellyfin's own MediaStream DTO before writing
// this), not a code a reader would recognize on sight. Shared between
// the subtitle track popover and the stream picker's own language
// filter chips rather than kept as two separate copies of the same map.
const LANGUAGE_NAMES = {
  eng: 'English', ger: 'German', deu: 'German', fre: 'French', fra: 'French',
  spa: 'Spanish', ita: 'Italian', jpn: 'Japanese', kor: 'Korean', chi: 'Chinese',
  zho: 'Chinese', rus: 'Russian', por: 'Portuguese', dut: 'Dutch', nld: 'Dutch',
  ara: 'Arabic', pol: 'Polish', swe: 'Swedish', tur: 'Turkish',
};

export function languageName(code) {
  if (!code) return 'Unknown';
  return LANGUAGE_NAMES[code.toLowerCase()] || code.toUpperCase();
}
