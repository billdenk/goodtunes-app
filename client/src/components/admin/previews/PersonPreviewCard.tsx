import { Star, Disc3 } from "lucide-react";
import { SiApplemusic, SiSpotify, SiInstagram, SiTiktok, SiFacebook, SiX } from "react-icons/si";
import { PhoneBezel } from "./PhoneBezel";

export interface PersonPreviewPerson {
  id: string;
  name: string;
  photoUrl: string | null;
  coverUrl: string | null;
  bio: string | null;
  labelId: string | null;
  appleMusicUrl: string | null;
  spotifyUrl: string | null;
  instagramUrl: string | null;
  tiktokUrl: string | null;
  twitterUrl: string | null;
  facebookUrl: string | null;
  websiteUrl: string | null;
}

export interface PersonPreviewAlbum {
  id: string;
  title: string;
  artist: string | null;
  artwork: string | null;
  year: number | null;
  type: string;
  primaryArtistId: string | null;
  isHidden: boolean;
}

/**
 * Apple-Music-style artist page at phone scale. Mirrors the LabelPreview
 * structure (hero · profile row · bio · albums grid) so admin previews
 * feel like one family. Uses the same shared `PhoneBezel`.
 *
 * Albums attached to this person are derived from the existing /api/albums
 * cache by primaryArtistId match (no extra fetch — same data the admin
 * Discography tab is already reading).
 */
export function PersonPreviewCard({
  person,
  albums,
  labelName,
}: {
  person: PersonPreviewPerson;
  albums: PersonPreviewAlbum[];
  labelName: string | null;
}) {
  const personAlbums = albums.filter(
    (a) => a.primaryArtistId === person.id && !a.isHidden,
  );

  const socials: { key: string; href: string; Icon: typeof SiSpotify; label: string }[] = [];
  if (person.appleMusicUrl)
    socials.push({ key: "apple", href: person.appleMusicUrl, Icon: SiApplemusic, label: "Apple Music" });
  if (person.spotifyUrl)
    socials.push({ key: "spotify", href: person.spotifyUrl, Icon: SiSpotify, label: "Spotify" });
  if (person.instagramUrl)
    socials.push({ key: "ig", href: person.instagramUrl, Icon: SiInstagram, label: "Instagram" });
  if (person.tiktokUrl)
    socials.push({ key: "tt", href: person.tiktokUrl, Icon: SiTiktok, label: "TikTok" });
  if (person.twitterUrl)
    socials.push({ key: "x", href: person.twitterUrl, Icon: SiX, label: "X" });
  if (person.facebookUrl)
    socials.push({ key: "fb", href: person.facebookUrl, Icon: SiFacebook, label: "Facebook" });

  const initials =
    (person.name || "?")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?";

  return (
    <PhoneBezel
      testId="preview-person"
      footer={
        <>
          Preview of the in-app ArtistDetail — {personAlbums.length}{" "}
          {personAlbums.length === 1 ? "album" : "albums"}.
        </>
      }
    >
      {/* Hero */}
      <div className="relative w-full" style={{ aspectRatio: "1 / 1.05" }}>
        {person.coverUrl ? (
          <img
            src={person.coverUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            data-testid="img-preview-person-cover"
          />
        ) : person.photoUrl ? (
          <img
            src={person.photoUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover blur-md scale-110"
            aria-hidden
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: "#00062B" }}
            aria-hidden
          />
        )}
        <div
          className="absolute inset-x-0 bottom-0 h-1/2"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,6,43,0) 0%, rgba(0,6,43,0.55) 35%, #00062B 70%, #00062B 100%)",
          }}
        />
      </div>

      {/* Profile row */}
      <div className="px-5 -mt-9 relative flex items-end gap-3">
        <div
          className="flex-shrink-0 w-[84px] h-[84px] rounded-full p-[3px]"
          style={{
            background:
              "linear-gradient(135deg, #4AFFCA 0%, #319ED8 50%, #7F10A7 100%)",
          }}
          data-testid="preview-person-avatar"
        >
          <div
            className="w-full h-full rounded-full overflow-hidden flex items-center justify-center"
            style={{ background: "#fff" }}
          >
            {person.photoUrl ? (
              <img
                src={person.photoUrl}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-[28px] font-bold" style={{ color: "#00062B" }}>
                {initials}
              </span>
            )}
          </div>
        </div>
        <div className="min-w-0 flex-1 pb-1">
          <div className="flex items-center gap-1.5">
            <h2
              className="text-white font-bold leading-tight tracking-tight line-clamp-2 break-words"
              style={{ fontSize: (person.name?.length ?? 0) > 18 ? 17 : 22 }}
              data-testid="text-preview-person-name"
            >
              {person.name || "Unnamed artist"}
            </h2>
            <Star className="w-4 h-4 flex-shrink-0" style={{ color: "#FF5470", fill: "#FF5470" }} />
          </div>
          {labelName && (
            <p className="text-[12.5px] mt-0.5" style={{ color: "rgba(235,235,245,0.7)" }}>
              {labelName}
            </p>
          )}
        </div>
      </div>

      {/* Bio */}
      {person.bio && (
        <div className="px-5 pt-4">
          <p
            className="text-[13px] leading-relaxed whitespace-pre-line line-clamp-5"
            style={{ color: "rgba(235,235,245,0.72)" }}
            data-testid="text-preview-person-bio"
          >
            {person.bio}
          </p>
        </div>
      )}

      {/* Socials */}
      {socials.length > 0 && (
        <div className="px-5 pt-4 flex flex-wrap gap-2">
          {socials.map(({ key, Icon, label }) => (
            <span
              key={key}
              className="inline-flex items-center justify-center w-9 h-9 rounded-full text-white/85"
              style={{ background: "rgba(255,255,255,0.10)" }}
              title={label}
              aria-label={label}
              data-testid={`preview-person-social-${key}`}
            >
              <Icon size={15} />
            </span>
          ))}
        </div>
      )}

      {/* Discography */}
      <div className="px-5 pt-5 pb-6">
        <h3 className="text-white text-[16px] font-bold leading-tight tracking-tight mb-3">
          Discography
        </h3>
        {personAlbums.length === 0 ? (
          <p
            className="text-[13px]"
            style={{ color: "rgba(235,235,245,0.5)" }}
          >
            No albums attached yet.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {personAlbums.map((a) => (
              <div
                key={a.id}
                className="flex flex-col text-left"
                data-testid={`preview-person-album-${a.id}`}
              >
                <div
                  className="aspect-square rounded-xl overflow-hidden"
                  style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}
                >
                  {a.artwork ? (
                    <img
                      src={a.artwork}
                      alt={a.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-white/40"
                      style={{ background: "rgba(255,255,255,0.06)" }}
                      aria-hidden
                    >
                      <Disc3 className="w-7 h-7" />
                    </div>
                  )}
                </div>
                <p className="text-white text-[12.5px] font-semibold leading-tight truncate mt-2">
                  {a.title}
                </p>
                <p
                  className="text-[11px] truncate mt-0.5"
                  style={{ color: "rgba(235,235,245,0.5)" }}
                >
                  {a.year ? `${a.year} · ${a.type}` : a.type}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </PhoneBezel>
  );
}
