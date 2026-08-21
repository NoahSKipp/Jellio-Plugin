// Small time-of-day copy table for the Shows library's own coverflow
// header. Ported in spirit from Harbor's own shows hero-curation
// (dayBucket() plus a copy table sitting above its carousel): the
// reader's own local hour picks one of four moods, the library's own
// real content pool never changes because of it, only which line
// introduces it. Night's own three lines are Harbor's real ones, kept
// verbatim, that bucket is the one real feedback specifically named
// ("something late night... e.g see on Shows tab in harbor above
// carousel"); morning/afternoon/evening are written fresh in the same
// voice, past night that source's own exact copy was not something
// this session actually read.
const BUCKETS = [
  {
    start: 5,
    end: 12,
    icon: 'wb_sunny',
    label: 'Morning Briefing',
    tagline: 'Something to start the day',
    description: 'Lighter stories and quick episodes before the day gets going.',
  },
  {
    start: 12,
    end: 17,
    icon: 'wb_cloudy',
    label: 'Afternoon Lineup',
    tagline: 'A break worth taking',
    description: 'Easy watching for whenever the day gives you a minute.',
  },
  {
    start: 17,
    end: 22,
    icon: 'weekend',
    label: 'Prime Time',
    tagline: "Tonight's picks",
    description: 'The shows worth your full attention, right when you have it.',
  },
  {
    start: 22,
    end: 29,
    icon: 'bedtime',
    label: 'Insomnia Lineup',
    tagline: 'Worth the lost hour',
    description: 'Dense plots and rich worlds for when sleep is not happening.',
  },
];

export function showsEditorial(hour) {
  const h = hour < 5 ? hour + 24 : hour;
  const bucket =
    BUCKETS.filter(function (b) {
      return h >= b.start && h < b.end;
    })[0] || BUCKETS[2];
  return { icon: bucket.icon, label: bucket.label, tagline: bucket.tagline, description: bucket.description };
}
