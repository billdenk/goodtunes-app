import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PlayerProvider, usePlayer } from "@/context/PlayerContext";
import { NavVisibilityProvider } from "@/hooks/useNavVisibility";
import { useAuth } from "@/hooks/useAuth";
import { Player } from "@/pages/Player";
import { Login } from "@/pages/Login";
import { Collection } from "@/pages/Collection";
import { AlbumDetail } from "@/pages/AlbumDetail";
import { Playlists } from "@/pages/Playlists";
import { Account } from "@/pages/Account";
import { EditAccount } from "@/pages/EditAccount";
import { ArtistDetail } from "@/pages/ArtistDetail";
import { Chat, ChatThreadPage } from "@/pages/Chat";
import { Admin } from "@/pages/Admin";
import { AdminAlbums } from "@/pages/AdminAlbums";
import { AdminAlbum } from "@/pages/AdminAlbum";
import { AdminPeople } from "@/pages/AdminPeople";
import { AdminPerson } from "@/pages/AdminPerson";
import { AdminInstruments } from "@/pages/AdminInstruments";
import { AdminInstrument } from "@/pages/AdminInstrument";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#00062B] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <img src="/figmaAssets/--.svg" alt="GoodTunes" className="w-8 h-10 opacity-60" />
          <div className="w-6 h-6 border-2 border-[#319ED8] border-t-transparent rounded-full animate-spin" />
        </div>
      </main>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return <Component />;
}

function PlayerOverlay() {
  const { showPlayer } = usePlayer();
  if (!showPlayer) return null;
  return <Player />;
}

function Router() {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#00062B] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <img src="/figmaAssets/--.svg" alt="GoodTunes" className="w-8 h-10 opacity-60" />
          <div className="w-6 h-6 border-2 border-[#319ED8] border-t-transparent rounded-full animate-spin" />
        </div>
      </main>
    );
  }

  return (
    <>
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/register" component={Login} />
        <Route path="/collection">
          <ProtectedRoute component={Collection} />
        </Route>
        <Route path="/album/:id">
          <ProtectedRoute component={AlbumDetail} />
        </Route>
        <Route path="/artist/:slug">
          <ProtectedRoute component={ArtistDetail} />
        </Route>
        <Route path="/playlists">
          <ProtectedRoute component={Playlists} />
        </Route>
        <Route path="/chat">
          <ProtectedRoute component={Chat} />
        </Route>
        <Route path="/chat/:id">
          <ProtectedRoute component={ChatThreadPage} />
        </Route>
        <Route path="/account/edit">
          <ProtectedRoute component={EditAccount} />
        </Route>
        <Route path="/account">
          <ProtectedRoute component={Account} />
        </Route>
        {/* New per-album admin shell (Phase 1 — order matters: list these before
            the classic /admin route so wouter's Switch picks the more specific
            match first). The classic /admin route remains the source of truth
            for all editing until each tab is migrated. */}
        <Route path="/admin/albums/:id">
          <ProtectedRoute component={AdminAlbum} />
        </Route>
        <Route path="/admin/albums">
          <ProtectedRoute component={AdminAlbums} />
        </Route>
        <Route path="/admin/people/:id">
          <ProtectedRoute component={AdminPerson} />
        </Route>
        <Route path="/admin/people">
          <ProtectedRoute component={AdminPeople} />
        </Route>
        <Route path="/admin/instruments/:id">
          <ProtectedRoute component={AdminInstrument} />
        </Route>
        <Route path="/admin/instruments">
          <ProtectedRoute component={AdminInstruments} />
        </Route>
        <Route path="/admin">
          <ProtectedRoute component={Admin} />
        </Route>
        <Route path="/">
          {user ? <Redirect to="/collection" /> : <Redirect to="/login" />}
        </Route>
        <Route>
          {user ? <Redirect to="/collection" /> : <Redirect to="/login" />}
        </Route>
      </Switch>
      <PlayerOverlay />
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <PlayerProvider>
          <NavVisibilityProvider>
            <Toaster />
            <Router />
          </NavVisibilityProvider>
        </PlayerProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
