import { ExternalLink, Guitar } from "lucide-react";
import { PhoneBezel } from "./PhoneBezel";

export interface InstrumentPreviewVendor {
  id: string;
  name: string;
  logoUrl: string | null;
  tagline: string | null;
  affiliateUrl: string;
}

export interface InstrumentPreviewInstrument {
  id: string;
  name: string;
  category: string;
  shortCategory: string | null;
  photoUrl: string | null;
  about: string | null;
  artistNote: string | null;
  vendors: InstrumentPreviewVendor[];
}

/**
 * Apple-Music-style InstrumentSheet preview at phone scale. Mirrors the
 * sheet a fan sees after tapping an instrument inside a SuperCredits™
 * row: large photo, name + category, About paragraph, optional artist
 * note quote-block, and the vendor list at the bottom (each with a
 * "Discover more / Buy" chevron — affiliate target).
 */
export function InstrumentPreviewCard({
  instrument,
}: {
  instrument: InstrumentPreviewInstrument;
}) {
  const vendors = instrument.vendors ?? [];
  return (
    <PhoneBezel
      testId="preview-instrument"
      footer={
        <>
          Preview of the in-app InstrumentSheet — {vendors.length}{" "}
          {vendors.length === 1 ? "vendor" : "vendors"}.
        </>
      }
    >
      <div className="px-5 pt-3 pb-6">
        {/* Drag handle (visual only) */}
        <div className="flex justify-center mb-3">
          <span
            className="block w-9 h-1 rounded-full"
            style={{ background: "rgba(255,255,255,0.25)" }}
            aria-hidden
          />
        </div>

        {/* Photo */}
        <div
          className="w-full aspect-square rounded-2xl overflow-hidden bg-white/5"
          style={{ boxShadow: "0 12px 40px rgba(0,0,0,0.55)" }}
          data-testid="img-preview-instrument-photo"
        >
          {instrument.photoUrl ? (
            <img
              src={instrument.photoUrl}
              alt={instrument.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-white/30"
              aria-hidden
            >
              <Guitar className="w-16 h-16" />
            </div>
          )}
        </div>

        {/* Name + category */}
        <div className="mt-4 text-center">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.1em]"
            style={{ color: "rgba(235,235,245,0.55)" }}
          >
            {instrument.shortCategory || instrument.category || "Gear"}
          </p>
          <h2
            className="text-white text-[22px] font-bold leading-tight tracking-tight mt-1"
            data-testid="text-preview-instrument-name"
          >
            {instrument.name || "Unnamed gear"}
          </h2>
        </div>

        {/* About */}
        {instrument.about && (
          <div className="mt-4">
            <p
              className="text-[13px] leading-relaxed whitespace-pre-line line-clamp-6"
              style={{ color: "rgba(235,235,245,0.72)" }}
              data-testid="text-preview-instrument-about"
            >
              {instrument.about}
            </p>
          </div>
        )}

        {/* Artist note (quote-block) */}
        {instrument.artistNote && (
          <div
            className="mt-4 px-4 py-3 rounded-xl border-l-2"
            style={{
              borderColor: "#319ED8",
              background: "rgba(49,158,216,0.08)",
            }}
            data-testid="text-preview-instrument-artistnote"
          >
            <p
              className="text-[12.5px] italic leading-relaxed line-clamp-5"
              style={{ color: "rgba(235,235,245,0.85)" }}
            >
              "{instrument.artistNote}"
            </p>
          </div>
        )}

        {/* Vendors */}
        <div className="mt-5">
          <h3
            className="text-[11px] font-semibold uppercase tracking-[0.1em] mb-2"
            style={{ color: "rgba(235,235,245,0.55)" }}
          >
            Discover more / Buy
          </h3>
          {vendors.length === 0 ? (
            <p
              className="text-[12.5px] py-3"
              style={{ color: "rgba(235,235,245,0.45)" }}
            >
              No vendors attached yet. Add one on the Vendors tab.
            </p>
          ) : (
            <div className="space-y-2">
              {vendors.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                  data-testid={`preview-instrument-vendor-${v.id}`}
                >
                  <div
                    className="w-9 h-9 rounded-md overflow-hidden flex-shrink-0 flex items-center justify-center"
                    style={{ background: "#fff" }}
                  >
                    {v.logoUrl ? (
                      <img
                        src={v.logoUrl}
                        alt=""
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <span className="text-[11px] font-bold" style={{ color: "#00062B" }}>
                        {(v.name || "?").charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-[13px] font-semibold truncate">
                      {v.name}
                    </p>
                    {v.tagline && (
                      <p
                        className="text-[11px] truncate mt-0.5"
                        style={{ color: "rgba(235,235,245,0.55)" }}
                      >
                        {v.tagline}
                      </p>
                    )}
                  </div>
                  <ExternalLink
                    className="w-4 h-4 flex-shrink-0"
                    style={{ color: "rgba(235,235,245,0.5)" }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PhoneBezel>
  );
}
