// ArtistProjectsCreate — the beat right AFTER "GoodTunes® Direct confirmed":
// the artist lands on Projects with the name-your-project modal already open,
// overlaying the page (same overlay treatment as ArtistDirectConfirm).
// Name only — cover art comes later as an optional "Add artwork" on the
// project home (canon per Bill).

import { ArtistProjects } from './ArtistProjects';

export function ArtistProjectsCreate() {
  return <ArtistProjects startWithNameModal />;
}

export default ArtistProjectsCreate;
