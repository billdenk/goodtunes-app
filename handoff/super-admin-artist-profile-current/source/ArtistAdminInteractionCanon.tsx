import { ArtistDashboardAccountStack } from './ArtistDashboardAccountStack';

export default function ArtistAdminInteractionCanon() {
  return <ArtistDashboardAccountStack initialRole="artist" lockRole artistShell viewingAs />;
}